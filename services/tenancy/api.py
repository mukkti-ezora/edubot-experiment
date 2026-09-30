import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.shared.audit import AuditClient, AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import Conflict, NotFound, ValidationFailed
from services.shared.pagination import coerce_cursor_value, de, decode_cursor, encode_cursor
from services.shared.policy import require_perm
from services.shared.schemas import CamelModel, Page
from services.tenancy.db import get_session
from services.tenancy.models import INSTITUTION_STATUSES, INSTITUTION_TYPES, Institution, PlatformSettings

router = APIRouter()


class InstitutionOut(CamelModel):
    id: uuid.UUID
    code: str
    name: str
    type: str
    status: str
    city: str | None
    region: str | None
    country: str | None
    contact_name: str | None
    contact_email: str | None
    status_note: str | None
    created_at: datetime
    updated_at: datetime
    suspended_at: datetime | None


class InstitutionIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=12, pattern=r"^[A-Z0-9]+$")
    type: str
    city: str | None = Field(default=None, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_email: EmailStr | None = None


class InstitutionPatch(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    type: str | None = None
    city: str | None = None
    region: str | None = None
    country: str | None = None
    contact_name: str | None = None
    contact_email: EmailStr | None = None


class StatusIn(CamelModel):
    reason: str | None = Field(default=None, max_length=400)


class SettingsOut(CamelModel):
    platform_name: str
    support_email: str | None
    sign_in_notice: str | None
    updated_at: datetime | None
    updated_by: uuid.UUID | None


class SettingsIn(CamelModel):
    platform_name: str = Field(min_length=2, max_length=120)
    support_email: EmailStr | None = None
    sign_in_notice: str | None = Field(default=None, max_length=400)


def _out(row: Institution) -> InstitutionOut:
    return InstitutionOut(
        id=row.id, code=row.code, name=row.name, type=row.type, status=row.status,
        city=row.city, region=row.region, country=row.country,
        contact_name=row.contact_name, contact_email=row.contact_email,
        status_note=row.status_note, created_at=row.created_at, updated_at=row.updated_at,
        suspended_at=row.suspended_at,
    )


def _audit(request: Request) -> AuditClient:
    return request.app.state.audit


SORTABLE = {
    "name": Institution.name,
    "code": Institution.code,
    "createdAt": Institution.created_at,
    "status": Institution.status,
    "type": Institution.type,
}

DEFAULT_SORT = "name"


@router.get("/institutions", response_model=Page[InstitutionOut])
async def list_institutions(
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    query: str | None = Query(default=None),
    status: str | None = Query(default=None),
    type: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
) -> Page[InstitutionOut]:
    require_perm(ctx, "institution.read")
    conditions = []
    if query:
        like = f"%{query.strip()}%"
        conditions.append(
            or_(Institution.name.ilike(like), Institution.code.ilike(like), Institution.city.ilike(like))
        )
    if status:
        if status not in INSTITUTION_STATUSES:
            raise ValidationFailed("Invalid status filter.")
        conditions.append(Institution.status == status)
    if type:
        if type not in INSTITUTION_TYPES:
            raise ValidationFailed("Invalid type filter.")
        conditions.append(Institution.type == type)

    sort_key = sort or DEFAULT_SORT
    descending = sort_key.startswith("-")
    sort_name = sort_key[1:] if descending else sort_key
    column = SORTABLE.get(sort_name)
    if column is None:
        raise ValidationFailed("Invalid sort field.")
    order = column.desc() if descending else column.asc()
    tiebreak = Institution.id.desc() if descending else Institution.id.asc()

    stmt = select(Institution)
    for cond in conditions:
        stmt = stmt.where(cond)
    stmt = stmt.order_by(order, tiebreak)

    decoded = decode_cursor(cursor)
    if decoded is not None:
        value = coerce_cursor_value(column, de(decoded[0]))
        row_id = decoded[1]
        if descending:
            stmt = stmt.where(
                (column < value) | ((column == value) & (Institution.id < row_id))
            )
        else:
            stmt = stmt.where(
                (column > value) | ((column == value) & (Institution.id > row_id))
            )

    rows = list((await session.execute(stmt.limit(limit + 1))).scalars())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        last_value = getattr(last, column.key)
        if isinstance(last_value, datetime):
            last_value = last_value.isoformat()
        next_cursor = encode_cursor(last_value, last.id)
    return Page[InstitutionOut](items=[_out(r) for r in rows], next_cursor=next_cursor)


@router.post("/institutions", response_model=InstitutionOut, status_code=201)
async def create_institution(
    body: InstitutionIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> InstitutionOut:
    require_perm(ctx, "institution.create")
    if body.type not in INSTITUTION_TYPES:
        raise ValidationFailed("Unknown institution type.", details={"fields": {"type": "Choose a valid type"}})
    clash = await session.execute(
        select(Institution).where(
            or_(func.lower(Institution.name) == body.name.strip().lower(), Institution.code == body.code)
        )
    )
    if clash.scalar_one_or_none() is not None:
        raise Conflict("An institution with this name or code already exists.")
    row = Institution(
        name=body.name.strip(),
        code=body.code,
        type=body.type,
        status="pending",
        city=body.city,
        region=body.region,
        country=body.country,
        contact_name=body.contact_name,
        contact_email=str(body.contact_email) if body.contact_email else None,
    )
    session.add(row)
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action="institution.create",
            target_type="institution",
            target_id=row.id,
            target_label=row.name,
            institution_id=row.id,
            institution_label=row.name,
        ),
    )
    return _out(row)


@router.get("/institutions/{institution_id}", response_model=InstitutionOut)
async def get_institution(
    institution_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> InstitutionOut:
    require_perm(ctx, "institution.read")
    row = await session.get(Institution, institution_id)
    if row is None:
        raise NotFound("Institution not found.")
    return _out(row)


@router.patch("/institutions/{institution_id}", response_model=InstitutionOut)
async def update_institution(
    institution_id: uuid.UUID,
    body: InstitutionPatch,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> InstitutionOut:
    require_perm(ctx, "institution.update")
    row = await session.get(Institution, institution_id)
    if row is None:
        raise NotFound("Institution not found.")
    if body.type is not None and body.type not in INSTITUTION_TYPES:
        raise ValidationFailed("Unknown institution type.", details={"fields": {"type": "Choose a valid type"}})
    diff: dict = {}
    for field_name in ("name", "type", "city", "region", "country", "contact_name"):
        value = getattr(body, field_name)
        if value is not None and value != getattr(row, field_name):
            diff[field_name] = {"before": getattr(row, field_name), "after": value}
            setattr(row, field_name, value)
    if body.contact_email is not None:
        value = str(body.contact_email)
        if value != row.contact_email:
            diff["contact_email"] = {"before": row.contact_email, "after": value}
            row.contact_email = value
    await session.commit()
    if diff:
        await _audit(request).emit(
            ctx,
            AuditEvent(
                action="institution.update",
                target_type="institution",
                target_id=row.id,
                target_label=row.name,
                institution_id=row.id,
                institution_label=row.name,
                diff=diff,
            ),
        )
    return _out(row)


async def _transition(
    institution_id: uuid.UUID,
    new_status: str,
    reason: str | None,
    request: Request,
    session: AsyncSession,
    ctx: RequestContext,
) -> InstitutionOut:
    require_perm(ctx, "institution.suspend")
    row = await session.get(Institution, institution_id)
    if row is None:
        raise NotFound("Institution not found.")
    if row.status == new_status:
        return _out(row)
    before = row.status
    row.status = new_status
    row.status_note = reason
    row.suspended_at = datetime.now(UTC) if new_status == "suspended" else None
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action={"suspended": "institution.suspend", "active": "institution.reactivate"}[new_status],
            target_type="institution",
            target_id=row.id,
            target_label=row.name,
            institution_id=row.id,
            institution_label=row.name,
            diff={"status": {"before": before, "after": new_status}, "reason": reason},
        ),
    )
    return _out(row)


@router.post("/institutions/{institution_id}/suspend", response_model=InstitutionOut)
async def suspend_institution(
    institution_id: uuid.UUID,
    body: StatusIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> InstitutionOut:
    return await _transition(institution_id, "suspended", body.reason, request, session, ctx)


@router.post("/institutions/{institution_id}/reactivate", response_model=InstitutionOut)
async def reactivate_institution(
    institution_id: uuid.UUID,
    body: StatusIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> InstitutionOut:
    return await _transition(institution_id, "active", body.reason, request, session, ctx)


# ---- platform settings ----

async def _settings_row(session: AsyncSession) -> PlatformSettings:
    row = await session.get(PlatformSettings, 1)
    if row is None:
        row = PlatformSettings(id=1)
        session.add(row)
        await session.flush()
    return row


@router.get("/settings/platform", response_model=SettingsOut)
async def read_settings(
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> SettingsOut:
    require_perm(ctx, "settings.read")
    row = await _settings_row(session)
    return SettingsOut(
        platform_name=row.platform_name,
        support_email=row.support_email,
        sign_in_notice=row.sign_in_notice,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.put("/settings/platform", response_model=SettingsOut)
async def write_settings(
    body: SettingsIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> SettingsOut:
    require_perm(ctx, "settings.update")
    row = await _settings_row(session)
    diff: dict = {}
    incoming = {
        "platform_name": body.platform_name,
        "support_email": str(body.support_email) if body.support_email else None,
        "sign_in_notice": body.sign_in_notice,
    }
    for key, value in incoming.items():
        if getattr(row, key) != value:
            diff[key] = {"before": getattr(row, key), "after": value}
            setattr(row, key, value)
    row.updated_at = datetime.now(UTC)
    row.updated_by = ctx.actor_id
    await session.commit()
    if diff:
        await _audit(request).emit(
            ctx,
            AuditEvent(action="settings.update", target_type="settings", target_id="platform", target_label="Platform settings", diff=diff),
        )
    return SettingsOut(
        platform_name=row.platform_name,
        support_email=row.support_email,
        sign_in_notice=row.sign_in_notice,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


# ---- internal API ----

class BatchIn(CamelModel):
    ids: list[uuid.UUID]


@router.post("/internal/institutions/batch")
async def institutions_batch(
    body: BatchIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if not body.ids:
        return {"items": []}
    result = await session.execute(select(Institution).where(Institution.id.in_(body.ids)))
    return {
        "items": [
            {"id": str(r.id), "name": r.name, "code": r.code, "status": r.status}
            for r in result.scalars()
        ]
    }


@router.get("/internal/stats/institutions")
async def institution_stats(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    rows = await session.execute(select(Institution.status, func.count()).group_by(Institution.status))
    by_status = {status: count for status, count in rows.all()}
    now = datetime.now(UTC)
    last30 = now - timedelta(days=30)
    prior60 = now - timedelta(days=60)
    new_last = (
        await session.execute(select(func.count()).select_from(Institution).where(Institution.created_at >= last30))
    ).scalar_one()
    new_prior = (
        await session.execute(
            select(func.count())
            .select_from(Institution)
            .where(Institution.created_at >= prior60, Institution.created_at < last30)
        )
    ).scalar_one()
    pending = await session.execute(
        select(Institution)
        .where(Institution.status == "pending")
        .order_by(Institution.created_at.asc())
        .limit(6)
    )
    return {
        "total": sum(by_status.values()),
        "byStatus": by_status,
        "newLast30Days": int(new_last),
        "newPrior30Days": int(new_prior),
        "pendingReview": [_out(r).model_dump(mode="json", by_alias=True) for r in pending.scalars()],
    }
