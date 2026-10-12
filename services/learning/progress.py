"""Progress: grades and feedback, what-if, CGPA/SGPA, mastery by topic, and the credit tracker (programme,
ABC/APAAR, SWAYAM/NPTEL transfer).

Grade maths lives in small pure functions so the web app's what-if calculator can mirror them exactly.
"""

from __future__ import annotations

import math
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import db
from services.learning.enrolment import Enrolment, my_course, my_courses, student_enrolment, teacher_enrolment
from services.learning.files import describe_many, owned_attachments
from services.learning.models import (
    Assessment,
    Assignment,
    Attempt,
    AttemptAnswer,
    Course,
    CourseResult,
    CreditTransferRequest,
    MoocCourse,
    Programme,
    Question,
    StudentProgramme,
    Submission,
    Topic,
)
from services.learning.trail import trail_event
from services.shared.audit import AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import Conflict, NotFound, ValidationFailed
from services.shared.schemas import CamelModel

router = APIRouter()

# ---- grade maths (pure) ----

# UGC choice-based credit system, 10-point scale: (minimum percent, grade, grade point), highest first.
GRADE_SCALE: tuple[tuple[float, str, float], ...] = (
    (90, "O", 10), (80, "A+", 9), (70, "A", 8), (60, "B+", 7), (50, "B", 6), (45, "C", 5), (40, "P", 4),
)
FAIL_GRADE = ("F", 0.0)
# Used when a course doesn't set its own weights.
DEFAULT_WEIGHTS: dict[str, float] = {"Assignments": 40, "Quizzes": 20, "Mid-term": 40}
NPTEL_PASS_PERCENT = 40


@dataclass(frozen=True)
class CategoryScore:
    name: str
    weight: float
    earned: float
    max: float


def grade_for(percent: float) -> tuple[str, float]:
    """The letter grade and grade point for a percentage; cut-offs are inclusive (exactly 90 is an O)."""
    for minimum, grade, point in GRADE_SCALE:
        if percent >= minimum:
            return grade, point
    return FAIL_GRADE


def course_percentage(categories: list[CategoryScore]) -> float | None:
    """Weighted course percentage. Categories with nothing graded yet are left out and the remaining
    weights re-normalised, so an early grade reflects only the work marked so far."""
    graded = [c for c in categories if c.max > 0 and c.weight > 0]
    total_weight = sum(c.weight for c in graded)
    if not total_weight:
        return None
    return sum(c.weight * c.earned / c.max for c in graded) / total_weight * 100


def grade_point_average(results: list[tuple[int, float]]) -> float | None:
    """SGPA/CGPA: credit-weighted mean of grade points. Failed courses count here (with 0 points)."""
    credits = sum(c for c, _ in results)
    if not credits:
        return None
    return round(sum(c * gp for c, gp in results) / credits, 2)


def earned_credits(results: list[CourseResult]) -> int:
    """Credits actually earned: a failed course gives none."""
    return sum(r.credits for r in results if r.grade != FAIL_GRADE[0])


# Season order inside a year, so "2026 Spring" sorts before "2026 Autumn".
SEASONS = ("winter", "spring", "summer", "monsoon", "autumn", "fall")


def term_order(term: str) -> tuple[int, int, tuple[tuple[int, int | str], ...]]:
    """Year, then season, then the name read naturally ("Sem 2" before "Sem 10")."""
    year = re.search(r"[0-9]{4}", term)
    season = next((i for i, s in enumerate(SEASONS) if s in term.lower()), len(SEASONS))
    natural = tuple((0, int(part)) if part.isdigit() else (1, part.lower())
                    for part in re.split(r"([0-9]+)", term) if part)
    return (int(year.group()) if year else 0, season, natural)


def _scale() -> list[dict]:
    return [{"grade": g, "min": m, "point": p} for m, g, p in GRADE_SCALE] + [
        {"grade": FAIL_GRADE[0], "min": 0, "point": FAIL_GRADE[1]}]


# ---- course grades ----

