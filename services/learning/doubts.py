"""Doubts: a student asks the teacher of their class, usually about a lesson the AI tutor couldn't settle.

Students see only their own doubts; teachers see the doubts raised in the class sections they teach.
Student activity is recorded on the learning trail; teacher replies, AI drafts and transcript views are audited.
"""

from __future__ import annotations

import logging
import uuid
from contextlib import aclosing
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field, StringConstraints, model_validator
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import allowance, db, tutor
from services.learning.enrolment import Enrolment, my_course, my_lesson, student_enrolment, teacher_enrolment
from services.learning.files import describe_many, owned_attachments
from services.learning.models import (
    Course,
    Doubt,
    DoubtMessage,
    DoubtStatus,
    LearningEvent,
    Lesson,
    Topic,
    TutorMessage,
)
from services.learning.providers.base import ChatTurn, ProviderUnavailable
from services.shared.audit import AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import AppError, Conflict, NotFound, RateLimited, ValidationFailed
from services.shared.schemas import CamelModel

router = APIRouter()
log = logging.getLogger(__name__)

DAY = timedelta(days=1)
INSIGHTS_WINDOW = timedelta(days=30)
TOP_TOPICS = 3
LIST_LIMIT = 200
PREVIEW_CHARS = 140
TRANSCRIPT_TURNS = 40  # the end of the tutor chat is what led to the doubt
DRAFT_THREAD_CHARS = 12_000
SECONDS_PER_HOUR = 3600
SECONDS_PER_MINUTE = 60

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]

DRAFT_RULES = """You draft replies for a teacher answering a student's question ("doubt") about their course.
The teacher will edit your draft before sending it, so write it in the teacher's voice, addressed to the student.

- Answer the confusion directly and kindly, in under about 150 words, using the lesson material below.
- If the question looks like a graded assignment, quiz or exam question, explain the idea and the next step,
  but do not give the final answer.
- Use plain language, short Markdown lists, and `code` formatting for formulas or code.
- If the lesson does not cover it, say what the student should check, and never invent facts or numbers."""


class AiUnavailable(AppError):
    status_code = 503
    code = "AI_UNAVAILABLE"
    public_message = "AI drafts aren't available right now. Write your reply directly."


# ---- shapes ----

class DoubtIn(CamelModel):
    lesson_id: uuid.UUID | None = None
    course_id: uuid.UUID | None = None
    topic_id: uuid.UUID | None = None  # for course-level doubts; a lesson brings its own topic
    title: Title
    body: Body
    conversation_id: uuid.UUID | None = None  # the tutor chat it escalates from
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)  # photos of working, screenshots
    video_seconds: Annotated[int, Field(ge=0, le=int(DAY.total_seconds()))] | None = None

    @model_validator(mode="after")
    def _anchored(self) -> DoubtIn:
        if self.lesson_id is None and self.course_id is None:
            raise ValueError("Choose the lesson or course this doubt is about.")
        return self


class MessageIn(CamelModel):
    body: Body
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)


@dataclass(frozen=True)
class DoubtView:
    """A doubt with everything needed to show it."""

    doubt: Doubt
    course: Course
    topic: Topic | None
    lesson: Lesson | None
    messages: list[DoubtMessage]
    files: dict[str, dict]

    def summary(self, now: datetime) -> dict:
        doubt, last = self.doubt, self.messages[-1] if self.messages else None
        return {
            "id": str(doubt.id), "title": doubt.title, "status": doubt.status, "overdue": _is_overdue(doubt, now),
            "courseId": str(self.course.id), "courseCode": self.course.code, "courseTitle": self.course.title,
            "subject": self.course.subject,
            "topic": {"id": str(self.topic.id), "title": self.topic.title} if self.topic else None,
            "lesson": {"id": str(self.lesson.id), "title": self.lesson.title} if self.lesson else None,
            "createdAt": doubt.created_at.isoformat(), "updatedAt": doubt.updated_at.isoformat(),
            "replyDueAt": doubt.reply_due_at.isoformat(),
            "resolvedAt": doubt.resolved_at.isoformat() if doubt.resolved_at else None,
            "messageCount": len(self.messages),
            "lastMessage": {"authorRole": last.author_role, "preview": last.body[:PREVIEW_CHARS]} if last else None,
        }

    def detail(self, now: datetime) -> dict:
        conversation = self.doubt.conversation_id
        return {
            **self.summary(now),
            "videoSeconds": self.doubt.video_seconds,
            "conversationId": str(conversation) if conversation else None,
            "messages": [_message(m, self.files) for m in self.messages],
        }


