"""Teacher views of class tests: attempts and averages per test, ranked results and the class's weakest topics."""

from __future__ import annotations

import statistics
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import db
from services.learning.enrolment import Enrolment, teacher_enrolment
from services.learning.models import Assessment, Attempt, AttemptAnswer, Course, Question, Topic
from services.learning.practice_scoring import (
    accuracy,
    first_attempts,
    percent,
    question_counts,
    window_status,
)
from services.shared.context import RequestContext, get_context
from services.shared.errors import NotFound

router = APIRouter()

WEAK_TOPICS = 3


async def _class_assessment(session: AsyncSession, me: Enrolment, assessment_id: uuid.UUID
                            ) -> tuple[Assessment, Course]:
    row = (await session.execute(select(Assessment, Course).join(Course, Course.id == Assessment.course_id).where(
        Assessment.id == assessment_id, Assessment.owner_id.is_(None), Course.institution_id == me.institution_id,
        Course.section_id.in_(me.section_ids)))).first()
    if row is None:
        raise NotFound("Test not found.")
    assessment, course = row
    return assessment, course


@router.get("/teacher/assessments")
async def teacher_assessments(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    rows = (await session.execute(select(Assessment, Course).join(Course, Course.id == Assessment.course_id).where(
        Assessment.owner_id.is_(None), Course.institution_id == me.institution_id,
        Course.section_id.in_(me.section_ids)).order_by(Course.code, Assessment.created_at))).all()
    ids = [assessment.id for assessment, _ in rows]
    counts, firsts, now = await question_counts(session, ids), await first_attempts(session, ids), datetime.now(UTC)
    by_assessment: dict[uuid.UUID, list[Attempt]] = defaultdict(list)
    for attempt in firsts:
        by_assessment[attempt.assessment_id].append(attempt)
    out = []
    for assessment, course in rows:
        percents = [p for p in (percent(a) for a in by_assessment[assessment.id]) if p is not None]
        out.append({"id": str(assessment.id), "title": assessment.title, "kind": assessment.kind,
                    "courseCode": course.code, "subject": course.subject, "status": window_status(assessment, now),
                    "questionCount": counts.get(assessment.id, 0), "attempts": len(by_assessment[assessment.id]),
                    "averagePercent": round(statistics.mean(percents), 1) if percents else None,
                    "opensAt": assessment.opens_at.isoformat() if assessment.opens_at else None,
                    "closesAt": assessment.closes_at.isoformat() if assessment.closes_at else None})
    return {"assessments": out}


def _ranked(firsts: list[Attempt], names: dict[uuid.UUID, str]) -> list[dict]:
    ordered = sorted(firsts, key=lambda a: (-(a.score or 0), a.submitted_at))
    students = []
    for attempt in ordered:
        higher = sum(1 for other in ordered if (other.score or 0) > (attempt.score or 0))
        students.append({"rank": higher + 1, "personId": str(attempt.person_id),
                         "name": names.get(attempt.person_id, "Former student"),
                         "score": attempt.score, "maxScore": attempt.max_score, "percent": percent(attempt),
                         "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None})
    return students


async def _weakest_topics(session: AsyncSession, firsts: list[Attempt]) -> list[dict]:
    if not firsts:
        return []
    rows = (await session.execute(
        select(Topic.id, Topic.title, AttemptAnswer.is_correct)
        .join(Question, Question.topic_id == Topic.id).join(AttemptAnswer, AttemptAnswer.question_id == Question.id)
        .where(AttemptAnswer.attempt_id.in_([a.id for a in firsts]), AttemptAnswer.is_correct.is_not(None))
    )).all()
    tally: dict[tuple[uuid.UUID, str], list[int]] = defaultdict(lambda: [0, 0])
    for topic_id, title, correct in rows:
        tally[(topic_id, title)][0] += int(correct)
        tally[(topic_id, title)][1] += 1
    topics = sorted(({"id": str(tid), "title": title, "answered": n, "accuracy": accuracy(right, n)}
                     for (tid, title), (right, n) in tally.items()), key=lambda t: (t["accuracy"], t["title"]))
    return topics[:WEAK_TOPICS]


@router.get("/teacher/assessments/{assessment_id}/results")
async def teacher_results(
    assessment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """First attempts ranked, the class average, and the topics the class found hardest."""
    me = await teacher_enrolment(request, ctx)
    assessment, course = await _class_assessment(session, me, assessment_id)
    firsts = await first_attempts(session, [assessment.id])
    students = _ranked(firsts, me.student_names)
    percents = [s["percent"] for s in students if s["percent"] is not None]
    return {"id": str(assessment.id), "title": assessment.title, "kind": assessment.kind, "courseCode": course.code,
            "averagePercent": round(statistics.mean(percents), 1) if percents else None,
            "students": students, "weakTopics": await _weakest_topics(session, firsts)}