@dataclass(frozen=True)
class GradedItem:
    id: str
    kind: str  # assignment | assessment
    title: str
    category: str
    score: float
    max: float
    feedback: str | None
    graded_at: datetime | None
    feedback_ready: bool


async def _graded_items(session: AsyncSession, me: Enrolment, course_ids: list[uuid.UUID]) -> dict[uuid.UUID,
                                                                                                    list[GradedItem]]:
    """Every marked piece of work per course: graded assignments and the best attempt at graded tests."""
    items: dict[uuid.UUID, list[GradedItem]] = defaultdict(list)
    if not course_ids:
        return items
    for submission, assignment in (await session.execute(
        select(Submission, Assignment).join(Assignment, Assignment.id == Submission.assignment_id)
        .where(Submission.person_id == me.person_id, Submission.status == "graded",
               Assignment.course_id.in_(course_ids))
    )).all():
        items[assignment.course_id].append(GradedItem(
            id=str(assignment.id), kind="assignment", title=assignment.title, category=assignment.grade_category,
            score=float(submission.score or 0), max=float(assignment.points), feedback=submission.feedback,
            graded_at=submission.graded_at,
            feedback_ready=bool(submission.feedback) and submission.feedback_seen_at is None,
        ))
    best: dict[uuid.UUID, tuple[Attempt, Assessment]] = {}
    for attempt, assessment in (await session.execute(
        select(Attempt, Assessment).join(Assessment, Assessment.id == Attempt.assessment_id)
        .where(Attempt.person_id == me.person_id, Attempt.status == "submitted",
               Assessment.counts_toward_grade.is_(True), Assessment.course_id.in_(course_ids),
               Assessment.owner_id.is_(None))
    )).all():
        current = best.get(assessment.id)
        if current is None or (attempt.score or 0) > (current[0].score or 0):
            best[assessment.id] = (attempt, assessment)
    for attempt, assessment in best.values():
        items[assessment.course_id].append(GradedItem(
            id=str(assessment.id), kind="assessment", title=assessment.title, category=assessment.grade_category,
            score=max(float(attempt.score or 0), 0.0), max=float(attempt.max_score or 0), feedback=None,
            graded_at=attempt.submitted_at, feedback_ready=False,
        ))
    return items


def _categories(items: list[GradedItem]) -> list[CategoryScore]:
    names = list(DEFAULT_WEIGHTS) + sorted({i.category for i in items} - set(DEFAULT_WEIGHTS))
    return [CategoryScore(name=name, weight=DEFAULT_WEIGHTS.get(name, 0),
                          earned=sum(i.score for i in items if i.category == name),
                          max=sum(i.max for i in items if i.category == name)) for name in names]


PERCENT_DECIMALS = 1


def _course_grade(items: list[GradedItem]) -> dict:
    """The grade comes from the percentage as shown, so 89.96 (shown 90.0) is an O, not an A+."""
    percent = course_percentage(_categories(items))
    if percent is None:
        return {"percent": None, "grade": None, "gradePoint": None}
    shown = round(percent, PERCENT_DECIMALS)
    grade, point = grade_for(shown)
    return {"percent": shown, "grade": grade, "gradePoint": point}


def _course_ref(course: Course) -> dict:
    return {"id": str(course.id), "code": course.code, "title": course.title, "subject": course.subject,
            "credits": course.credits, "category": course.category, "term": course.term}


async def _results(session: AsyncSession, me: Enrolment) -> list[CourseResult]:
    return list((await session.execute(
        select(CourseResult).where(CourseResult.person_id == me.person_id,
                                   CourseResult.institution_id == me.institution_id)
    )).scalars())


def _record(results: list[CourseResult]) -> dict:
    by_term: dict[str, list[CourseResult]] = defaultdict(list)
    for result in results:
        by_term[result.term].append(result)
    terms = [{
        "term": term,
        "sgpa": grade_point_average([(r.credits, r.grade_point) for r in rows]),
        "credits": earned_credits(rows),
        "courses": [{"code": r.code, "title": r.title, "credits": r.credits, "grade": r.grade,
                     "gradePoint": r.grade_point, "source": r.source} for r in rows],
    } for term, rows in sorted(by_term.items(), key=lambda kv: term_order(kv[0]))]
    return {"cgpa": grade_point_average([(r.credits, r.grade_point) for r in results]),
            "creditsEarned": earned_credits(results), "terms": terms}


