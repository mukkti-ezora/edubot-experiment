"""Practice: the hub, quizzes, mock tests, past papers, attempts and results, improvement sets and AI practice.

Scoring and the answer-key rule live in practice_scoring, AI validation in practice_ai, the review deck in
practice_review and teacher views in practice_teacher; their routes are mounted on this module's router.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import ConfigDict, Field, StringConstraints
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import allowance, db, practice_review, practice_teacher
from services.learning.enrolment import Enrolment, my_course, my_courses, my_lesson, student_enrolment
from services.learning.models import (
    Assessment,
    AssessmentItem,
    Attempt,
    AttemptAnswer,
    Course,
    Flashcard,
    LearningEvent,
    Lesson,
    Module,
    Question,
    Topic,
)
from services.learning.practice_ai import (
    AI_CARDS_MAX,
    AI_QUESTIONS_PER_SET,
    FLASHCARD_RULES,
    PRACTICE_RULES,
    generate,
    keep_valid,
    lesson_material,
    validate_generated_card,
    validate_generated_question,
)
from services.learning.practice_review import card_view
from services.learning.practice_scoring import (
    NUMERIC_LIMIT,
    ReviewAccess,
    accuracy,
    breakdown,
    finalise,
    is_assessed,
    question_counts,
    rank,
    review_access,
    speed_quadrants,
    validate_response,
    window_status,
)
from services.learning.schedule import local_zone
from services.learning.trail import trail_event
from services.shared.context import RequestContext, get_context
from services.shared.errors import AppError, Conflict, NotFound
from services.shared.schemas import CamelModel

router = APIRouter()
router.include_router(practice_review.router)
router.include_router(practice_teacher.router)
log = logging.getLogger(__name__)

IMPROVEMENT_SET_SIZE = 10
IMPROVEMENT_SETS_PER_DAY = 20
MAX_SECONDS_PER_QUESTION = 3 * 3600
MAX_OPTIONS_CHOSEN = 10
OPTION_ID_MAX = 8


class TutorLocked(AppError):
    status_code = 409
    code = "TUTOR_LOCKED"
    public_message = "EduBot is paused while you take an unassisted test. It will be back when you submit."


@dataclass(frozen=True)
class Caller:
    """The signed-in student and their request context, for scoping and the learning trail."""

    me: Enrolment
    ctx: RequestContext

    def event(self, kind: str, course_id: uuid.UUID, detail: dict) -> LearningEvent:
        return trail_event(self.me, self.ctx, kind, course_id=course_id, detail=detail)


@dataclass(frozen=True)
class AttemptRef:
    attempt: Attempt
    assessment: Assessment


# ---- access ----

def _visible_to(me: Enrolment, course_ids: set[uuid.UUID]) -> tuple[ColumnElement[bool], ...]:
    """Shared tests of the student's courses, plus their own private practice sets."""
    return (Assessment.course_id.in_(course_ids),
            Assessment.institution_id == me.institution_id,
            (Assessment.owner_id.is_(None)) | (Assessment.owner_id == me.person_id))


async def _my_assessment(session: AsyncSession, me: Enrolment, assessment_id: uuid.UUID) -> Assessment:
    assessment = await session.get(Assessment, assessment_id)
    if assessment is None or assessment.owner_id not in (None, me.person_id):
        raise NotFound("Test not found.")
    await my_course(session, me, assessment.course_id)
    return assessment


async def _my_attempt(session: AsyncSession, me: Enrolment, attempt_id: uuid.UUID) -> AttemptRef:
    attempt = await session.get(Attempt, attempt_id)
    if attempt is None or attempt.person_id != me.person_id or attempt.institution_id != me.institution_id:
        raise NotFound("Attempt not found.")
    return AttemptRef(attempt, await session.get(Assessment, attempt.assessment_id))