def _is_overdue(doubt: Doubt, now: datetime) -> bool:
    return doubt.status == DoubtStatus.OPEN and doubt.reply_due_at < now


def _message(message: DoubtMessage, files: dict[str, dict]) -> dict:
    return {"id": str(message.id), "authorRole": message.author_role, "authorName": message.author_name,
            "body": message.body, "createdAt": message.created_at.isoformat(),
            "attachments": [files[i] for i in message.attachment_ids if i in files]}


async def _views(session: AsyncSession, doubts: list[Doubt]) -> list[DoubtView]:
    """Each doubt with its course, topic, lesson and messages, in four queries regardless of list length."""
    if not doubts:
        return []
    ids = [d.id for d in doubts]
    courses = {c.id: c for c in (await session.execute(
        select(Course).where(Course.id.in_({d.course_id for d in doubts}))
    )).scalars()}
    topics = {t.id: t for t in (await session.execute(
        select(Topic).where(Topic.id.in_({d.topic_id for d in doubts if d.topic_id}))
    )).scalars()}
    lessons = {lesson.id: lesson for lesson in (await session.execute(
        select(Lesson).where(Lesson.id.in_({d.lesson_id for d in doubts if d.lesson_id}))
    )).scalars()}
    messages: dict[uuid.UUID, list[DoubtMessage]] = {i: [] for i in ids}
    for message in (await session.execute(
        select(DoubtMessage).where(DoubtMessage.doubt_id.in_(ids)).order_by(DoubtMessage.created_at)
    )).scalars():
        messages[message.doubt_id].append(message)
    files = await describe_many(session, [i for thread in messages.values() for m in thread for i in m.attachment_ids])
    return [DoubtView(d, courses[d.course_id], topics.get(d.topic_id), lessons.get(d.lesson_id), messages[d.id], files)
            for d in doubts]


async def _view(session: AsyncSession, doubt: Doubt) -> DoubtView:
    (view,) = await _views(session, [doubt])
    return view


def _trail(me: Enrolment, ctx: RequestContext, doubt: Doubt, kind: str) -> LearningEvent:
    return LearningEvent(institution_id=me.institution_id, person_id=me.person_id, session_id=ctx.session_id,
                         kind=kind, course_id=doubt.course_id, lesson_id=doubt.lesson_id,
                         detail={"doubtId": str(doubt.id), "title": doubt.title})


def _reply_due(request: Request, now: datetime) -> datetime:
    return now + timedelta(hours=request.app.state.settings.doubt_reply_hours)


async def _audit(request: Request, ctx: RequestContext, action: str, doubt: Doubt) -> None:
    await request.app.state.audit.emit(ctx, AuditEvent(
        action=action, target_type="doubt", target_id=doubt.id, target_label=doubt.title,
        institution_id=doubt.institution_id,
    ))


# ---- student ----

async def _check_new_doubt_allowance(request: Request, session: AsyncSession, me: Enrolment,
                                     now: datetime) -> None:
    """Counted from saved doubts, so a failed save never uses up a student's allowance."""
    limit = request.app.state.settings.doubts_per_day
    asked = (await session.execute(select(func.count()).where(
        Doubt.student_id == me.person_id, Doubt.created_at >= now - DAY))).scalar_one()
    if asked >= limit:
        raise RateLimited(f"You can ask {limit} new doubts a day. Follow up on an existing one, or try tomorrow.")


