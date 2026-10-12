"""Practice scoring and analytics: marking answers, totals, rank among classmates, and the answer-key rule.

Students only ever see a question's answer and explanation once review is allowed (see `review_access`).
Rank is shown among first attempts and only when at least three students have sat the test, so nobody can
work out a classmate's score.
"""

from __future__ import annotations

import math
import statistics
import uuid
from collections.abc import Callable, Hashable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning.models import Assessment, AssessmentItem, Attempt, AttemptAnswer, Question
from services.shared.errors import ValidationFailed

RANK_MIN_STUDENTS = 3
PERCENT = 100
ONE_CHOICE_KINDS = frozenset({"single", "true_false"})
# Kinds whose answer key must not reach students who could still use it (classmates, or their own retakes).
ASSESSED_KINDS = frozenset({"quiz", "mock", "exam_check"})
# Numeric answers: bounded so every comparison stays finite, compared with a little float slack.
NUMERIC_LIMIT = 1e9
NUMERIC_EPSILON = 1e-9


# ---- windows and review ----

def window_status(assessment: Assessment, now: datetime) -> str:
    if assessment.opens_at and now < assessment.opens_at:
        return "upcoming"
    if assessment.closes_at and now >= assessment.closes_at:
        return "closed"
    return "open"


def is_assessed(assessment: Assessment) -> bool:
    """Shared tests whose answers matter: quizzes, mocks, exam checks, and anything counting toward a grade."""
    return assessment.owner_id is None and (assessment.kind in ASSESSED_KINDS or assessment.counts_toward_grade)


@dataclass(frozen=True)
class ReviewAccess:
    available: bool
    available_at: datetime | None  # when it opens, if a date is known
    reason: str | None


def review_access(assessment: Assessment, attempts_used: int, now: datetime) -> ReviewAccess:
    """The one rule for showing answers and explanations: past papers and personal practice straight away;
    assessed tests only once their window has closed and the student has no attempts left to retake."""
    if not is_assessed(assessment):
        return ReviewAccess(True, None, None)
    if assessment.closes_at and now < assessment.closes_at:
        return ReviewAccess(False, assessment.closes_at, "Answers open when the test window closes.")
    if assessment.max_attempts and assessment.max_attempts > 1 and attempts_used < assessment.max_attempts:
        return ReviewAccess(False, None, "Answers open once you've used all your attempts.")
    return ReviewAccess(True, None, None)


# ---- marking ----

def is_correct(question: Question, response: dict | None) -> bool | None:
    """None when unanswered. Multiple choice needs the exact set; numeric answers allow the tolerance."""
    if response is None:
        return None
    if question.kind == "numeric":
        key = question.answer
        difference = abs(float(response["value"]) - float(key["value"]))
        return difference <= float(key.get("tolerance", 0)) + NUMERIC_EPSILON
    return sorted(response.get("options", [])) == sorted(question.answer.get("options", []))


def validate_response(question: Question, response: dict | None) -> None:
    """A response must fit the question: a bounded finite number, or a set of its own option ids."""
    if response is None:
        return
    if question.kind == "numeric":
        value = response.get("value")
        if not isinstance(value, int | float) or isinstance(value, bool) or not math.isfinite(value) \
                or abs(value) > NUMERIC_LIMIT:
            raise ValidationFailed("Enter a number.")
        return
    chosen = response.get("options")
    valid_ids = {o["id"] for o in question.options}
    if not isinstance(chosen, list) or not chosen or not all(isinstance(c, str) for c in chosen) \
            or not set(chosen) <= valid_ids or len(set(chosen)) != len(chosen):
        raise ValidationFailed("Choose from the options given.")
    if question.kind in ONE_CHOICE_KINDS and len(chosen) != 1:
        raise ValidationFailed("Choose one option.")


