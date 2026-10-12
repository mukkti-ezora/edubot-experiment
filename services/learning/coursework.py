"""Coursework: assignment submission, drafts, resubmission, late rules, extension requests, and teacher grading.

Students see the assignments of the courses they attend; teachers see submissions and extension requests from
the class sections they teach. Student actions go on the learning trail; teacher decisions are audited.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import AnyHttpUrl, Field, StringConstraints, UrlConstraints
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import db
from services.learning.enrolment import Enrolment, my_courses, student_enrolment, teacher_enrolment
from services.learning.files import describe_many, owned_attachments
from services.learning.models import Assignment, Course, ExtensionRequest, LearningEvent, Submission
from services.learning.trail import trail_event
from services.shared.audit import AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import Conflict, NotFound, ValidationFailed
from services.shared.schemas import CamelModel

router = APIRouter()

MINUTES_PER_DAY = 24 * 60
SECONDS_PER_MINUTE = 60
PERCENT = 100
LIST_LIMIT = 200
LINK_MAX_LENGTH = 500  # Submission.link column size
MAX_EXTENSION = timedelta(days=14)  # beyond the current deadline; also keeps dates far from overflow

SubmissionText = Annotated[str, StringConstraints(max_length=50_000)]
WebLink = Annotated[AnyHttpUrl, UrlConstraints(max_length=LINK_MAX_LENGTH, allowed_schemes=["http", "https"])]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


# ---- rules (pure, so the boundaries are unit-tested) ----

def is_handed_in(submission: Submission | None) -> bool:
    """Submitted or graded work counts as handed in; a saved draft does not."""
    return submission is not None and submission.status in ("submitted", "graded")


def minutes_late(due: datetime, at: datetime) -> int:
    """Whole minutes after the deadline, rounded up; handing in exactly on time is not late."""
    return max(0, math.ceil((at - due).total_seconds() / SECONDS_PER_MINUTE))


def late_score(raw: float, late_minutes: int, percent_per_day: int) -> float:
    """The late penalty is charged per started day, and never takes a score below zero."""
    return round(max(0.0, raw * (1 - late_penalty_percent(late_minutes, percent_per_day) / PERCENT)), 2)


def late_penalty_percent(late_minutes: int, percent_per_day: int) -> int:
    """The share of the score taken off: `percent_per_day` for each started day late, at most all of it."""
    return min(PERCENT, percent_per_day * math.ceil(late_minutes / MINUTES_PER_DAY))


def effective_due(assignment: Assignment, extensions: list[ExtensionRequest]) -> datetime:
    """The deadline that applies to this student: the latest approved extension, or the assignment's own."""
    approved = [e.requested_until for e in extensions if e.status == "approved"]
    return max(approved, default=assignment.due_at)


def extension_auto_approves(*, now: datetime, due: datetime, until: datetime, window_hours: int,
                            earlier_requests: int) -> bool:
    """First requests made before the deadline, for at most `window_hours` more, are approved straight away."""
    return earlier_requests == 0 and now < due and until - due <= timedelta(hours=window_hours)


# ---- loading ----

@dataclass(frozen=True)
class Work:
    """One assignment from the student's point of view: the work, its course, their submission, extensions."""

    assignment: Assignment
    course: Course
    submission: Submission | None
    extensions: list[ExtensionRequest]

    @property
    def due(self) -> datetime:
        return effective_due(self.assignment, self.extensions)

    @property
    def closes(self) -> datetime:
        return self.due + timedelta(days=self.assignment.accepts_late_days)

    @property
    def resubmissions_left(self) -> int:
        allowed_submits = 1 + self.assignment.max_resubmissions
        return max(0, allowed_submits - (self.submission.revision if self.submission else 0))

    def status(self, now: datetime) -> str:
        submission = self.submission
        if submission is None or submission.status == "draft":
            if now > self.closes:
                return "missing"
            return "draft" if submission else "not_started"
        if submission.status == "graded":
            return "graded"
        return "late" if submission.late_minutes else "submitted"

    def summary(self, now: datetime) -> dict:
        assignment, submission = self.assignment, self.submission
        latest_extension = self.extensions[-1] if self.extensions else None
        graded = submission is not None and submission.status == "graded"
        return {
            "id": str(assignment.id), "title": assignment.title, "kind": assignment.kind,
            "courseId": str(self.course.id), "courseCode": self.course.code, "courseTitle": self.course.title,
            "subject": self.course.subject, "points": assignment.points,
            "dueAt": assignment.due_at.isoformat(), "effectiveDueAt": self.due.isoformat(),
            "closesAt": self.closes.isoformat(), "status": self.status(now),
            "score": submission.score if graded else None,
            "lateMinutes": submission.late_minutes if is_handed_in(submission) else 0,
            "feedbackReady": graded and submission.feedback_seen_at is None,
            "extension": _extension(latest_extension) if latest_extension else None,
        }


