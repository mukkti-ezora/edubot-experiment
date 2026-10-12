"""The review deck: spaced repetition (SM-2 lite) over the flashcards of a student's courses and their own cards."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, replace
from datetime import UTC, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import db
from services.learning.enrolment import Enrolment, my_courses, student_enrolment
from services.learning.models import CardReview, Course, Flashcard, Topic
from services.learning.schedule import local_zone
from services.shared.context import RequestContext, get_context
from services.shared.errors import NotFound
from services.shared.schemas import CamelModel

router = APIRouter()

NEW_CARDS_PER_SESSION = 10
STARTING_EASE = 2.5
EASE_FLOOR = 1.3
EASE_STEP = {"again": -0.2, "hard": -0.15, "good": 0.0, "easy": 0.15}
RELEARN_DELAY = timedelta(minutes=10)
FIRST_INTERVAL_DAYS = {"hard": 1.0, "good": 1.0, "easy": 4.0}
SECOND_GOOD_INTERVAL_DAYS = 3.0
HARD_FACTOR = 1.2
EASY_BONUS = 1.3

Rating = Literal["again", "hard", "good", "easy"]


@dataclass(frozen=True)
class ReviewState:
    interval_days: float
    ease: float
    reps: int
    lapses: int
    due_at: datetime | None = None


def schedule_review(state: ReviewState, rating: Rating, now: datetime) -> ReviewState:
    """SM-2 lite. Forgetting resets the card to be seen again shortly; remembering stretches the gap."""
    ease = max(EASE_FLOOR, state.ease + EASE_STEP[rating])
    if rating == "again":
        return ReviewState(0.0, ease, 0, state.lapses + 1, now + RELEARN_DELAY)
    if state.reps == 0:
        interval = FIRST_INTERVAL_DAYS[rating]
    elif rating == "hard":
        interval = state.interval_days * HARD_FACTOR
    elif state.reps == 1 and rating == "good":
        interval = SECOND_GOOD_INTERVAL_DAYS
    else:
        interval = state.interval_days * ease * (EASY_BONUS if rating == "easy" else 1)
    return replace(state, interval_days=interval, ease=ease, reps=state.reps + 1, due_at=now + timedelta(days=interval))


def cards_visible(me: Enrolment, course_ids: set[uuid.UUID]) -> tuple[ColumnElement[bool], ...]:
    """The shared cards of the student's courses plus the student's own AI cards."""
    return (Flashcard.course_id.in_(course_ids), Flashcard.institution_id == me.institution_id,
            (Flashcard.owner_id.is_(None)) | (Flashcard.owner_id == me.person_id))


def end_of_local_day(now: datetime, zone: ZoneInfo) -> datetime:
    return datetime.combine(now.astimezone(zone).date() + timedelta(days=1), time.min, tzinfo=zone)


async def review_counts(session: AsyncSession, me: Enrolment, course_ids: set[uuid.UUID],
                        day_ends_at: datetime) -> dict:
    """Cards due before the student's local day ends, plus today's allowance of new cards, out of the deck."""
    visible = cards_visible(me, course_ids)
    mine = (CardReview.card_id == Flashcard.id) & (CardReview.person_id == me.person_id)
    total = (await session.execute(select(func.count()).select_from(Flashcard).where(*visible))).scalar_one()
    due = (await session.execute(select(func.count()).select_from(Flashcard).join(CardReview, mine).where(
        *visible, CardReview.due_at < day_ends_at))).scalar_one()
    unseen = (await session.execute(select(func.count()).select_from(Flashcard).outerjoin(CardReview, mine).where(
        *visible, CardReview.id.is_(None)))).scalar_one()
    return {"dueToday": due + min(NEW_CARDS_PER_SESSION, unseen), "total": total}


def card_view(card: Flashcard, course: Course, topic: Topic | None, review: CardReview | None) -> dict:
    return {"id": str(card.id), "front": card.front, "back": card.back, "courseCode": course.code,
            "subject": course.subject, "topic": {"id": str(topic.id), "title": topic.title} if topic else None,
            "isNew": review is None, "dueAt": review.due_at.isoformat() if review else None,
            "source": card.source}


@router.get("/student/review/due")
async def review_due(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Cards due now, oldest first, then up to ten cards you haven't seen yet."""
    me = await student_enrolment(request, ctx)
    course_ids = {c.id for c in await my_courses(session, me)}
    now = datetime.now(UTC)
    base = (select(Flashcard, Course, Topic, CardReview).join(Course, Course.id == Flashcard.course_id)
            .outerjoin(Topic, Topic.id == Flashcard.topic_id)
            .outerjoin(CardReview, (CardReview.card_id == Flashcard.id) & (CardReview.person_id == me.person_id))
            .where(*cards_visible(me, course_ids)))
    due = (await session.execute(base.where(CardReview.due_at <= now).order_by(CardReview.due_at))).all()
    fresh = (await session.execute(base.where(CardReview.id.is_(None)).order_by(Course.code, Topic.position)
                                   .limit(NEW_CARDS_PER_SESSION))).all()
    cards = [card_view(card, course, topic, review) for card, course, topic, review in [*due, *fresh]]
    return {"cards": cards,
            **await review_counts(session, me, course_ids, end_of_local_day(now, local_zone(request)))}


class RatingIn(CamelModel):
    rating: Rating


async def _locked_review(session: AsyncSession, me: Enrolment, card: Flashcard, now: datetime) -> CardReview:
    """The student's review state for a card, created on first sight; two tabs rating at once can't collide."""
    await session.execute(insert(CardReview).values(
        id=uuid.uuid4(), institution_id=me.institution_id, person_id=me.person_id, card_id=card.id, due_at=now,
        interval_days=0.0, ease=STARTING_EASE, reps=0, lapses=0,
    ).on_conflict_do_nothing(constraint="uq_review_card"))
    return (await session.execute(select(CardReview).where(
        CardReview.person_id == me.person_id, CardReview.card_id == card.id).with_for_update()
        .execution_options(populate_existing=True))).scalar_one()


@router.post("/student/review/{card_id}")
async def review_card(
    card_id: uuid.UUID,
    body: RatingIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    course_ids = {c.id for c in await my_courses(session, me)}
    card = (await session.execute(select(Flashcard).where(Flashcard.id == card_id, *cards_visible(me, course_ids)))
            ).scalar_one_or_none()
    if card is None:
        raise NotFound("Card not found.")
    now = datetime.now(UTC)
    review = await _locked_review(session, me, card, now)
    state = schedule_review(ReviewState(review.interval_days, review.ease, review.reps, review.lapses),
                            body.rating, now)
    review.interval_days, review.ease, review.reps, review.lapses = (state.interval_days, state.ease, state.reps,
                                                                     state.lapses)
    review.due_at, review.last_reviewed_at = state.due_at, now
    await session.commit()
    return {"cardId": str(card.id), "dueAt": review.due_at.isoformat(), "intervalDays": review.interval_days}