async def _check_follow_up_allowance(request: Request, session: AsyncSession, me: Enrolment, doubt: Doubt,
                                     now: datetime) -> None:
    settings = request.app.state.settings
    in_thread = (await session.execute(select(func.count()).where(
        DoubtMessage.doubt_id == doubt.id))).scalar_one()
    if in_thread >= settings.doubt_messages_max:
        raise Conflict("This conversation is full. Ask a new doubt to keep going.")
    sent_today = (await session.execute(select(func.count()).where(
        DoubtMessage.author_id == me.person_id, DoubtMessage.created_at >= now - DAY))).scalar_one()
    if sent_today >= settings.doubt_follow_ups_per_day:
        raise RateLimited("You've sent a lot of follow-ups today. Your teacher will see them; try again tomorrow.")


async def _check_conversation(session: AsyncSession, me: Enrolment, conversation_id: uuid.UUID,
                              course: Course) -> None:
    """The tutor chat must be the student's own and about this course (or no lesson), since the teacher sees it."""
    rows = (await session.execute(
        select(TutorMessage.person_id, Lesson.course_id)
        .outerjoin(Lesson, Lesson.id == TutorMessage.lesson_id)
        .where(TutorMessage.conversation_id == conversation_id)
    )).all()
    if not rows or any(person_id != me.person_id for person_id, _ in rows):
        raise NotFound("Tutor conversation not found.")
    if any(course_id not in (None, course.id) for _, course_id in rows):
        raise ValidationFailed("That tutor chat is about a different course.")


async def _my_doubt(session: AsyncSession, me: Enrolment, doubt_id: uuid.UUID) -> Doubt:
    doubt = await session.get(Doubt, doubt_id)
    if doubt is None or doubt.student_id != me.person_id or doubt.institution_id != me.institution_id:
        raise NotFound("Doubt not found.")
    return doubt


@dataclass(frozen=True)
class Anchor:
    course: Course
    topic_id: uuid.UUID | None
    lesson: Lesson | None


async def _anchor(session: AsyncSession, me: Enrolment, body: DoubtIn) -> Anchor:
    """What the doubt is about: a lesson (which brings its course and topic), or a course and optional topic."""
    if body.lesson_id is not None:
        lesson, _, course = await my_lesson(session, me, body.lesson_id)
        if body.course_id not in (None, course.id) or body.topic_id not in (None, lesson.topic_id):
            raise ValidationFailed("That lesson belongs to a different course or topic.")
        return Anchor(course, lesson.topic_id, lesson)
    course = await my_course(session, me, body.course_id)
    if body.topic_id is not None:
        topic = await session.get(Topic, body.topic_id)
        if topic is None or topic.course_id != course.id:
            raise ValidationFailed("That topic belongs to a different course.")
    return Anchor(course, body.topic_id, None)