async def _my_attempt_locked(session: AsyncSession, me: Enrolment, attempt_id: uuid.UUID) -> AttemptRef:
    """The attempt row locked for this transaction, so an answer can't land after the attempt is scored."""
    attempt = (await session.execute(select(Attempt).where(Attempt.id == attempt_id).with_for_update()
                                     .execution_options(populate_existing=True))).scalar_one_or_none()
    if attempt is None or attempt.person_id != me.person_id or attempt.institution_id != me.institution_id:
        raise NotFound("Attempt not found.")
    return AttemptRef(attempt, await session.get(Assessment, attempt.assessment_id))


async def _items(session: AsyncSession, assessment_id: uuid.UUID) -> list[tuple[AssessmentItem, Question]]:
    return [(item, question) for item, question in (await session.execute(
        select(AssessmentItem, Question).join(Question, Question.id == AssessmentItem.question_id)
        .where(AssessmentItem.assessment_id == assessment_id).order_by(AssessmentItem.position)
    )).all()]


async def _attempts_used(session: AsyncSession, attempt: Attempt) -> int:
    return (await session.execute(select(func.count()).where(
        Attempt.assessment_id == attempt.assessment_id, Attempt.person_id == attempt.person_id))).scalar_one()


async def _review_for(session: AsyncSession, ref: AttemptRef, now: datetime) -> ReviewAccess:
    return review_access(ref.assessment, await _attempts_used(session, ref.attempt), now)


async def _settle_if_expired(session: AsyncSession, caller: Caller, ref: AttemptRef) -> bool:
    """Time up: submit the attempt as it stands, exactly as a manual submit would. True when this call did."""
    now = datetime.now(UTC)
    attempt, assessment = ref.attempt, ref.assessment
    if attempt.status != "in_progress" or attempt.deadline_at is None or now < attempt.deadline_at:
        return False
    await finalise(session, attempt, assessment, now)
    session.add(caller.event("assessment_submitted", assessment.course_id, {
        "assessmentId": str(assessment.id), "title": assessment.title, "score": attempt.score,
        "maxScore": attempt.max_score, "auto": True}))
    await session.commit()
    log.info("attempt_auto_submitted", extra={"attempt": str(attempt.id), "assessment": str(assessment.id)})
    return True


async def ensure_tutor_allowed(session: AsyncSession, me: Enrolment) -> None:
    """EduBot (the tutor and every AI helper) stays quiet while the student sits an unassisted test."""
    running = (await session.execute(
        select(Attempt.deadline_at).join(Assessment, Assessment.id == Attempt.assessment_id).where(
            Attempt.person_id == me.person_id, Attempt.status == "in_progress",
            (Assessment.tutor_allowed.is_(False)) | (Assessment.kind == "exam_check"))
    )).scalars().all()
    now = datetime.now(UTC)
    if any(deadline is None or deadline > now for deadline in running):
        raise TutorLocked()


# ---- views ----

def _public_question(question: Question, answer: AttemptAnswer | None, position: int) -> dict:
    return {"id": str(question.id), "position": position, "kind": question.kind, "stem": question.stem,
            "options": question.options, "sourceLabel": question.source_label,
            "response": answer.response if answer else None,
            "markedForReview": answer.marked_for_review if answer else False,
            "timeSeconds": answer.time_seconds if answer else 0}


@dataclass(frozen=True)
class AttemptStats:
    used: int
    in_progress: Attempt | None
    best: Attempt | None


async def _attempt_stats(session: AsyncSession, me: Enrolment, assessment_ids: list[uuid.UUID]
                         ) -> dict[uuid.UUID, AttemptStats]:
    attempts = (await session.execute(select(Attempt).where(
        Attempt.person_id == me.person_id, Attempt.assessment_id.in_(assessment_ids)))).scalars().all()
    grouped: dict[uuid.UUID, list[Attempt]] = defaultdict(list)
    for attempt in attempts:
        grouped[attempt.assessment_id].append(attempt)
    stats = {}
    for assessment_id in assessment_ids:
        mine = grouped.get(assessment_id, [])
        submitted = [a for a in mine if a.status == "submitted"]
        stats[assessment_id] = AttemptStats(
            used=len(mine),
            in_progress=next((a for a in mine if a.status == "in_progress"), None),
            best=max(submitted, key=lambda a: a.score or 0, default=None),
        )
    return stats


