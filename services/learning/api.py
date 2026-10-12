"""Student-facing learning API (slice 1: Today, Learn, lessons, tutor). Called by the gateway BFF."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import StringConstraints
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import coursework, db, doubts, practice, schedule, tutor
from services.learning.enrolment import Enrolment, my_course, my_courses, my_lesson, student_enrolment
from services.learning.models import (
    Assignment,
    Course,
    LearningEvent,
    Lesson,
    LessonProgress,
    Module,
    Topic,
    TutorMessage,
)
from services.shared.context import RequestContext, get_context
from services.shared.errors import NotFound, RateLimited, ValidationFailed
from services.shared.schemas import CamelModel

router = APIRouter()

DUE_WINDOW = timedelta(days=7)
LessonFormat = Literal["read", "watch", "animate"]


async def _touch_progress(session: AsyncSession, me: Enrolment, course: Course, lesson: Lesson,
                          now: datetime) -> LessonProgress:
    """Create or refresh the student's progress row in one statement, so concurrent first opens can't collide."""
    await session.execute(
        insert(LessonProgress)
        .values(id=uuid.uuid4(), institution_id=me.institution_id, person_id=me.person_id, course_id=course.id,
                lesson_id=lesson.id, last_opened_at=now)
        .on_conflict_do_update(constraint="uq_progress_person_lesson", set_={"last_opened_at": now})
    )
    return (await session.execute(
        select(LessonProgress)
        .where(LessonProgress.person_id == me.person_id, LessonProgress.lesson_id == lesson.id)
        .execution_options(populate_existing=True)
    )).scalar_one()


def _event(me: Enrolment, ctx: RequestContext, kind: str, **fields) -> LearningEvent:  # noqa: ANN003
    return LearningEvent(institution_id=me.institution_id, person_id=me.person_id, session_id=ctx.session_id,
                         kind=kind, **fields)


# ---- Today ----

@router.get("/student/today")
async def today(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    courses = {c.id: c for c in await my_courses(session, me)}
    now = datetime.now(UTC)
    due: list[dict] = []
    if courses:
        # An approved extension can move a deadline up to MAX_EXTENSION later, so look that far back.
        assignments = (await session.execute(
            select(Assignment).where(Assignment.course_id.in_(courses),
                                     Assignment.due_at >= now - DUE_WINDOW - coursework.MAX_EXTENSION,
                                     Assignment.due_at <= now + DUE_WINDOW)
        )).scalars().all()
        works = await coursework.load_works(session, me.person_id, [(a, courses[a.course_id]) for a in assignments])
        for work in works:
            if not now - DUE_WINDOW <= work.due <= now + DUE_WINDOW:
                continue
            submission = work.submission
            handed_in = coursework.is_handed_in(submission)
            if handed_in and work.due < now:
                continue  # handed in and past due: nothing to do
            status = submission.status if handed_in else ("overdue" if work.due < now else "pending")
            assignment, course = work.assignment, work.course
            due.append({
                "id": str(assignment.id), "title": assignment.title, "kind": assignment.kind,
                "dueAt": work.due.isoformat(), "status": status, "points": assignment.points,
                "hasDraft": submission is not None and not handed_in,
                "courseId": str(course.id), "courseCode": course.code, "courseTitle": course.title,
                "subject": course.subject,
            })
        due.sort(key=lambda d: (d["status"] != "overdue", d["dueAt"]))

    last = None
    if courses:
        last = (
            await session.execute(
                select(LessonProgress, Lesson, Module)
                .join(Lesson, Lesson.id == LessonProgress.lesson_id)
                .join(Module, Module.id == Lesson.module_id)
                .where(LessonProgress.person_id == me.person_id, LessonProgress.course_id.in_(courses))
                .order_by(LessonProgress.last_opened_at.desc())
                .limit(1)
            )
        ).first()
    resume = None
    if last is not None:
        progress, lesson, module = last
        course = courses[lesson.course_id]
        resume = {
            "lessonId": str(lesson.id), "lessonTitle": lesson.title, "moduleTitle": module.title,
            "courseId": str(course.id), "courseCode": course.code, "courseTitle": course.title,
            "subject": course.subject, "status": progress.status, "lastFormat": progress.last_format,
            "minutes": lesson.minutes, "openedAt": progress.last_opened_at.isoformat(),
        }
    settings = request.app.state.settings
    return {
        "due": due, "continue": resume, "courses": await _course_cards(session, me, list(courses.values())),
        "classes": await schedule.today_classes(session, me, now, schedule.local_zone(request)),
        "attendanceAlerts": await schedule.attendance_alerts(session, me, settings.attendance_threshold_percent, now),
    }


# ---- Learn ----

async def _course_cards(session: AsyncSession, me: Enrolment, courses: list[Course]) -> list[dict]:
    if not courses:
        return []
    ids = [c.id for c in courses]
    totals = dict((await session.execute(
        select(Lesson.course_id, func.count()).where(Lesson.course_id.in_(ids)).group_by(Lesson.course_id)
    )).all())
    completed = dict((await session.execute(
        select(LessonProgress.course_id, func.count())
        .where(LessonProgress.person_id == me.person_id, LessonProgress.course_id.in_(ids),
               LessonProgress.status == "completed")
        .group_by(LessonProgress.course_id)
    )).all())
    return [{
        "id": str(c.id), "code": c.code, "title": c.title, "summary": c.summary, "term": c.term,
        "subject": c.subject, "lessonsTotal": totals.get(c.id, 0), "lessonsCompleted": completed.get(c.id, 0),
    } for c in courses]


@router.get("/student/courses")
async def courses(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    return {"courses": await _course_cards(session, me, await my_courses(session, me))}


@router.get("/student/courses/{course_id}")
async def course_detail(
    course_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    course = await my_course(session, me, course_id)
    modules = (await session.execute(
        select(Module).where(Module.course_id == course_id).order_by(Module.position)
    )).scalars().all()
    lessons = (await session.execute(
        select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.position)
    )).scalars().all()
    progress = {p.lesson_id: p for p in (await session.execute(
        select(LessonProgress).where(LessonProgress.person_id == me.person_id, LessonProgress.course_id == course_id)
    )).scalars()}
    card = (await _course_cards(session, me, [course]))[0]
    return {**card, "topics": await _topic_cards(session, me, course.id, lessons, progress), "modules": [{
        "id": str(m.id), "title": m.title, "summary": m.summary,
        "lessons": [{
            "id": str(lesson.id), "title": lesson.title, "summary": lesson.summary, "minutes": lesson.minutes,
            "topicId": str(lesson.topic_id) if lesson.topic_id else None,
            "status": _status(progress, lesson.id),
            "formats": _formats(lesson),
        } for lesson in lessons if lesson.module_id == m.id],
    } for m in modules]}


def _status(progress: dict[uuid.UUID, LessonProgress], lesson_id: uuid.UUID) -> str:
    return progress[lesson_id].status if lesson_id in progress else "not_started"


def _completed(progress: dict[uuid.UUID, LessonProgress], lessons: list[Lesson]) -> int:
    return sum(_status(progress, lesson.id) == "completed" for lesson in lessons)


def _formats(lesson: Lesson) -> list[str]:
    return [f for f, present in (("read", True), ("watch", bool(lesson.video)), ("animate", bool(lesson.animation)))
            if present]


async def _topic_cards(session: AsyncSession, me: Enrolment, course_id: uuid.UUID, lessons: list[Lesson],
                       progress: dict[uuid.UUID, LessonProgress]) -> list[dict]:
    topics = (await session.execute(
        select(Topic).where(Topic.course_id == course_id, Topic.institution_id == me.institution_id)
        .order_by(Topic.position)
    )).scalars().all()
    cards = []
    for topic in topics:
        in_topic = [lesson for lesson in lessons if lesson.topic_id == topic.id]
        cards.append({
            "id": str(topic.id), "title": topic.title, "summary": topic.summary, "lessonsTotal": len(in_topic),
            "lessonsCompleted": _completed(progress, in_topic),
        })
    return cards


@router.get("/student/topics/{topic_id}")
async def topic_detail(
    topic_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Everything on one concept: its lessons and your progress through them, and the doubts you raised on it."""
    me = await student_enrolment(request, ctx)
    topic = await session.get(Topic, topic_id)
    courses = {c.id: c for c in await my_courses(session, me)}
    if topic is None or topic.course_id not in courses:
        raise NotFound("Topic not found.")  # one answer whether it is missing or not yours
    course = courses[topic.course_id]
    lessons = (await session.execute(
        select(Lesson).join(Module, Module.id == Lesson.module_id)
        .where(Lesson.topic_id == topic.id, Lesson.course_id == course.id).order_by(Module.position, Lesson.position)
    )).scalars().all()
    progress = {p.lesson_id: p for p in (await session.execute(
        select(LessonProgress).where(LessonProgress.person_id == me.person_id,
                                     LessonProgress.lesson_id.in_([lesson.id for lesson in lessons]))
    )).scalars()}
    return {
        "id": str(topic.id), "title": topic.title, "summary": topic.summary,
        "course": {"id": str(course.id), "code": course.code, "title": course.title, "subject": course.subject},
        "lessons": [{"id": str(lesson.id), "title": lesson.title, "summary": lesson.summary,
                     "minutes": lesson.minutes, "status": _status(progress, lesson.id), "formats": _formats(lesson)}
                    for lesson in lessons],
        "progress": {"completed": _completed(progress, lessons), "total": len(lessons)},
        "doubts": await doubts.doubts_on_topic(session, me, topic.id),
    }