@router.post("/student/doubts", status_code=201)
async def ask(
    body: DoubtIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    anchor = await _anchor(session, me, body)
    course, lesson = anchor.course, anchor.lesson
    if body.conversation_id is not None:
        await _check_conversation(session, me, body.conversation_id, course)
    now = datetime.now(UTC)
    await _check_new_doubt_allowance(request, session, me, now)

    doubt = Doubt(institution_id=me.institution_id, section_id=course.section_id, course_id=course.id,
                  topic_id=anchor.topic_id, lesson_id=lesson.id if lesson else None,
                  student_id=me.person_id, session_id=ctx.session_id, conversation_id=body.conversation_id,
                  video_seconds=body.video_seconds, title=body.title, reply_due_at=_reply_due(request, now),
                  created_at=now, updated_at=now)
    session.add(doubt)
    await session.flush()
    session.add(DoubtMessage(institution_id=me.institution_id, doubt_id=doubt.id, author_id=me.person_id,
                             author_role="student", body=body.body, created_at=now,
                             attachment_ids=await owned_attachments(session, me, body.attachment_ids)))
    session.add(_trail(me, ctx, doubt, "doubt_asked"))
    await session.commit()
    return (await _view(session, doubt)).detail(now)


@router.get("/student/doubts")
async def my_doubts(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    status: DoubtStatus | None = None,
) -> dict:
    me = await student_enrolment(request, ctx)
    mine = (Doubt.student_id == me.person_id, Doubt.institution_id == me.institution_id)
    query = select(Doubt).where(*mine).order_by(Doubt.updated_at.desc()).limit(LIST_LIMIT)
    if status is not None:
        query = query.where(Doubt.status == status)
    counts = dict((await session.execute(
        select(Doubt.status, func.count()).where(*mine).group_by(Doubt.status)
    )).all())
    now = datetime.now(UTC)
    return {"items": [v.summary(now) for v in await _views(session, list((await session.execute(query)).scalars()))],
            "counts": {s.value: counts.get(s.value, 0) for s in DoubtStatus},
            "replyTargetHours": request.app.state.settings.doubt_reply_hours}


@router.get("/student/doubts/{doubt_id}")
async def my_doubt(
    doubt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    return (await _view(session, await _my_doubt(session, me, doubt_id))).detail(datetime.now(UTC))


@router.post("/student/doubts/{doubt_id}/messages")
async def follow_up(
    doubt_id: uuid.UUID,
    body: MessageIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """A follow-up on an answered or resolved doubt puts it back in the teacher's queue with a fresh reply
    target. While the doubt is still waiting, the original target stands, so it can't be pushed back."""
    me = await student_enrolment(request, ctx)
    doubt = await _my_doubt(session, me, doubt_id)
    now = datetime.now(UTC)
    await _check_follow_up_allowance(request, session, me, doubt, now)
    session.add(DoubtMessage(institution_id=me.institution_id, doubt_id=doubt.id, author_id=me.person_id,
                             author_role="student", body=body.body, created_at=now,
                             attachment_ids=await owned_attachments(session, me, body.attachment_ids)))
    kind = "doubt_reopened" if doubt.status == DoubtStatus.RESOLVED else "doubt_followup"
    if doubt.status != DoubtStatus.OPEN:
        doubt.status, doubt.resolved_at, doubt.reply_due_at = DoubtStatus.OPEN, None, _reply_due(request, now)
    doubt.updated_at = now
    session.add(_trail(me, ctx, doubt, kind))
    await session.commit()
    return (await _view(session, doubt)).detail(now)


@router.post("/student/doubts/{doubt_id}/resolve")
async def resolve(
    doubt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Idempotent: resolving a resolved doubt returns it unchanged."""
    me = await student_enrolment(request, ctx)
    doubt = await _my_doubt(session, me, doubt_id)
    now = datetime.now(UTC)
    if doubt.status != DoubtStatus.RESOLVED:
        doubt.status, doubt.resolved_at, doubt.updated_at = DoubtStatus.RESOLVED, now, now
        session.add(_trail(me, ctx, doubt, "doubt_resolved"))
        await session.commit()
    return (await _view(session, doubt)).detail(now)


async def doubts_on_topic(session: AsyncSession, me: Enrolment, topic_id: uuid.UUID) -> list[dict]:
    """The student's own doubts on a topic, newest first, for the topic page."""
    doubts = list((await session.execute(
        select(Doubt).where(Doubt.student_id == me.person_id, Doubt.institution_id == me.institution_id,
                            Doubt.topic_id == topic_id).order_by(Doubt.updated_at.desc()).limit(LIST_LIMIT)
    )).scalars())
    now = datetime.now(UTC)
    return [v.summary(now) for v in await _views(session, doubts)]


# ---- teacher ----

InboxFilter = Literal["open", "overdue", "answered", "resolved"]


async def _class_doubt(session: AsyncSession, me: Enrolment, doubt_id: uuid.UUID) -> Doubt:
    doubt = await session.get(Doubt, doubt_id)
    if doubt is None or doubt.institution_id != me.institution_id or doubt.section_id not in me.section_ids:
        raise NotFound("Doubt not found.")
    return doubt


def _require_unresolved(doubt: Doubt) -> None:
    if doubt.status == DoubtStatus.RESOLVED:
        raise Conflict("The student has resolved this doubt. They can reopen it with a follow-up.")


def _with_student(summary: dict, doubt: Doubt, me: Enrolment) -> dict:
    name = me.student_names.get(doubt.student_id)
    if name is None:
        log.warning("doubt_student_not_on_roster", extra={"doubt": str(doubt.id), "student": str(doubt.student_id)})
    return {**summary, "student": {"id": str(doubt.student_id), "name": name or "Former student"}}


async def _insights(session: AsyncSession, scope: tuple, now: datetime) -> dict:
    recent = (*scope, Doubt.created_at >= now - INSIGHTS_WINDOW)
    wait_seconds = extract("epoch", Doubt.first_answered_at - Doubt.created_at)
    average = (await session.execute(
        select(func.avg(wait_seconds)).where(*recent, Doubt.first_answered_at.is_not(None))
    )).scalar_one()
    asked = func.count(Doubt.id)
    top = (await session.execute(
        select(Topic.id, Topic.title, asked).join(Doubt, Doubt.topic_id == Topic.id).where(*recent)
        .group_by(Topic.id, Topic.title).order_by(asked.desc(), Topic.title).limit(TOP_TOPICS)
    )).all()
    return {
        "avgFirstResponseHours": round(float(average) / SECONDS_PER_HOUR, 1) if average is not None else None,
        "topTopics": [{"id": str(topic_id), "title": title, "count": n} for topic_id, title, n in top],
        "windowDays": INSIGHTS_WINDOW.days,
    }


@router.get("/teacher/doubts")
async def inbox(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    status: InboxFilter | None = None,
) -> dict:
    """Doubts from the teacher's classes: waiting ones first by reply target (so overdue lead), then the rest."""
    me = await teacher_enrolment(request, ctx)
    now = datetime.now(UTC)
    scope = (Doubt.institution_id == me.institution_id, Doubt.section_id.in_(me.section_ids))
    overdue = (Doubt.status == DoubtStatus.OPEN, Doubt.reply_due_at < now)
    query = select(Doubt).where(*scope).limit(LIST_LIMIT)
    if status == "overdue":
        query = query.where(*overdue)
    elif status is not None:
        query = query.where(Doubt.status == status)
    doubts = list((await session.execute(query)).scalars())
    waiting = sorted((d for d in doubts if d.status == DoubtStatus.OPEN), key=lambda d: d.reply_due_at)
    handled = sorted((d for d in doubts if d.status != DoubtStatus.OPEN), key=lambda d: d.updated_at, reverse=True)
    counts = dict((await session.execute(
        select(Doubt.status, func.count()).where(*scope).group_by(Doubt.status)
    )).all())
    overdue_count = (await session.execute(select(func.count()).where(*scope, *overdue))).scalar_one()
    return {
        "items": [_with_student(v.summary(now), v.doubt, me) for v in await _views(session, waiting + handled)],
        "counts": {**{s.value: counts.get(s.value, 0) for s in DoubtStatus}, "overdue": overdue_count},
        "insights": await _insights(session, scope, now),
    }


async def _transcript(session: AsyncSession, doubt: Doubt) -> list[dict]:
    if doubt.conversation_id is None:
        return []
    latest = (await session.execute(
        select(TutorMessage)
        .where(TutorMessage.conversation_id == doubt.conversation_id, TutorMessage.person_id == doubt.student_id)
        .order_by(TutorMessage.created_at.desc()).limit(TRANSCRIPT_TURNS)
    )).scalars().all()
    return [{"role": m.role, "content": m.content, "createdAt": m.created_at.isoformat()} for m in reversed(latest)]


@router.get("/teacher/doubts/{doubt_id}")
async def class_doubt(
    doubt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    doubt = await _class_doubt(session, me, doubt_id)
    transcript = await _transcript(session, doubt)
    if transcript:
        await _audit(request, ctx, "doubt.transcript_view", doubt)  # a minor's AI chat was shown to staff
    detail = (await _view(session, doubt)).detail(datetime.now(UTC))
    return {**_with_student(detail, doubt, me), "tutorTranscript": transcript}


@router.post("/teacher/doubts/{doubt_id}/messages")
async def answer(
    doubt_id: uuid.UUID,
    body: MessageIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    doubt = await _class_doubt(session, me, doubt_id)
    _require_unresolved(doubt)
    teacher = await request.app.state.users.get(f"/internal/people/{me.person_id}", ctx=ctx)
    now = datetime.now(UTC)
    session.add(DoubtMessage(institution_id=me.institution_id, doubt_id=doubt.id, author_id=me.person_id,
                             author_role="teacher", author_name=teacher["name"], body=body.body, created_at=now,
                             attachment_ids=await owned_attachments(session, me, body.attachment_ids)))
    doubt.status, doubt.updated_at = DoubtStatus.ANSWERED, now
    doubt.first_answered_at = doubt.first_answered_at or now
    await session.commit()
    await _audit(request, ctx, "doubt.answer", doubt)
    return _with_student((await _view(session, doubt)).detail(now), doubt, me)


def _check_draft_allowance(request: Request, teacher_id: uuid.UUID) -> None:
    """Drafts call a paid model, so each teacher gets a per-minute allowance."""
    allowed, retry_after = request.app.state.draft_limiter.check(
        f"draft:{teacher_id}", limit=request.app.state.settings.doubt_drafts_per_minute,
        window_seconds=SECONDS_PER_MINUTE)
    if not allowed:
        raise RateLimited("Too many drafts in a row. Wait a moment, then try again.",
                          details={"retryAfterSeconds": retry_after})


def _draft_question(doubt: Doubt, thread: list[DoubtMessage]) -> str:
    """The doubt and its thread, keeping the most recent messages when the thread is long."""
    lines = [f"{m.author_role.title()}: {m.body}" for m in thread]
    kept: list[str] = []
    for line in reversed(lines):
        if sum(map(len, kept)) + len(line) > DRAFT_THREAD_CHARS:
            break
        kept.insert(0, line)
    return f"Doubt: {doubt.title}\n\n" + "\n\n".join(kept)


@router.post("/teacher/doubts/{doubt_id}/draft")
async def draft(
    doubt_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """An AI-written starting point for the teacher's reply. It is returned, never sent."""
    me = await teacher_enrolment(request, ctx)
    doubt = await _class_doubt(session, me, doubt_id)
    _require_unresolved(doubt)
    _check_draft_allowance(request, me.person_id)
    settings = request.app.state.settings
    await allowance.reserve(session, institution_id=me.institution_id, person_id=me.person_id, kind="doubt_draft",
                            limit=settings.doubt_drafts_per_day,
                            message="You've used today's AI drafts. Write your reply directly.")
    provider = await tutor.provider_for(session, request.app.state.tutor_providers, me.institution_id,
                                        settings.tutor_default_provider)
    context = await tutor.lesson_context(session, doubt.lesson_id)
    thread = list((await session.execute(
        select(DoubtMessage).where(DoubtMessage.doubt_id == doubt.id).order_by(DoubtMessage.created_at)
    )).scalars())
    stream = provider.stream(system=[DRAFT_RULES] + ([context] if context else []),
                             history=[ChatTurn(role="user", content=_draft_question(doubt, thread))],
                             max_tokens=settings.doubt_draft_max_tokens)
    try:
        async with aclosing(stream) as fragments:
            text = "".join([fragment async for fragment in fragments]).strip()
    except Exception as exc:
        reason = exc.reason if isinstance(exc, ProviderUnavailable) else "error"
        log.warning("doubt_draft_failed", extra={"provider": provider.name, "reason": reason}, exc_info=True)
        raise AiUnavailable() from exc
    if not text:
        log.warning("doubt_draft_empty", extra={"provider": provider.name})
        raise AiUnavailable()
    await _audit(request, ctx, "doubt.draft", doubt)
    return {"draft": text}