def _summary(assessment: Assessment, course: Course, question_count: int, stats: AttemptStats, now: datetime) -> dict:
    attempts_left = None if assessment.max_attempts is None else max(0, assessment.max_attempts - stats.used)
    best = stats.best
    return {
        "id": str(assessment.id), "title": assessment.title, "kind": assessment.kind,
        "courseId": str(course.id), "courseCode": course.code, "subject": course.subject,
        "durationMinutes": assessment.duration_minutes, "questionCount": question_count,
        "opensAt": assessment.opens_at.isoformat() if assessment.opens_at else None,
        "closesAt": assessment.closes_at.isoformat() if assessment.closes_at else None,
        "status": window_status(assessment, now), "attemptsUsed": stats.used, "attemptsLeft": attempts_left,
        "inProgressAttemptId": str(stats.in_progress.id) if stats.in_progress else None,
        "best": {"attemptId": str(best.id), "score": best.score, "maxScore": best.max_score} if best else None,
        "countsTowardGrade": assessment.counts_toward_grade, "tutorAllowed": assessment.tutor_allowed,
        "marking": {"correct": assessment.marks_correct, "wrong": assessment.marks_wrong},
        "personal": assessment.owner_id is not None,
    }


async def _summaries(session: AsyncSession, me: Enrolment, assessments: list[Assessment],
                     courses: dict[uuid.UUID, Course]) -> list[dict]:
    ids = [a.id for a in assessments]
    counts, stats = await question_counts(session, ids), await _attempt_stats(session, me, ids)
    now = datetime.now(UTC)
    return [_summary(a, courses[a.course_id], counts.get(a.id, 0), stats[a.id], now) for a in assessments]


async def _attempt_view(session: AsyncSession, ref: AttemptRef) -> dict:
    """An attempt in progress: questions grouped by section, never the answer key."""
    attempt, assessment = ref.attempt, ref.assessment
    answers = {a.question_id: a for a in (await session.execute(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id))).scalars()}
    sections: dict[str, list[dict]] = {}
    for item, question in await _items(session, assessment.id):
        sections.setdefault(item.section, []).append(
            _public_question(question, answers.get(question.id), item.position))
    return {
        "id": str(attempt.id), "assessmentId": str(assessment.id), "title": assessment.title,
        "kind": assessment.kind, "status": attempt.status, "number": attempt.number,
        "startedAt": attempt.started_at.isoformat(),
        "deadlineAt": attempt.deadline_at.isoformat() if attempt.deadline_at else None,
        "serverNow": datetime.now(UTC).isoformat(), "tutorAllowed": assessment.tutor_allowed,
        "marking": {"correct": assessment.marks_correct, "wrong": assessment.marks_wrong},
        "sections": [{"title": title, "questions": questions} for title, questions in sections.items()],
    }


def _reviewed(answer: AttemptAnswer, question: Question, item: AssessmentItem, topics: dict) -> dict:
    return {
        "id": str(question.id), "position": item.position, "section": item.section, "kind": question.kind,
        "stem": question.stem, "options": question.options, "response": answer.response,
        "correctAnswer": question.answer, "isCorrect": answer.is_correct, "marks": answer.marks,
        "explanation": question.explanation, "timeSeconds": answer.time_seconds,
        "topic": topics.get(question.topic_id), "sourceLabel": question.source_label,
    }