@router.get("/student/progress")
async def progress(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    courses = await my_courses(session, me)
    items = await _graded_items(session, me, [c.id for c in courses])
    current = [{**_course_ref(c), **_course_grade(items[c.id]), "gradedItems": len(items[c.id]),
                "feedbackReady": sum(i.feedback_ready for i in items[c.id])} for c in courses]
    return {"courses": current, "feedbackReady": sum(c["feedbackReady"] for c in current),
            "record": _record(await _results(session, me)), "scale": _scale()}


@router.get("/student/progress/courses/{course_id}")
async def course_progress(
    course_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Marks by category, plus the inputs the what-if calculator needs (weights, earned, max)."""
    me = await student_enrolment(request, ctx)
    course = await my_course(session, me, course_id)
    items = sorted((await _graded_items(session, me, [course.id]))[course.id],
                   key=lambda i: i.graded_at or datetime.min.replace(tzinfo=UTC), reverse=True)
    return {
        "course": _course_ref(course), **_course_grade(items),
        "categories": [{"name": c.name, "weight": c.weight, "earned": c.earned, "max": c.max,
                        "percent": round(c.earned / c.max * 100, 1) if c.max else None}
                       for c in _categories(items)],
        "items": [{"id": i.id, "kind": i.kind, "title": i.title, "category": i.category, "score": i.score,
                   "max": i.max, "feedback": i.feedback, "feedbackReady": i.feedback_ready,
                   "gradedAt": i.graded_at.isoformat() if i.graded_at else None} for i in items],
        "scale": _scale(),
    }


# ---- mastery ----

MASTERY_HALF_LIFE_DAYS = 14  # an answer two weeks old counts half as much as one from today
MASTERY_LOOKBACK = timedelta(days=28)
MASTERED_ACCURACY, PROFICIENT_ACCURACY, FAMILIAR_ACCURACY = 0.8, 0.7, 0.5
MASTERED_MIN_ANSWERS = 6
UNASSISTED_KINDS = frozenset({"exam_check", "mock"})


@dataclass(frozen=True)
class MarkedAnswer:
    topic_id: uuid.UUID
    correct: bool
    answered_at: datetime
    unassisted: bool


def mastery_level(answers: list[MarkedAnswer], as_of: datetime) -> tuple[str, float | None]:
    """Level from answers given up to `as_of`, weighting recent ones more, so mastery can drop."""
    counted = [a for a in answers if a.answered_at <= as_of]
    if not counted:
        return "not_started", None
    weights = [0.5 ** ((as_of - a.answered_at).total_seconds() / 86_400 / MASTERY_HALF_LIFE_DAYS) for a in counted]
    accuracy = sum(w for w, a in zip(weights, counted, strict=True) if a.correct) / sum(weights)
    if (accuracy >= MASTERED_ACCURACY and len(counted) >= MASTERED_MIN_ANSWERS
            and any(a.unassisted for a in counted)):
        level = "mastered"
    elif accuracy >= PROFICIENT_ACCURACY:
        level = "proficient"
    elif accuracy >= FAMILIAR_ACCURACY:
        level = "familiar"
    else:
        level = "attempted"
    return level, round(accuracy * 100, 1)


@router.get("/student/mastery")
async def mastery(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    courses = {c.id: c for c in await my_courses(session, me)}
    topics = list((await session.execute(
        select(Topic).where(Topic.course_id.in_(list(courses))).order_by(Topic.course_id, Topic.position)
    )).scalars()) if courses else []
    rows = (await session.execute(
        select(Question.topic_id, AttemptAnswer.is_correct, Attempt.submitted_at, Assessment.kind)
        .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
        .join(Assessment, Assessment.id == Attempt.assessment_id)
        .join(Question, Question.id == AttemptAnswer.question_id)
        .where(Attempt.person_id == me.person_id, Attempt.status == "submitted",
               AttemptAnswer.is_correct.is_not(None), Question.topic_id.is_not(None))
    )).all()
    answers: dict[uuid.UUID, list[MarkedAnswer]] = defaultdict(list)
    for topic_id, correct, submitted_at, kind in rows:
        answers[topic_id].append(MarkedAnswer(topic_id, bool(correct), submitted_at, kind in UNASSISTED_KINDS))
    now = datetime.now(UTC)
    result = []
    for topic in topics:
        level, accuracy = mastery_level(answers[topic.id], now)
        previous, _ = mastery_level(answers[topic.id], now - MASTERY_LOOKBACK)
        course = courses[topic.course_id]
        result.append({"id": str(topic.id), "title": topic.title, "courseId": str(course.id),
                       "courseCode": course.code, "subject": course.subject, "level": level,
                       "previousLevel": previous, "accuracy": accuracy, "answered": len(answers[topic.id])})
    return {"topics": result, "lookbackDays": MASTERY_LOOKBACK.days,
            "levels": ["not_started", "attempted", "familiar", "proficient", "mastered"]}


# ---- credits ----

APAAR_PATTERN = re.compile(r"[0-9]{12}")  # ASCII digits only: \d would accept other scripts' digits
ABC_NOTE = ("Recorded in EduBot. Your institution links it with the Academic Bank of Credits (ABC) and "
            "uploads your credits there.")


async def _student_programme(session: AsyncSession, me: Enrolment) -> tuple[StudentProgramme, Programme]:
    row = (await session.execute(
        select(StudentProgramme, Programme).join(Programme, Programme.id == StudentProgramme.programme_id)
        .where(StudentProgramme.person_id == me.person_id, StudentProgramme.institution_id == me.institution_id)
    )).first()
    if row is None:
        raise NotFound("You aren't enrolled in a programme yet. Ask your institution's office.")
    return row


def _masked(apaar_id: str | None) -> str | None:
    return f"•••• •••• {apaar_id[-4:]}" if apaar_id else None


NO_TERM = "MOOC credits"  # where a transfer is recorded for a student with no current courses


def _current_term(courses: list[Course]) -> str | None:
    terms = sorted({c.term for c in courses}, key=term_order)
    return terms[-1] if terms else None


@dataclass(frozen=True)
class MoocAllowance:
    """UGC lets up to `cap_percent` of a term's credits come from SWAYAM/NPTEL."""

    term: str | None
    term_credits: int
    cap_percent: int
    used: int  # approved this term plus pending requests

    @property
    def cap(self) -> int:
        return math.floor(self.term_credits * self.cap_percent / 100)

    def fits(self, credits: int) -> bool:
        return self.used + credits <= self.cap


async def _mooc_allowance(session: AsyncSession, person_id: uuid.UUID, courses: list[Course],
                          programme: Programme, *, excluding: uuid.UUID | None = None) -> MoocAllowance:
    term = _current_term(courses)
    term_credits = sum(c.credits for c in courses if c.term == term)
    approved = (await session.execute(select(func.coalesce(func.sum(CourseResult.credits), 0)).where(
        CourseResult.person_id == person_id, CourseResult.source == "nptel", CourseResult.term == term,
        CourseResult.grade != FAIL_GRADE[0]))).scalar_one()
    pending_query = (select(func.coalesce(func.sum(MoocCourse.credits), 0))
                     .join(CreditTransferRequest, CreditTransferRequest.mooc_course_id == MoocCourse.id)
                     .where(CreditTransferRequest.person_id == person_id, CreditTransferRequest.status == "pending"))
    if excluding is not None:
        pending_query = pending_query.where(CreditTransferRequest.id != excluding)
    pending = (await session.execute(pending_query)).scalar_one()
    return MoocAllowance(term=term, term_credits=term_credits, cap_percent=programme.mooc_credit_cap_percent,
                         used=int(approved) + int(pending))


def _check_allowance(allowance: MoocAllowance, course: MoocCourse) -> None:
    if not allowance.fits(course.credits):
        raise Conflict(
            f"This would pass the MOOC credit cap for {allowance.term or 'this term'}: up to {allowance.cap} "
            f"credits ({allowance.cap_percent}% of {allowance.term_credits}), and {allowance.used} are already "
            "approved or waiting.")


async def _lock(session: AsyncSession, key: str) -> None:
    """Serialise a check-then-insert across workers for the rest of this transaction."""
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})


