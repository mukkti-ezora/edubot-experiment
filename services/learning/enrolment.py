"""Who is asking, and which classes they belong to. The roster lives in the users service; every learning
query is scoped by the institution and class sections resolved here."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning.models import Course, Lesson, Module
from services.shared.context import RequestContext
from services.shared.errors import NotFound
from services.shared.policy import require_scope

NO_INSTITUTION = uuid.UUID(int=0)


@dataclass(frozen=True)
class Enrolment:
    person_id: uuid.UUID
    institution_id: uuid.UUID
    section_ids: frozenset[uuid.UUID]
    student_names: dict[uuid.UUID, str] = field(default_factory=dict)  # teachers only: their students


async def student_enrolment(request: Request, ctx: RequestContext) -> Enrolment:
    """The calling student and the class sections they attend."""
    require_scope(ctx, "student", action="learning.study")
    return _enrolment(ctx, await _classes(request, ctx, role="student"))


async def teacher_enrolment(request: Request, ctx: RequestContext) -> Enrolment:
    """The calling teacher, the class sections they teach, and the names of the students in them."""
    require_scope(ctx, "teacher", action="learning.teach")
    classes = await _classes(request, ctx, role="teacher")
    enrolment = _enrolment(ctx, classes)
    names = {
        uuid.UUID(student["id"]): student["name"]
        for c in classes if uuid.UUID(c["id"]) in enrolment.section_ids
        for student in c.get("students", [])
    }
    return Enrolment(enrolment.person_id, enrolment.institution_id, enrolment.section_ids, names)


async def _classes(request: Request, ctx: RequestContext, *, role: str) -> list[dict]:
    data = await request.app.state.users.get(f"/internal/people/{ctx.actor_id}/classes", ctx=ctx)
    classes = [c for c in data.get("classes", []) if c["role"] == role]
    if ctx.institution_id is not None:
        classes = [c for c in classes if c["institutionId"] == str(ctx.institution_id)]
    return classes


def _enrolment(ctx: RequestContext, classes: list[dict]) -> Enrolment:
    # A person belongs to one institution; sorting keeps the choice stable if data ever disagrees.
    institutions = sorted({c["institutionId"] for c in classes})
    institution_id = uuid.UUID(institutions[0]) if institutions else NO_INSTITUTION
    return Enrolment(
        person_id=ctx.actor_id,
        institution_id=institution_id,
        section_ids=frozenset(uuid.UUID(c["id"]) for c in classes if c["institutionId"] == str(institution_id)),
    )


async def my_courses(session: AsyncSession, me: Enrolment) -> list[Course]:
    if not me.section_ids:
        return []
    return list(
        (
            await session.execute(
                select(Course)
                .where(Course.institution_id == me.institution_id, Course.section_id.in_(me.section_ids))
                .order_by(Course.code)
            )
        ).scalars()
    )


async def my_course(session: AsyncSession, me: Enrolment, course_id: uuid.UUID) -> Course:
    course = await session.get(Course, course_id)
    if course is None or course.institution_id != me.institution_id or course.section_id not in me.section_ids:
        raise NotFound("Course not found.")
    return course


async def my_lesson(session: AsyncSession, me: Enrolment, lesson_id: uuid.UUID) -> tuple[Lesson, Module, Course]:
    row = (
        await session.execute(
            select(Lesson, Module, Course)
            .join(Module, Module.id == Lesson.module_id)
            .join(Course, Course.id == Lesson.course_id)
            .where(Lesson.id == lesson_id)
        )
    ).first()
    if row is None or row[2].institution_id != me.institution_id or row[2].section_id not in me.section_ids:
        raise NotFound("Lesson not found.")
    return row