def _extension(request: ExtensionRequest) -> dict:
    return {"id": str(request.id), "status": request.status, "until": request.requested_until.isoformat(),
            "reason": request.reason, "autoApproved": request.auto_approved, "note": request.decision_note,
            "createdAt": request.created_at.isoformat()}


async def load_works(session: AsyncSession, person_id: uuid.UUID, assignments: list[tuple[Assignment, Course]]
                     ) -> list[Work]:
    """Each assignment with the student's submission and extensions, in two queries regardless of count."""
    ids = [a.id for a, _ in assignments]
    if not ids:
        return []
    submissions = {s.assignment_id: s for s in (await session.execute(
        select(Submission).where(Submission.assignment_id.in_(ids), Submission.person_id == person_id)
    )).scalars()}
    extensions: dict[uuid.UUID, list[ExtensionRequest]] = {i: [] for i in ids}
    for request in (await session.execute(
        select(ExtensionRequest).where(ExtensionRequest.assignment_id.in_(ids), ExtensionRequest.person_id == person_id)
        .order_by(ExtensionRequest.created_at)
    )).scalars():
        extensions[request.assignment_id].append(request)
    return [Work(a, c, submissions.get(a.id), extensions[a.id]) for a, c in assignments]


async def _my_work(session: AsyncSession, me: Enrolment, assignment_id: uuid.UUID) -> Work:
    row = (await session.execute(
        select(Assignment, Course).join(Course, Course.id == Assignment.course_id).where(Assignment.id == assignment_id)
    )).first()
    if row is None or row[1].institution_id != me.institution_id or row[1].section_id not in me.section_ids:
        raise NotFound("Assignment not found.")
    (work,) = await load_works(session, me.person_id, [tuple(row)])
    return work


async def _submission_detail(session: AsyncSession, submission: Submission | None) -> dict | None:
    if submission is None:
        return None
    files = await describe_many(session, submission.attachment_ids)
    graded = submission.status == "graded"
    return {
        "id": str(submission.id), "status": submission.status, "text": submission.text, "link": submission.link,
        "attachments": [files[i] for i in submission.attachment_ids if i in files],
        "revision": submission.revision, "lateMinutes": submission.late_minutes,
        "submittedAt": submission.submitted_at.isoformat() if is_handed_in(submission) else None,
        "updatedAt": submission.updated_at.isoformat(),
        "score": submission.score if graded else None, "feedback": submission.feedback if graded else None,
        "rubricScores": submission.rubric_scores if graded else [],
        "gradedAt": submission.graded_at.isoformat() if submission.graded_at else None,
    }


async def _work_detail(session: AsyncSession, work: Work, now: datetime) -> dict:
    assignment = work.assignment
    return {
        **work.summary(now),
        "instructions": assignment.instructions, "submissionTypes": assignment.submission_types,
        "rubric": assignment.rubric, "gradeCategory": assignment.grade_category,
        "latePenaltyPercentPerDay": assignment.late_penalty_percent_per_day,
        "acceptsLateDays": assignment.accepts_late_days, "maxResubmissions": assignment.max_resubmissions,
        "resubmissionsLeft": work.resubmissions_left,
        "submission": await _submission_detail(session, work.submission),
        "extensions": [_extension(e) for e in work.extensions],
    }


def _trail(me: Enrolment, ctx: RequestContext, work: Work, kind: str, **detail: object) -> LearningEvent:
    return trail_event(me, ctx, kind, course_id=work.course.id,
                       detail={"assignmentId": str(work.assignment.id), "title": work.assignment.title, **detail})


async def _lock_work(session: AsyncSession, person_id: uuid.UUID, assignment_id: uuid.UUID) -> None:
    """Serialise one student's writes to one assignment, so check-then-insert can't race (double clicks, tabs)."""
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                          {"key": f"coursework:{person_id}:{assignment_id}"})


# ---- student ----

class WorkIn(CamelModel):
    text: SubmissionText = ""
    link: WebLink | None = None
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)


class ExtensionIn(CamelModel):
    until: datetime
    reason: Reason