async def _result(session: AsyncSession, ref: AttemptRef) -> dict:
    attempt, assessment = ref.attempt, ref.assessment
    rows = [(answer, question, item) for answer, question, item in (await session.execute(
        select(AttemptAnswer, Question, AssessmentItem)
        .join(Question, Question.id == AttemptAnswer.question_id)
        .join(AssessmentItem, (AssessmentItem.question_id == Question.id)
              & (AssessmentItem.assessment_id == assessment.id))
        .where(AttemptAnswer.attempt_id == attempt.id).order_by(AssessmentItem.position)
    )).all()]
    topic_ids = {q.topic_id for _, q, _ in rows if q.topic_id}
    topic_titles = {t.id: {"id": str(t.id), "title": t.title} for t in (await session.execute(
        select(Topic).where(Topic.id.in_(topic_ids)))).scalars()} if topic_ids else {}
    answered = [a for a, _, _ in rows if a.is_correct is not None]
    review = await _review_for(session, ref, datetime.now(UTC))
    return {
        "id": str(attempt.id), "assessmentId": str(assessment.id), "title": assessment.title,
        "kind": assessment.kind, "status": attempt.status, "number": attempt.number,
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "score": attempt.score, "maxScore": attempt.max_score, "correct": attempt.correct,
        "wrong": attempt.wrong, "skipped": attempt.skipped,
        "accuracy": accuracy(attempt.correct, attempt.correct + attempt.wrong),
        "timeSpentSeconds": sum(a.time_seconds for a, _, _ in rows),
        "rank": await rank(session, attempt) if assessment.owner_id is None else None,
        "sections": breakdown(rows, lambda q, item: item.section or "All questions", {}),
        "topics": breakdown(rows, lambda q, item: q.topic_id, topic_titles),
        "speed": speed_quadrants(answered),
        "behaviour": {
            "answersChanged": sum(a.changes for a, _, _ in rows),
            "markedForReviewLeft": sum(1 for a, _, _ in rows if a.marked_for_review),
            "secondsOnWrong": sum(a.time_seconds for a in answered if not a.is_correct),
        },
        "reviewAvailable": review.available,
        "reviewAvailableAt": review.available_at.isoformat() if review.available_at else None,
        "reviewNote": review.reason,
        "questions": [_reviewed(answer, question, item, topic_titles) for answer, question, item in rows]
        if review.available else [],
    }


# ---- hub ----

async def _topic_accuracy(session: AsyncSession, me: Enrolment, course_ids: set[uuid.UUID]) -> list[dict]:
    topics = (await session.execute(select(Topic, Course).join(Course, Course.id == Topic.course_id).where(
        Topic.course_id.in_(course_ids)).order_by(Course.code, Topic.position))).all()
    counts = dict((await session.execute(
        select(Question.topic_id, func.count()).where(Question.course_id.in_(course_ids), Question.owner_id.is_(None))
        .group_by(Question.topic_id))).all())
    answered = (await session.execute(
        select(Question.topic_id, AttemptAnswer.is_correct).join(AttemptAnswer, AttemptAnswer.question_id == Question.id)
        .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
        .where(Attempt.person_id == me.person_id, Attempt.status == "submitted", AttemptAnswer.is_correct.is_not(None))
    )).all()
    tally: dict[uuid.UUID, list[int]] = defaultdict(lambda: [0, 0])
    for topic_id, correct in answered:
        tally[topic_id][0] += int(correct)
        tally[topic_id][1] += 1
    return [{"id": str(t.id), "title": t.title, "courseId": str(c.id), "courseCode": c.code,
             "questionCount": counts.get(t.id, 0), "answered": tally[t.id][1],
             "accuracy": accuracy(*tally[t.id])} for t, c in topics]


