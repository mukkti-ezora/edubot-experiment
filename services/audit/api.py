import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.audit.db import get_session
from services.audit.models import AuditEventRow
from services.shared.context import RequestContext, get_context
from services.shared.errors import NotFound, ValidationFailed
from services.shared.pagination import decode_cursor, encode_cursor
from services.shared.policy import require_perm
from services.shared.schemas import CamelModel, Page

router = APIRouter()

VALID_RESULTS = {"success", "denied", "error"}


class EventIn(CamelModel):
    occurred_at: datetime
    action: str = Field(min_length=1, max_length=80)
    result: str
    actor_id: uuid.UUID | None = None
    actor_type: str = "system"
    actor_label: str | None = None
    target_type: str | None = None
    target_id: str | None = None
    target_label: str | None = None
    institution_id: uuid.UUID | None = None
    institution_label: str | None = None
    request_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    diff: dict | None = None


class EventOut(CamelModel):
    id: uuid.UUID
    occurred_at: datetime
    action: str
    result: str
    actor_id: uuid.UUID | None
    actor_type: str
    actor_label: str | None
    target_type: str | None
    target_id: str | None
    target_label: str | None
    institution_id: uuid.UUID | None
    institution_label: str | None
    request_id: str | None
    ip: str | None
    user_agent: str | None
    diff: dict | None


def _out(row: AuditEventRow) -> EventOut:
    return EventOut(
        id=row.id,
        occurred_at=row.occurred_at,
        action=row.action,
        result=row.result,
        actor_id=row.actor_id,
        actor_type=row.actor_type,
        actor_label=row.actor_label,
        target_type=row.target_type,
        target_id=row.target_id,
        target_label=row.target_label,
        institution_id=row.institution_id,
        institution_label=row.institution_label,
        request_id=row.request_id,
        ip=row.ip,
        user_agent=row.user_agent,
        diff=row.diff,
    )


# ---- internal write path (the only way in) ----

@router.post("/internal/events", status_code=201)
async def record_event(
    body: EventIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if body.result not in VALID_RESULTS:
        raise ValidationFailed("Invalid result value.")
    row = AuditEventRow(
        occurred_at=body.occurred_at,
        action=body.action,
        result=body.result,
        actor_id=body.actor_id,
        actor_type=body.actor_type,
        actor_label=body.actor_label,
        target_type=body.target_type,
        target_id=body.target_id,
        target_label=body.target_label,
        institution_id=body.institution_id,
        institution_label=body.institution_label,
        request_id=body.request_id,
        ip=body.ip,
        user_agent=body.user_agent,
        diff=body.diff,
    )
    session.add(row)
    await session.commit()
    return {"id": str(row.id)}


# ---- read paths ----


def _activity_query(
    *,
    query: str | None,
    action: str | None,
    result: str | None,
    institution_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    stmt = select(AuditEventRow)
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(
            AuditEventRow.actor_label.ilike(like)
            | AuditEventRow.target_label.ilike(like)
            | AuditEventRow.action.ilike(like)
        )
    if action:
        stmt = stmt.where(AuditEventRow.action == action)
    if result:
        if result not in VALID_RESULTS:
            raise ValidationFailed("Invalid result filter.")
        stmt = stmt.where(AuditEventRow.result == result)
    if institution_id:
        stmt = stmt.where(AuditEventRow.institution_id == institution_id)
    if actor_id:
        stmt = stmt.where(AuditEventRow.actor_id == actor_id)
    if date_from:
        stmt = stmt.where(AuditEventRow.occurred_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditEventRow.occurred_at <= date_to)
    return stmt


async def _page(
    session: AsyncSession,
    stmt,
    *,
    cursor: str | None,
    limit: int,
) -> Page[EventOut]:
    stmt = stmt.order_by(AuditEventRow.occurred_at.desc(), AuditEventRow.id.desc())
    decoded = decode_cursor(cursor)
    if decoded is not None:
        (value, row_id) = decoded
        value_dt = datetime.fromisoformat(value)
        stmt = stmt.where(
            (AuditEventRow.occurred_at < value_dt)
            | ((AuditEventRow.occurred_at == value_dt) & (AuditEventRow.id < uuid.UUID(str(row_id))))
        )
    result = await session.execute(stmt.limit(limit + 1))
    rows = list(result.scalars())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = encode_cursor(last.occurred_at.isoformat(), last.id)
    return Page[EventOut](items=[_out(r) for r in rows], next_cursor=next_cursor)


@router.get("/activity", response_model=Page[EventOut])
async def list_activity(
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    query: str | None = Query(default=None),
    action: str | None = Query(default=None),
    result: str | None = Query(default=None),
    institution_id: uuid.UUID | None = Query(default=None, alias="institutionId"),
    actor_id: uuid.UUID | None = Query(default=None, alias="actorId"),
    date_from: datetime | None = Query(default=None, alias="dateFrom"),
    date_to: datetime | None = Query(default=None, alias="dateTo"),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
) -> Page[EventOut]:
    require_perm(ctx, "audit.read")
    stmt = _activity_query(
        query=query,
        action=action,
        result=result,
        institution_id=institution_id,
        actor_id=actor_id,
        date_from=date_from,
        date_to=date_to,
    )
    return await _page(session, stmt, cursor=cursor, limit=limit)


@router.get("/activity/actions", response_model=list[str])
async def list_action_vocabulary(
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> list[str]:
    require_perm(ctx, "audit.read")
    result = await session.execute(select(AuditEventRow.action).distinct().order_by(AuditEventRow.action))
    return [row[0] for row in result.all()]


@router.get("/activity/{event_id}", response_model=EventOut)
async def get_event(
    event_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> EventOut:
    require_perm(ctx, "audit.read")
    row = await session.get(AuditEventRow, event_id)
    if row is None:
        raise NotFound("Event not found.")
    return _out(row)


# ---- internal stats (dashboard composition) ----

@router.get("/internal/events/recent")
async def recent_events(
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=10, ge=1, le=50),
) -> dict:
    result = await session.execute(
        select(AuditEventRow).order_by(AuditEventRow.occurred_at.desc(), AuditEventRow.id.desc()).limit(limit)
    )
    return {"items": [_out(r).model_dump(mode="json", by_alias=True) for r in result.scalars()]}


@router.get("/internal/stats/activity-by-institution")
async def activity_by_institution(
    session: Annotated[AsyncSession, Depends(get_session)],
    since: datetime = Query(),
    limit: int = Query(default=8, ge=1, le=50),
) -> dict:
    result = await session.execute(
        select(
            AuditEventRow.institution_id,
            AuditEventRow.institution_label,
            func.count().label("events"),
        )
        .where(AuditEventRow.institution_id.is_not(None), AuditEventRow.occurred_at >= since)
        .group_by(AuditEventRow.institution_id, AuditEventRow.institution_label)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return {
        "items": [
            {"institutionId": str(i), "institution": label, "events": count}
            for i, label, count in result.all()
        ]
    }


@router.get("/internal/stats/failed-signins")
async def failed_signins(
    session: Annotated[AsyncSession, Depends(get_session)],
    since: datetime = Query(),
) -> dict:
    result = await session.execute(
        select(func.count())
        .select_from(AuditEventRow)
        .where(
            AuditEventRow.action == "auth.sign_in_failed",
            AuditEventRow.occurred_at >= since,
        )
    )
    return {"count": result.scalar_one()}