def _require_not_graded(work: Work) -> None:
    if work.submission is not None and work.submission.status == "graded":
        raise Conflict("This work has been graded, so it can't be changed.")


def _check_types(assignment: Assignment, body: WorkIn) -> None:
    used = {"text": bool(body.text.strip()), "link": body.link is not None, "file": bool(body.attachment_ids)}
    if not any(used.values()):
        raise ValidationFailed("Add your answer, a link or a file before handing in.")
    refused = [kind for kind, present in used.items() if present and kind not in assignment.submission_types]
    if refused:
        raise ValidationFailed(f"This assignment doesn't take a {refused[0]}.")


async def _write(session: AsyncSession, me: Enrolment, work: Work, body: WorkIn, now: datetime) -> Submission:
    submission = work.submission or Submission(institution_id=me.institution_id, assignment_id=work.assignment.id,
                                               person_id=me.person_id, status="draft", submitted_at=None,
                                               revision=0, late_minutes=0, rubric_scores=[])
    submission.text, submission.link = body.text, str(body.link) if body.link else None
    submission.attachment_ids = await owned_attachments(session, me, body.attachment_ids)
    submission.updated_at = now
    session.add(submission)
    return submission


@router.get("/student/assignments")
async def my_assignments(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    courses = {c.id: c for c in await my_courses(session, me)}
    latest = (await session.execute(
        select(Assignment).where(Assignment.course_id.in_(courses)).order_by(Assignment.due_at.desc())
        .limit(LIST_LIMIT)
    )).scalars().all() if courses else []
    assignments = sorted(latest, key=lambda a: a.due_at)  # keep the most recent, show in date order
    now = datetime.now(UTC)
    works = await load_works(session, me.person_id, [(a, courses[a.course_id]) for a in assignments])
    items = [w.summary(now) for w in works]
    counts: dict[str, int] = {}
    for item in items:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    return {"items": items, "counts": counts}


@router.get("/student/assignments/{assignment_id}")
async def my_assignment(
    assignment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    return await _work_detail(session, await _my_work(session, me, assignment_id), datetime.now(UTC))


@router.put("/student/assignments/{assignment_id}/draft")
async def save_draft(
    assignment_id: uuid.UUID,
    body: WorkIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Drafts are for work not yet handed in; to change handed-in work, submit again."""
    me = await student_enrolment(request, ctx)
    await _lock_work(session, me.person_id, assignment_id)
    work = await _my_work(session, me, assignment_id)
    if is_handed_in(work.submission):
        raise Conflict("You've already handed this in. Submit again to replace it.")
    now = datetime.now(UTC)
    submission = await _write(session, me, work, body, now)
    await session.commit()
    return await _work_detail(session, Work(work.assignment, work.course, submission, work.extensions), now)


@router.post("/student/assignments/{assignment_id}/submit")
async def submit(
    assignment_id: uuid.UUID,
    body: WorkIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    await _lock_work(session, me.person_id, assignment_id)
    work = await _my_work(session, me, assignment_id)
    _require_not_graded(work)
    _check_types(work.assignment, body)
    now = datetime.now(UTC)
    if now > work.closes:
        raise Conflict("Submissions for this assignment have closed.")
    if work.resubmissions_left == 0:
        raise Conflict("You've used all your submissions for this assignment.")
    submission = await _write(session, me, work, body, now)
    submission.status, submission.submitted_at = "submitted", now
    submission.revision += 1
    submission.late_minutes = minutes_late(work.due, now)
    submission.feedback_seen_at = None
    session.add(_trail(me, ctx, work, "assignment_submitted", revision=submission.revision,
                       lateMinutes=submission.late_minutes))
    await session.commit()
    return await _work_detail(session, Work(work.assignment, work.course, submission, work.extensions), now)


@router.post("/student/assignments/{assignment_id}/extension", status_code=201)
async def ask_for_extension(
    assignment_id: uuid.UUID,
    body: ExtensionIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    await _lock_work(session, me.person_id, assignment_id)
    work = await _my_work(session, me, assignment_id)
    _require_not_graded(work)
    if any(e.status == "pending" for e in work.extensions):
        raise Conflict("You already have an extension request waiting for your teacher.")
    until = body.until if body.until.tzinfo else body.until.replace(tzinfo=UTC)
    if until <= work.due:
        raise ValidationFailed("Ask for a date after the current deadline.")
    if until - work.due > MAX_EXTENSION:
        raise ValidationFailed(f"Ask for at most {MAX_EXTENSION.days} days beyond the current deadline.")
    now = datetime.now(UTC)
    approved = extension_auto_approves(now=now, due=work.assignment.due_at, until=until,
                                       window_hours=request.app.state.settings.extension_auto_approve_hours,
                                       earlier_requests=len(work.extensions))
    extension = ExtensionRequest(institution_id=me.institution_id, assignment_id=work.assignment.id,
                                 person_id=me.person_id, requested_until=until, reason=body.reason,
                                 status="approved" if approved else "pending", auto_approved=approved,
                                 decided_at=now if approved else None, created_at=now)
    session.add(extension)
    session.add(_trail(me, ctx, work, "extension_requested", until=until.isoformat(), autoApproved=approved))
    await session.commit()
    return await _work_detail(session, Work(work.assignment, work.course, work.submission,
                                            [*work.extensions, extension]), now)


@router.post("/student/assignments/{assignment_id}/feedback-seen")
async def feedback_seen(
    assignment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    work = await _my_work(session, me, assignment_id)
    now = datetime.now(UTC)
    if work.submission is not None and work.submission.status == "graded" and work.submission.feedback_seen_at is None:
        work.submission.feedback_seen_at = now
        await session.commit()
    return await _work_detail(session, work, now)


# ---- teacher ----

ToGrade = Literal["to_grade", "graded"]


class RubricScoreIn(CamelModel):
    criterion: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    points: Annotated[float, Field(ge=0)]


class GradeIn(CamelModel):
    rubric_scores: list[RubricScoreIn] = Field(default_factory=list)
    score: Annotated[float, Field(ge=0)] | None = None
    feedback: Note = ""


class DecisionIn(CamelModel):
    approve: bool
    note: Note = ""


def _direct_score(assignment: Assignment, score: float | None) -> float:
    if score is None:
        raise ValidationFailed("Enter a score.")
    if score > assignment.points:
        raise ValidationFailed(f"The score can be at most {assignment.points}.")
    return score


def _raw_score(assignment: Assignment, body: GradeIn) -> float:
    """Rubric points scaled to the assignment's points. Without a rubric, or with one worth no points (nothing to
    scale by), the teacher's score is used directly."""
    if not assignment.rubric:
        return _direct_score(assignment, body.score)
    limits = {c["criterion"]: c["points"] for c in assignment.rubric}
    given = {s.criterion: s.points for s in body.rubric_scores}
    if set(given) != set(limits):
        raise ValidationFailed("Score every rubric criterion.")
    over = [name for name, points in given.items() if points > limits[name]]
    if over:
        raise ValidationFailed(f"\"{over[0]}\" can be at most {limits[over[0]]} points.")
    rubric_total = sum(limits.values())
    if rubric_total <= 0:
        return _direct_score(assignment, body.score)
    return round(sum(given.values()) / rubric_total * assignment.points, 2)


async def _class_submission(session: AsyncSession, me: Enrolment, submission_id: uuid.UUID
                            ) -> tuple[Submission, Assignment, Course]:
    row = (await session.execute(
        select(Submission, Assignment, Course).join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id).where(Submission.id == submission_id)
    )).first()
    if (row is None or row[2].institution_id != me.institution_id or row[2].section_id not in me.section_ids
            or not is_handed_in(row[0])):
        raise NotFound("Submission not found.")
    return row


def _student(me: Enrolment, person_id: uuid.UUID) -> dict:
    return {"id": str(person_id), "name": me.student_names.get(person_id, "Former student")}


def _submission_row(me: Enrolment, submission: Submission, assignment: Assignment, course: Course) -> dict:
    return {
        "id": str(submission.id), "status": submission.status, "student": _student(me, submission.person_id),
        "assignment": {"id": str(assignment.id), "title": assignment.title, "points": assignment.points,
                       "dueAt": assignment.due_at.isoformat()},
        "courseCode": course.code, "submittedAt": submission.submitted_at.isoformat(),
        "lateMinutes": submission.late_minutes, "revision": submission.revision, "score": submission.score,
    }


def _class_scope(me: Enrolment) -> tuple:
    return (Course.institution_id == me.institution_id, Course.section_id.in_(me.section_ids))


@router.get("/teacher/submissions")
async def submissions_to_grade(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    status: ToGrade = "to_grade",
) -> dict:
    """Handed-in work from the teacher's classes: oldest first to grade, newest first once graded."""
    me = await teacher_enrolment(request, ctx)
    wanted = "submitted" if status == "to_grade" else "graded"
    order = Submission.submitted_at.asc() if status == "to_grade" else Submission.graded_at.desc()
    rows = (await session.execute(
        select(Submission, Assignment, Course).join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(*_class_scope(me), Submission.status == wanted).order_by(order).limit(LIST_LIMIT)
    )).all()
    counts = dict((await session.execute(
        select(Submission.status, func.count()).join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(*_class_scope(me), Submission.status.in_(("submitted", "graded"))).group_by(Submission.status)
    )).all())
    return {"items": [_submission_row(me, *row) for row in rows],
            "counts": {"toGrade": counts.get("submitted", 0), "graded": counts.get("graded", 0)}}


async def _graded_view(session: AsyncSession, me: Enrolment, submission: Submission, assignment: Assignment,
                       course: Course) -> dict:
    return {**_submission_row(me, submission, assignment, course),
            "assignment": {"id": str(assignment.id), "title": assignment.title, "points": assignment.points,
                           "dueAt": assignment.due_at.isoformat(), "instructions": assignment.instructions,
                           "rubric": assignment.rubric,
                           "latePenaltyPercentPerDay": assignment.late_penalty_percent_per_day},
            "work": {**(await _submission_detail(session, submission)), "score": submission.score,
                     "feedback": submission.feedback, "rubricScores": submission.rubric_scores}}


@router.get("/teacher/submissions/{submission_id}")
async def class_submission(
    submission_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    return await _graded_view(session, me, *await _class_submission(session, me, submission_id))


@router.post("/teacher/submissions/{submission_id}/grade")
async def grade(
    submission_id: uuid.UUID,
    body: GradeIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    submission, assignment, course = await _class_submission(session, me, submission_id)
    raw = _raw_score(assignment, body)
    now = datetime.now(UTC)
    penalty = late_penalty_percent(submission.late_minutes, assignment.late_penalty_percent_per_day)
    submission.score = late_score(raw, submission.late_minutes, assignment.late_penalty_percent_per_day)
    submission.rubric_scores = [s.model_dump() for s in body.rubric_scores]
    submission.feedback = body.feedback or None
    submission.status, submission.graded_at, submission.graded_by = "graded", now, me.person_id
    submission.feedback_seen_at, submission.updated_at = None, now
    await session.commit()
    await request.app.state.audit.emit(ctx, AuditEvent(
        action="submission.grade", target_type="submission", target_id=submission.id,
        target_label=assignment.title, institution_id=me.institution_id,
        diff={"score": submission.score, "rawScore": raw, "points": assignment.points,
              "latePenaltyPercent": penalty},
    ))
    return await _graded_view(session, me, submission, assignment, course)


@router.get("/teacher/requests/extensions")
async def extension_requests(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Pending extension requests for the teacher's classes, oldest first."""
    me = await teacher_enrolment(request, ctx)
    rows = (await session.execute(
        select(ExtensionRequest, Assignment, Course).join(Assignment, Assignment.id == ExtensionRequest.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(*_class_scope(me), ExtensionRequest.status == "pending")
        .order_by(ExtensionRequest.created_at).limit(LIST_LIMIT)
    )).all()
    return {"items": [{**_extension(e), "student": _student(me, e.person_id),
                       "assignment": {"id": str(a.id), "title": a.title, "dueAt": a.due_at.isoformat()},
                       "courseCode": c.code} for e, a, c in rows]}


@router.post("/teacher/requests/extensions/{request_id}/decide")
async def decide_extension(
    request_id: uuid.UUID,
    body: DecisionIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    row = (await session.execute(
        select(ExtensionRequest, Assignment, Course).join(Assignment, Assignment.id == ExtensionRequest.assignment_id)
        .join(Course, Course.id == Assignment.course_id).where(ExtensionRequest.id == request_id)
    )).first()
    if row is None or row[2].institution_id != me.institution_id or row[2].section_id not in me.section_ids:
        raise NotFound("Request not found.")
    extension, assignment, _ = row
    if extension.status != "pending":
        raise Conflict("This request has already been decided.")
    extension.status = "approved" if body.approve else "declined"
    extension.decided_by, extension.decided_at = me.person_id, datetime.now(UTC)
    extension.decision_note = body.note or None
    await session.commit()
    await request.app.state.audit.emit(ctx, AuditEvent(
        action=f"extension.{extension.status}", target_type="extension_request", target_id=extension.id,
        target_label=assignment.title, institution_id=me.institution_id,
        diff={"until": extension.requested_until.isoformat()},
    ))
    return {**_extension(extension), "student": _student(me, extension.person_id)}