async def _student_courses(request: Request, session: AsyncSession, person_id: uuid.UUID,
                           institution_id: uuid.UUID) -> list[Course]:
    """A student's current courses, for an advisor acting without the student's sign-in."""
    data = await request.app.state.users.get(f"/internal/people/{person_id}/classes")
    sections = {uuid.UUID(c["id"]) for c in data.get("classes", [])
                if c["role"] == "student" and c["institutionId"] == str(institution_id)}
    return await my_courses(session, Enrolment(person_id=person_id, institution_id=institution_id,
                                               section_ids=frozenset(sections)))


async def _transfers(session: AsyncSession, me: Enrolment) -> list[dict]:
    rows = (await session.execute(
        select(CreditTransferRequest, MoocCourse).join(MoocCourse, MoocCourse.id == CreditTransferRequest.mooc_course_id)
        .where(CreditTransferRequest.person_id == me.person_id).order_by(CreditTransferRequest.created_at.desc())
    )).all()
    files = await describe_many(session, [str(r.certificate_attachment_id) for r, _ in rows
                                          if r.certificate_attachment_id])
    return [_transfer(request, course, files) for request, course in rows]


def _transfer(request: CreditTransferRequest, course: MoocCourse, files: dict[str, dict]) -> dict:
    certificate = str(request.certificate_attachment_id) if request.certificate_attachment_id else None
    return {"id": str(request.id), "status": request.status, "scorePercent": request.score_percent,
            "note": request.decision_note, "createdAt": request.created_at.isoformat(),
            "decidedAt": request.decided_at.isoformat() if request.decided_at else None,
            "course": _mooc(course), "certificate": files.get(certificate) if certificate else None}