async def finalise(session: AsyncSession, attempt: Attempt, assessment: Assessment, now: datetime) -> None:
    """Mark every answer and total the attempt. Unanswered questions score zero, wrong ones the negative mark."""
    rows = (await session.execute(
        select(AttemptAnswer, Question).join(Question, Question.id == AttemptAnswer.question_id)
        .where(AttemptAnswer.attempt_id == attempt.id)
    )).all()
    correct = wrong = skipped = 0
    score = 0.0
    for answer, question in rows:
        answer.is_correct = is_correct(question, answer.response)
        if answer.is_correct is None:
            answer.marks, skipped = 0.0, skipped + 1
        elif answer.is_correct:
            answer.marks, correct = assessment.marks_correct, correct + 1
        else:
            answer.marks, wrong = assessment.marks_wrong, wrong + 1
        score += answer.marks
    attempt.correct, attempt.wrong, attempt.skipped = correct, wrong, skipped
    attempt.score, attempt.max_score = score, len(rows) * assessment.marks_correct
    attempt.status, attempt.submitted_at = "submitted", min(now, attempt.deadline_at or now)


# ---- counts, rank, analytics ----

async def question_counts(session: AsyncSession, assessment_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not assessment_ids:
        return {}
    return dict((await session.execute(
        select(AssessmentItem.assessment_id, func.count()).where(AssessmentItem.assessment_id.in_(assessment_ids))
        .group_by(AssessmentItem.assessment_id)
    )).all())


async def first_attempts(session: AsyncSession, assessment_ids: list[uuid.UUID]) -> list[Attempt]:
    if not assessment_ids:
        return []
    return list((await session.execute(select(Attempt).where(
        Attempt.assessment_id.in_(assessment_ids), Attempt.status == "submitted", Attempt.number == 1))).scalars())


async def rank(session: AsyncSession, attempt: Attempt) -> dict | None:
    """Position among each student's first submitted attempt; hidden below three students."""
    firsts = (await session.execute(
        select(Attempt.person_id, Attempt.score).where(
            Attempt.assessment_id == attempt.assessment_id, Attempt.status == "submitted", Attempt.number == 1)
    )).all()
    if len(firsts) < RANK_MIN_STUDENTS:
        return None
    mine = next((score for person, score in firsts if person == attempt.person_id), attempt.score)
    others = [score for person, score in firsts if person != attempt.person_id]
    return rank_among(others, mine)


def rank_among(others: list[float], mine: float) -> dict:
    """Position (ties share it) and percentile rank: the share of classmates below, ties counting half."""
    higher = sum(1 for score in others if score > mine)
    lower = sum(1 for score in others if score < mine)
    tied = len(others) - higher - lower
    percentile = (lower + tied / 2) / len(others) * PERCENT if others else PERCENT
    return {"position": higher + 1, "of": len(others) + 1, "tiedWith": tied, "percentile": round(percentile, 1)}


def accuracy(correct: int, attempted: int) -> float | None:
    return round(correct / attempted * PERCENT, 1) if attempted else None


def percent(attempt: Attempt) -> float | None:
    return round(attempt.score / attempt.max_score * PERCENT, 1) if attempt.max_score else None


def speed_quadrants(answered: list[AttemptAnswer]) -> dict:
    """Fast or slow (against this attempt's median time) crossed with right or wrong."""
    quadrants = {"fastRight": 0, "slowRight": 0, "fastWrong": 0, "slowWrong": 0}
    if not answered:
        return {"medianSeconds": None, "quadrants": quadrants}
    median = statistics.median(a.time_seconds for a in answered)
    for answer in answered:
        pace = "fast" if answer.time_seconds <= median else "slow"
        quadrants[pace + ("Right" if answer.is_correct else "Wrong")] += 1
    return {"medianSeconds": median, "quadrants": quadrants}


GroupKey = Callable[[Question, AssessmentItem], Hashable]


def breakdown(rows: list[tuple[AttemptAnswer, Question, AssessmentItem]], key: GroupKey,
              titles: dict[Any, dict]) -> list[dict]:
    """Correct, wrong, skipped and score per group (section or topic)."""
    totals: dict[Hashable, dict] = {}
    for answer, question, item in rows:
        bucket = totals.setdefault(key(question, item), {"correct": 0, "wrong": 0, "skipped": 0, "score": 0.0})
        outcome = "skipped" if answer.is_correct is None else ("correct" if answer.is_correct else "wrong")
        bucket[outcome] += 1
        bucket["score"] += answer.marks
    out = []
    for group, bucket in totals.items():
        attempted = bucket["correct"] + bucket["wrong"]
        out.append({**titles.get(group, {"title": str(group)}), **bucket, "attempted": attempted,
                    "accuracy": accuracy(bucket["correct"], attempted)})
    return out