async def _topic_ref(session: AsyncSession, topic_id: uuid.UUID | None) -> dict | None:
    topic = await session.get(Topic, topic_id) if topic_id else None
    return {"id": str(topic.id), "title": topic.title} if topic else None


@router.get("/student/lessons/{lesson_id}")
async def lesson_detail(
    lesson_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    lesson, module, course = await my_lesson(session, me, lesson_id)
    ordered = (await session.execute(
        select(Lesson.id, Lesson.title)
        .join(Module, Module.id == Lesson.module_id)
        .where(Lesson.course_id == course.id)
        .order_by(Module.position, Lesson.position)
    )).all()
    index = next(i for i, (lid, _) in enumerate(ordered) if lid == lesson.id)

    progress = await _touch_progress(session, me, course, lesson, datetime.now(UTC))
    session.add(_event(me, ctx, "lesson_opened", course_id=course.id, lesson_id=lesson.id,
                       detail={"title": lesson.title}))
    await session.commit()

    def neighbour(i: int) -> dict | None:
        return {"id": str(ordered[i][0]), "title": ordered[i][1]} if 0 <= i < len(ordered) else None

    return {
        "id": str(lesson.id), "title": lesson.title, "summary": lesson.summary, "minutes": lesson.minutes,
        "body": lesson.body, "video": lesson.video, "animation": lesson.animation,
        "status": progress.status, "lastFormat": progress.last_format,
        "module": {"id": str(module.id), "title": module.title},
        "topic": await _topic_ref(session, lesson.topic_id),
        "course": {"id": str(course.id), "code": course.code, "title": course.title, "subject": course.subject},
        "position": index + 1, "count": len(ordered),
        "previous": neighbour(index - 1), "next": neighbour(index + 1),
    }


class FormatIn(CamelModel):
    format: LessonFormat


@router.post("/student/lessons/{lesson_id}/format")
async def lesson_format(
    lesson_id: uuid.UUID,
    body: FormatIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    lesson, _, course = await my_lesson(session, me, lesson_id)
    if (body.format == "watch" and not lesson.video) or (body.format == "animate" and not lesson.animation):
        raise ValidationFailed("This lesson doesn't have that format.")
    progress = await _touch_progress(session, me, course, lesson, datetime.now(UTC))
    progress.last_format = body.format
    session.add(_event(me, ctx, "format_viewed", course_id=course.id, lesson_id=lesson.id,
                       detail={"format": body.format}))
    await session.commit()
    return {"format": body.format}


@router.post("/student/lessons/{lesson_id}/complete")
async def lesson_complete(
    lesson_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    lesson, _, course = await my_lesson(session, me, lesson_id)
    now = datetime.now(UTC)
    progress = await _touch_progress(session, me, course, lesson, now)
    if progress.status != "completed":
        progress.status, progress.completed_at = "completed", now
        session.add(_event(me, ctx, "lesson_completed", course_id=course.id, lesson_id=lesson.id,
                           detail={"title": lesson.title}))
    await session.commit()
    return {"status": "completed"}


# ---- Tutor ----

class TutorIn(CamelModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    conversation_id: uuid.UUID | None = None
    lesson_id: uuid.UUID | None = None


def _check_tutor_budget(request: Request, person_id: uuid.UUID) -> None:
    """Per-student caps keep one account (or a stolen cookie) from running up the institution's model bill."""
    settings, limiter = request.app.state.settings, request.app.state.tutor_limiter
    for window, limit in ((60, settings.tutor_messages_per_minute), (86_400, settings.tutor_messages_per_day)):
        allowed, retry_after = limiter.check(f"tutor:{person_id}:{window}", limit=limit, window_seconds=window)
        if not allowed:
            raise RateLimited(
                "You've asked a lot of questions in a short time. Take a moment, then try again.",
                details={"retryAfterSeconds": retry_after},
            )


@router.post("/student/tutor/messages")
async def tutor_message(
    body: TutorIn,
    request: Request,
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> StreamingResponse:
    me = await student_enrolment(request, ctx)
    _check_tutor_budget(request, me.person_id)
    # Validate with a short-lived session: a request-scoped one would stay open for the whole stream.
    async with db.get_sessionmaker()() as session:
        await practice.ensure_tutor_allowed(session, me)
        if body.lesson_id is not None:
            await my_lesson(session, me, body.lesson_id)  # only ground the tutor in the student's own lessons
        if body.conversation_id is not None:
            owner = (await session.execute(
                select(TutorMessage.person_id).where(TutorMessage.conversation_id == body.conversation_id).limit(1)
            )).scalar_one_or_none()
            if owner is not None and owner != me.person_id:
                raise NotFound("Conversation not found.")
    stream = tutor.answer(
        sessions=db.get_sessionmaker(), providers=request.app.state.tutor_providers,
        settings=request.app.state.settings, ctx=ctx, institution_id=me.institution_id,
        message=body.message, conversation_id=body.conversation_id, lesson_id=body.lesson_id,
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ---- maintenance ----

@router.post("/internal/maintenance/purge-trail")
async def purge_trail(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
) -> dict:
    days = request.app.state.settings.trail_retention_days
    purged = await purge_trail_older_than(session, datetime.now(UTC) - timedelta(days=days))
    await session.commit()
    return {"purged": purged, "retentionDays": days}


async def purge_trail_older_than(session: AsyncSession, cutoff: datetime) -> int:
    events = await session.execute(delete(LearningEvent).where(LearningEvent.occurred_at < cutoff))
    messages = await session.execute(delete(TutorMessage).where(TutorMessage.created_at < cutoff))
    return (events.rowcount or 0) + (messages.rowcount or 0)