def _mooc(course: MoocCourse) -> dict:
    return {"id": str(course.id), "provider": course.provider, "title": course.title, "weeks": course.weeks,
            "credits": course.credits, "category": course.category, "url": course.url, "nextRun": course.next_run}


@router.get("/student/credits")
async def credits(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Credits earned and in progress against the programme, the next NEP exit point, ABC/APAAR status,
    and SWAYAM/NPTEL credits against the UGC cap."""
    me = await student_enrolment(request, ctx)
    enrolled, programme = await _student_programme(session, me)
    results = await _results(session, me)
    courses = await my_courses(session, me)
    passed = [r for r in results if r.grade != FAIL_GRADE[0]]
    earned = sum(r.credits for r in passed)
    in_progress = sum(c.credits for c in courses)
    requirements = [{
        "category": req["category"], "required": req["credits"],
        "earned": sum(r.credits for r in passed if r.category == req["category"]),
        "inProgress": sum(c.credits for c in courses if c.category == req["category"]),
    } for req in programme.requirements]
    exits = sorted(programme.exit_points, key=lambda e: e["credits"])
    next_exit = next((e for e in exits if e["credits"] > earned), None)
    allowance = await _mooc_allowance(session, me.person_id, courses, programme)
    return {
        "programme": {"id": str(programme.id), "name": programme.name, "totalCredits": programme.total_credits,
                      "admittedYear": enrolled.admitted_year},
        "earned": earned, "inProgress": in_progress, "remaining": max(programme.total_credits - earned, 0),
        "requirements": requirements,
        "exitPoints": [{**e, "reached": e["credits"] <= earned} for e in exits],
        "nextExit": {**next_exit, "creditsNeeded": next_exit["credits"] - earned} if next_exit else None,
        "abc": {"apaarId": _masked(enrolled.apaar_id), "status": enrolled.abc_status,
                "syncedAt": enrolled.abc_synced_at.isoformat() if enrolled.abc_synced_at else None,
                "note": ABC_NOTE},
        "mooc": {"capPercent": allowance.cap_percent, "term": allowance.term,
                 "termCredits": allowance.term_credits, "termCap": allowance.cap, "usedThisTerm": allowance.used},
        "transfers": await _transfers(session, me),
    }


class ApaarIn(CamelModel):
    apaar_id: str = Field(max_length=20)


@router.put("/student/credits/apaar")
async def set_apaar(
    body: ApaarIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    enrolled, _ = await _student_programme(session, me)
    apaar_id = re.sub(r"[\s-]", "", body.apaar_id)
    if not APAAR_PATTERN.fullmatch(apaar_id):
        raise ValidationFailed("An APAAR ID is exactly 12 digits.")
    enrolled.apaar_id, enrolled.abc_status, enrolled.abc_synced_at = apaar_id, "pending", None
    await session.commit()
    return {"apaarId": _masked(apaar_id), "status": enrolled.abc_status, "syncedAt": None, "note": ABC_NOTE}


@router.get("/student/credits/moocs")
async def moocs(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    catalogue = (await session.execute(
        select(MoocCourse).where(MoocCourse.institution_id == me.institution_id).order_by(MoocCourse.title)
    )).scalars().all()
    requested = dict((await session.execute(
        select(CreditTransferRequest.mooc_course_id, CreditTransferRequest.status)
        .where(CreditTransferRequest.person_id == me.person_id)
    )).all())
    return {"courses": [{**_mooc(c), "requestStatus": requested.get(c.id)} for c in catalogue],
            "passPercent": NPTEL_PASS_PERCENT}


class TransferIn(CamelModel):
    mooc_course_id: uuid.UUID
    score_percent: float = Field(ge=0, le=100)
    certificate_attachment_id: uuid.UUID | None = None


@router.post("/student/credits/transfers", status_code=201)
async def request_transfer(
    body: TransferIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    _, programme = await _student_programme(session, me)
    course = await session.get(MoocCourse, body.mooc_course_id)
    if course is None or course.institution_id != me.institution_id:
        raise NotFound("That course isn't on your institution's approved list.")
    if body.score_percent < NPTEL_PASS_PERCENT:
        raise ValidationFailed(f"Credit transfer needs a passing certificate ({NPTEL_PASS_PERCENT}% or more).")
    await _lock(session, f"mooc-transfer:{me.person_id}")  # one claim at a time, so the cap and duplicates hold
    _check_allowance(await _mooc_allowance(session, me.person_id, await my_courses(session, me), programme),
                     course)
    existing = (await session.execute(select(CreditTransferRequest.id).where(
        CreditTransferRequest.person_id == me.person_id, CreditTransferRequest.mooc_course_id == course.id,
        CreditTransferRequest.status.in_(("pending", "approved"))))).first()
    if existing is not None:
        raise Conflict("You've already asked for credit for this course.")
    certificate = await owned_attachments(
        session, me, [body.certificate_attachment_id] if body.certificate_attachment_id else [])
    transfer = CreditTransferRequest(institution_id=me.institution_id, person_id=me.person_id,
                                     mooc_course_id=course.id, score_percent=body.score_percent,
                                     certificate_attachment_id=uuid.UUID(certificate[0]) if certificate else None)
    session.add(transfer)
    session.add(trail_event(me, ctx, "credit_transfer_requested",
                            detail={"moocCourseId": str(course.id), "title": course.title}))
    await session.commit()
    files = await describe_many(session, certificate)
    return _transfer(transfer, course, files)


# ---- teacher: credit transfers for advisees ----

class DecisionIn(CamelModel):
    approve: bool
    note: str | None = Field(default=None, max_length=1000)


async def _advisee_names(request: Request, ctx: RequestContext, me: Enrolment,
                         person_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    names = {pid: me.student_names[pid] for pid in person_ids if pid in me.student_names}
    missing = person_ids - names.keys()
    if missing:  # advisees outside the teacher's own classes: one lookup for all of them
        found = await request.app.state.users.post("/internal/people/batch", ctx=ctx,
                                                   json={"ids": [str(pid) for pid in missing]})
        names |= {uuid.UUID(person["id"]): person["name"] for person in found.get("items", [])}
    return names


@router.get("/teacher/requests/credits")
async def advisee_transfers(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Credit-transfer requests from students this teacher advises; waiting ones first."""
    me = await teacher_enrolment(request, ctx)
    rows = (await session.execute(
        select(CreditTransferRequest, MoocCourse)
        .join(MoocCourse, MoocCourse.id == CreditTransferRequest.mooc_course_id)
        .join(StudentProgramme, StudentProgramme.person_id == CreditTransferRequest.person_id)
        .where(StudentProgramme.advisor_id == me.person_id,
               CreditTransferRequest.institution_id == me.institution_id)
        .order_by(CreditTransferRequest.created_at)
    )).all()
    names = await _advisee_names(request, ctx, me, {r.person_id for r, _ in rows})
    files = await describe_many(session, [str(r.certificate_attachment_id) for r, _ in rows
                                          if r.certificate_attachment_id])
    items = [{**_transfer(r, c, files),
              "student": {"id": str(r.person_id), "name": names.get(r.person_id, "Unknown student")}}
             for r, c in rows]
    items.sort(key=lambda i: i["status"] != "pending")
    return {"items": items, "pending": sum(i["status"] == "pending" for i in items)}


@router.post("/teacher/requests/credits/{request_id}/decide")
async def decide_transfer(
    request_id: uuid.UUID,
    body: DecisionIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Approving records the MOOC as a passed course on the student's record (graded from the certificate)."""
    me = await teacher_enrolment(request, ctx)
    row = (await session.execute(
        select(CreditTransferRequest, MoocCourse, StudentProgramme)
        .join(MoocCourse, MoocCourse.id == CreditTransferRequest.mooc_course_id)
        .join(StudentProgramme, StudentProgramme.person_id == CreditTransferRequest.person_id)
        .where(CreditTransferRequest.id == request_id, StudentProgramme.advisor_id == me.person_id,
               CreditTransferRequest.institution_id == me.institution_id)
        .with_for_update(of=CreditTransferRequest)  # two advisors (or two clicks) can't both decide it
    )).first()
    if row is None:
        raise NotFound("Request not found.")
    transfer, course, enrolled = row
    if transfer.status != "pending":
        raise Conflict("This request has already been decided.")
    term = NO_TERM
    if body.approve:
        programme = await session.get(Programme, enrolled.programme_id)
        courses = await _student_courses(request, session, transfer.person_id, me.institution_id)
        allowance = await _mooc_allowance(session, transfer.person_id, courses, programme, excluding=transfer.id)
        _check_allowance(allowance, course)
        term = allowance.term or NO_TERM
    now = datetime.now(UTC)
    transfer.status = "approved" if body.approve else "declined"
    transfer.decided_by, transfer.decided_at, transfer.decision_note = me.person_id, now, body.note
    if body.approve:
        grade, point = grade_for(transfer.score_percent)
        session.add(CourseResult(institution_id=me.institution_id, person_id=transfer.person_id, term=term,
                                 code=f"{course.provider}-{str(course.id)[:6].upper()}", title=course.title,
                                 credits=course.credits, category=course.category, grade=grade, grade_point=point,
                                 source="nptel"))
    await session.commit()
    await request.app.state.audit.emit(ctx, AuditEvent(
        action=f"credit_transfer.{'approve' if body.approve else 'decline'}", target_type="credit_transfer",
        target_id=transfer.id, target_label=course.title, institution_id=me.institution_id,
    ))
    files = await describe_many(session, [str(transfer.certificate_attachment_id)]
                                if transfer.certificate_attachment_id else [])
    return _transfer(transfer, course, files)