@router.get("/student/practice")
async def hub(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    courses = {c.id: c for c in await my_courses(session, me)}
    assessments = list((await session.execute(
        select(Assessment).where(*_visible_to(me, set(courses))).order_by(Assessment.created_at)
    )).scalars())
    shared = [a for a in assessments if a.owner_id is None]
    personal = sorted((a for a in assessments if a.owner_id is not None), key=lambda a: a.created_at, reverse=True)
    day_ends_at = practice_review.end_of_local_day(datetime.now(UTC), local_zone(request))
    return {
        "assessments": await _summaries(session, me, shared, courses),
        "improvementSets": await _summaries(session, me, personal, courses),
        "review": await practice_review.review_counts(session, me, set(courses), day_ends_at),
        "topics": await _topic_accuracy(session, me, set(courses)),
    }


# ---- tests and attempts ----

@router.get("/student/assessments/{assessment_id}")
async def assessment_detail(
    assessment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    assessment = await _my_assessment(session, me, assessment_id)
    course = await session.get(Course, assessment.course_id)
    (summary,) = await _summaries(session, me, [assessment], {course.id: course})
    sections: dict[str, int] = {}
    for item, _ in await _items(session, assessment.id):
        sections[item.section] = sections.get(item.section, 0) + 1
    attempts = (await session.execute(select(Attempt).where(
        Attempt.assessment_id == assessment.id, Attempt.person_id == me.person_id).order_by(Attempt.number))).scalars()
    return {**summary, "instructions": assessment.instructions,
            "sections": [{"title": title or "All questions", "questionCount": n} for title, n in sections.items()],
            "attempts": [{"id": str(a.id), "number": a.number, "status": a.status, "score": a.score,
                          "maxScore": a.max_score,
                          "submittedAt": a.submitted_at.isoformat() if a.submitted_at else None} for a in attempts]}


def _deadline(assessment: Assessment, now: datetime) -> datetime | None:
    deadline = now + timedelta(minutes=assessment.duration_minutes) if assessment.duration_minutes else None
    if assessment.closes_at and (deadline is None or deadline > assessment.closes_at):
        return assessment.closes_at
    return deadline


async def _running_attempt(session: AsyncSession, me: Enrolment, assessment: Assessment) -> Attempt | None:
    return (await session.execute(select(Attempt).where(
        Attempt.assessment_id == assessment.id, Attempt.person_id == me.person_id,
        Attempt.status == "in_progress"))).scalar_one_or_none()


@router.post("/student/assessments/{assessment_id}/attempts", status_code=201)
async def start_attempt(
    assessment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Start a test, or return the attempt already in progress so a refresh never loses work."""
    caller = Caller(await student_enrolment(request, ctx), ctx)
    me = caller.me
    assessment = await _my_assessment(session, me, assessment_id)
    running = await _running_attempt(session, me, assessment)
    if running is not None and not await _settle_if_expired(session, caller, AttemptRef(running, assessment)):
        return await _attempt_view(session, AttemptRef(running, assessment))

    now = datetime.now(UTC)
    status = window_status(assessment, now)
    if status != "open":
        raise Conflict("This test hasn't opened yet." if status == "upcoming" else "This test has closed.")
    used = (await session.execute(select(func.count()).where(
        Attempt.assessment_id == assessment.id, Attempt.person_id == me.person_id))).scalar_one()
    if assessment.max_attempts is not None and used >= assessment.max_attempts:
        raise Conflict("You've used all your attempts for this test.")
    items = await _items(session, assessment.id)
    if not items:
        raise Conflict("This test has no questions yet.")

    attempt = Attempt(institution_id=me.institution_id, assessment_id=assessment.id, person_id=me.person_id,
                      number=used + 1, started_at=now, deadline_at=_deadline(assessment, now))
    session.add(attempt)
    try:
        await session.flush()
    except IntegrityError:
        # Another tab or a double click started this same attempt first: carry on with that one. The rollback
        # expires loaded rows, so the test is read again rather than touched while expired.
        await session.rollback()
        assessment = await _my_assessment(session, me, assessment_id)
        running = await _running_attempt(session, me, assessment)
        if running is None:
            raise Conflict("That attempt was just started somewhere else. Refresh to continue.") from None
        return await _attempt_view(session, AttemptRef(running, assessment))
    session.add_all(AttemptAnswer(attempt_id=attempt.id, question_id=question.id) for _, question in items)
    session.add(caller.event("assessment_started", assessment.course_id,
                             {"assessmentId": str(assessment.id), "title": assessment.title}))
    await session.commit()
    return await _attempt_view(session, AttemptRef(attempt, assessment))


OptionId = Annotated[str, StringConstraints(min_length=1, max_length=OPTION_ID_MAX)]


class ResponseIn(CamelModel):
    """A student's answer: chosen option ids, or one bounded finite number. Nothing else is stored."""

    model_config = ConfigDict(**CamelModel.model_config, extra="forbid")

    options: Annotated[list[OptionId], Field(max_length=MAX_OPTIONS_CHOSEN)] | None = None
    value: Annotated[float, Field(ge=-NUMERIC_LIMIT, le=NUMERIC_LIMIT, allow_inf_nan=False)] | None = None


class AnswerIn(CamelModel):
    response: ResponseIn | None = None
    marked_for_review: bool = False
    time_seconds: Annotated[int, Field(ge=0, le=MAX_SECONDS_PER_QUESTION)] = 0


@router.put("/student/attempts/{attempt_id}/answers/{question_id}")
async def save_answer(
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    body: AnswerIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    caller = Caller(await student_enrolment(request, ctx), ctx)
    ref = await _my_attempt_locked(session, caller.me, attempt_id)
    if await _settle_if_expired(session, caller, ref) or ref.attempt.status != "in_progress":
        raise Conflict("Time is up, so this attempt has been submitted.")
    row = (await session.execute(
        select(AttemptAnswer, Question).join(Question, Question.id == AttemptAnswer.question_id)
        .where(AttemptAnswer.attempt_id == ref.attempt.id, AttemptAnswer.question_id == question_id)
    )).first()
    if row is None:
        raise NotFound("Question not found in this test.")
    answer, question = row
    response = body.response.model_dump(exclude_none=True) if body.response else None
    validate_response(question, response)
    if answer.response is not None and response != answer.response:
        answer.changes += 1
    answer.response, answer.marked_for_review = response, body.marked_for_review
    answer.time_seconds = max(answer.time_seconds, body.time_seconds)  # the client sends running totals
    await session.commit()
    return {"questionId": str(question_id), "saved": True}


@router.post("/student/attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    caller = Caller(await student_enrolment(request, ctx), ctx)
    ref = await _my_attempt_locked(session, caller.me, attempt_id)
    attempt, assessment = ref.attempt, ref.assessment
    if attempt.status == "in_progress":
        await finalise(session, attempt, assessment, datetime.now(UTC))
        session.add(caller.event("assessment_submitted", assessment.course_id, {
            "assessmentId": str(assessment.id), "title": assessment.title, "score": attempt.score,
            "maxScore": attempt.max_score}))
        await session.commit()
    return await _result(session, ref)


@router.get("/student/attempts/{attempt_id}")
async def attempt_detail(
    attempt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """The attempt to resume if it is running, otherwise its result."""
    caller = Caller(await student_enrolment(request, ctx), ctx)
    ref = await _my_attempt(session, caller.me, attempt_id)
    await _settle_if_expired(session, caller, ref)
    if ref.attempt.status == "in_progress":
        return await _attempt_view(session, ref)
    return await _result(session, ref)


# ---- improvement sets ----

async def _withheld_question_ids(session: AsyncSession, now: datetime) -> set[uuid.UUID]:
    """Bank questions that sit in an assessed test still running for someone: never handed out in practice."""
    rows = (await session.execute(
        select(AssessmentItem.question_id, Assessment).join(Assessment, Assessment.id == AssessmentItem.assessment_id)
        .where(Assessment.owner_id.is_(None), (Assessment.closes_at.is_(None)) | (Assessment.closes_at > now))
    )).all()
    return {question_id for question_id, assessment in rows if is_assessed(assessment)}


async def _practice_set(session: AsyncSession, me: Enrolment, course_id: uuid.UUID, title: str,
                        question_ids: list[uuid.UUID]) -> Assessment:
    practice = Assessment(institution_id=me.institution_id, course_id=course_id, title=title, kind="practice",
                          owner_id=me.person_id, created_at=datetime.now(UTC))
    session.add(practice)
    await session.flush()
    session.add_all(AssessmentItem(assessment_id=practice.id, question_id=qid, position=pos)
                    for pos, qid in enumerate(question_ids, start=1))
    return practice


async def _improvement_questions(session: AsyncSession, attempt: Attempt, now: datetime) -> list[uuid.UUID]:
    """Questions answered wrong or skipped, topped up from the same topics with questions safe to reveal."""
    missed = list((await session.execute(
        select(Question).join(AttemptAnswer, AttemptAnswer.question_id == Question.id)
        .where(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.is_correct.is_not(True))
    )).scalars())
    if not missed:
        raise Conflict("You got everything right, so there's nothing to improve here.")
    chosen = [q.id for q in missed][:IMPROVEMENT_SET_SIZE]
    topics = {q.topic_id for q in missed if q.topic_id}
    if topics and len(chosen) < IMPROVEMENT_SET_SIZE:
        withheld = await _withheld_question_ids(session, now)
        candidates = (await session.execute(
            select(Question.id).where(Question.topic_id.in_(topics), Question.owner_id.is_(None),
                                      Question.id.not_in(chosen)).order_by(Question.difficulty, Question.created_at)
        )).scalars()
        chosen += [qid for qid in candidates if qid not in withheld][:IMPROVEMENT_SET_SIZE - len(chosen)]
    return chosen


@router.post("/student/attempts/{attempt_id}/improvement-set", status_code=201)
async def improvement_set(
    attempt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """A private practice set from the questions you got wrong or skipped. Only once answers can be shown."""
    caller = Caller(await student_enrolment(request, ctx), ctx)
    me = caller.me
    ref = await _my_attempt(session, me, attempt_id)
    attempt, assessment = ref.attempt, ref.assessment
    if attempt.status != "submitted":
        raise Conflict("Submit the test first.")
    now = datetime.now(UTC)
    review = await _review_for(session, ref, now)
    if not review.available:
        raise Conflict(review.reason or "Answers aren't open yet.",
                       details={"reviewAvailableAt": review.available_at.isoformat() if review.available_at else None})
    chosen = await _improvement_questions(session, attempt, now)
    await allowance.reserve(session, institution_id=me.institution_id, person_id=me.person_id,
                            kind="improvement_set", limit=IMPROVEMENT_SETS_PER_DAY,
                            message=f"You can make {IMPROVEMENT_SETS_PER_DAY} improvement sets a day.")
    practice = await _practice_set(session, me, assessment.course_id, f"Improve: {assessment.title}", chosen)
    session.add(caller.event("improvement_set_created", assessment.course_id,
                             {"assessmentId": str(practice.id), "from": str(assessment.id)}))
    await session.commit()
    course = await session.get(Course, practice.course_id)
    (summary,) = await _summaries(session, me, [practice], {course.id: course})
    return summary


# ---- practice from the question bank ----

async def _answered_correctly(session: AsyncSession, me: Enrolment) -> set[uuid.UUID]:
    return set((await session.execute(
        select(AttemptAnswer.question_id).join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
        .where(Attempt.person_id == me.person_id, Attempt.status == "submitted", AttemptAnswer.is_correct.is_(True))
    )).scalars())


async def _bank_questions(session: AsyncSession, me: Enrolment, topic: Topic, now: datetime) -> list[uuid.UUID]:
    """Teacher and past-paper questions on a topic that are safe to reveal, the ones not yet mastered first."""
    candidates = list((await session.execute(
        select(Question.id).where(Question.topic_id == topic.id, Question.course_id == topic.course_id,
                                  Question.owner_id.is_(None), Question.source != "ai")
        .order_by(Question.difficulty, Question.created_at)
    )).scalars())
    withheld = await _withheld_question_ids(session, now)
    usable = [qid for qid in candidates if qid not in withheld]
    mastered = await _answered_correctly(session, me)
    return sorted(usable, key=lambda qid: qid in mastered)[:IMPROVEMENT_SET_SIZE]


@router.post("/student/topics/{topic_id}/bank-practice", status_code=201)
async def bank_practice(
    topic_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Up to ten questions from the course's own bank on a topic, as a private practice set."""
    caller = Caller(await student_enrolment(request, ctx), ctx)
    me = caller.me
    topic = await session.get(Topic, topic_id)
    if topic is None:
        raise NotFound("Topic not found.")
    course = await my_course(session, me, topic.course_id)
    chosen = await _bank_questions(session, me, topic, datetime.now(UTC))
    if not chosen:
        raise Conflict("There are no practice questions on this topic yet.")
    await allowance.reserve(session, institution_id=me.institution_id, person_id=me.person_id,
                            kind="improvement_set", limit=IMPROVEMENT_SETS_PER_DAY,
                            message=f"You can make {IMPROVEMENT_SETS_PER_DAY} practice sets a day.")
    practice = await _practice_set(session, me, course.id, f"Practice: {topic.title}", chosen)
    session.add(caller.event("bank_practice_created", course.id,
                             {"topicId": str(topic.id), "assessmentId": str(practice.id), "questions": len(chosen)}))
    await session.commit()
    (summary,) = await _summaries(session, me, [practice], {course.id: course})
    return summary


# ---- AI practice ----

async def _reserve_ai(request: Request, session: AsyncSession, me: Enrolment) -> None:
    """Reserve one AI generation before calling the model, so failed or parallel calls still count."""
    limit = request.app.state.settings.ai_practice_per_day
    await allowance.reserve(session, institution_id=me.institution_id, person_id=me.person_id,
                            kind="ai_generation", limit=limit,
                            message=f"You can make {limit} AI practice sets or decks a day. Try again tomorrow.")


@router.post("/student/topics/{topic_id}/ai-practice", status_code=201)
async def ai_practice(
    topic_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Five fresh questions on a topic, written by the AI from the topic's lessons, as a private practice set."""
    caller = Caller(await student_enrolment(request, ctx), ctx)
    me = caller.me
    topic = await session.get(Topic, topic_id)
    if topic is None:
        raise NotFound("Topic not found.")
    course = await my_course(session, me, topic.course_id)
    await ensure_tutor_allowed(session, me)
    lessons = list((await session.execute(
        select(Lesson).join(Module, Module.id == Lesson.module_id)
        .where(Lesson.topic_id == topic.id, Lesson.course_id == course.id).order_by(Module.position, Lesson.position)
    )).scalars())
    if not lessons:
        raise Conflict("This topic has no lessons to practise from yet.")
    await _reserve_ai(request, session, me)
    parsed = await generate(request, session, me, PRACTICE_RULES % AI_QUESTIONS_PER_SET, lesson_material(lessons))
    valid = keep_valid(parsed, "questions", validate_generated_question, AI_QUESTIONS_PER_SET)
    now = datetime.now(UTC)
    questions = [Question(institution_id=me.institution_id, course_id=course.id, topic_id=topic.id, source="ai",
                          owner_id=me.person_id, created_at=now, **fields) for fields in valid]
    session.add_all(questions)
    await session.flush()
    practice = await _practice_set(session, me, course.id, f"AI practice: {topic.title}", [q.id for q in questions])
    session.add(caller.event("ai_practice_generated", course.id,
                             {"topicId": str(topic.id), "assessmentId": str(practice.id), "questions": len(valid)}))
    await session.commit()
    (summary,) = await _summaries(session, me, [practice], {course.id: course})
    return summary


@router.post("/student/lessons/{lesson_id}/flashcards", status_code=201)
async def ai_flashcards(
    lesson_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Up to eight cards written by the AI from one lesson, added to the student's own review deck."""
    caller = Caller(await student_enrolment(request, ctx), ctx)
    me = caller.me
    lesson, _, course = await my_lesson(session, me, lesson_id)
    await ensure_tutor_allowed(session, me)
    await _reserve_ai(request, session, me)
    parsed = await generate(request, session, me, FLASHCARD_RULES % AI_CARDS_MAX, lesson_material([lesson]))
    valid = keep_valid(parsed, "cards", validate_generated_card, AI_CARDS_MAX)
    cards = [Flashcard(institution_id=me.institution_id, course_id=course.id, topic_id=lesson.topic_id,
                       lesson_id=lesson.id, source="ai", owner_id=me.person_id, **fields) for fields in valid]
    session.add_all(cards)
    session.add(caller.event("ai_flashcards_generated", course.id, {"lessonId": str(lesson.id), "cards": len(cards)}))
    await session.commit()
    topic = await session.get(Topic, lesson.topic_id) if lesson.topic_id else None
    return {"cards": [card_view(card, course, topic, None) for card in cards]}
