"""Daily allowances for paid AI work, reserved atomically so parallel requests can't exceed them.

A reservation is a learning-trail event written before the model is called. A per-person transaction-scoped
advisory lock serialises the count-then-insert across every worker and process.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning.models import LearningEvent
from services.shared.errors import RateLimited

DAY = timedelta(days=1)


async def reserve(session: AsyncSession, *, institution_id: uuid.UUID, person_id: uuid.UUID, kind: str,
                  limit: int, message: str) -> None:
    """Record one use of `kind` for this person, or raise RateLimited if today's `limit` is used up."""
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                          {"key": f"allowance:{kind}:{person_id}"})
    used = (await session.execute(select(func.count()).where(
        LearningEvent.person_id == person_id, LearningEvent.kind == kind,
        LearningEvent.occurred_at >= datetime.now(UTC) - DAY))).scalar_one()
    if used >= limit:
        await session.rollback()
        raise RateLimited(message)
    session.add(LearningEvent(institution_id=institution_id, person_id=person_id, kind=kind, detail={}))
    await session.commit()
