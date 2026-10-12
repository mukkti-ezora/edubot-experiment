import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.shared.audit import AuditClient, AuditEvent
from services.shared.clients import ServiceClient
from services.shared.context import RequestContext, get_context
from services.shared.errors import Conflict, NotFound, ValidationFailed
from services.shared.pagination import coerce_cursor_value, decode_cursor, encode_cursor
from services.shared.policy import require_perm, require_platform_scope
from services.shared.schemas import CamelModel, Page
from services.shared.tenancy import scope_filter
from services.users.db import get_session
from services.users.models import USER_STATUSES, USER_TYPES, ClassMember, ClassSection, User

router = APIRouter()


class UserOut(CamelModel):
    id: uuid.UUID
    institution_id: uuid.UUID | None
    institution_name: str | None = None
    type: str
    first_name: str
    last_name: str
    name: str
    email: str
    status: str
    created_at: datetime
    updated_at: datetime


class UserPatch(CamelModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None


class AdministratorIn(CamelModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role_id: uuid.UUID | None = None


def _audit(request: Request) -> AuditClient:
    return request.app.state.audit


def _name(u: User) -> str:
    return f"{u.first_name} {u.last_name}"


def _out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        institution_id=u.institution_id,
        type=u.type,
        first_name=u.first_name,
        last_name=u.last_name,
        name=_name(u),
        email=u.email,
        status=u.status,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


SORTABLE: dict[str, Any] = {
    "name": User.last_name + " " + User.first_name,
    "email": User.email,
    "createdAt": User.created_at,
    "status": User.status,
    "type": User.type,
}
VALUE_OF = {
    "name": lambda u: f"{u.last_name} {u.first_name}",
    "email": lambda u: u.email,
    "createdAt": lambda u: u.created_at.isoformat(),
    "status": lambda u: u.status,
    "type": lambda u: u.type,
}


async def _institution_names(request: Request, ctx: RequestContext, users: list[User]) -> dict[str, str]:
    ids = sorted({str(u.institution_id) for u in users if u.institution_id is not None})
    return await _institution_names_for_ids(request, ctx, ids)


async def _institution_names_for_ids(
    request: Request, ctx: RequestContext, ids: list[str]
) -> dict[str, str]:
    if not ids:
        return {}
    tenancy: ServiceClient = request.app.state.tenancy
    try:
        data = await tenancy.post("/internal/institutions/batch", json={"ids": ids}, ctx=ctx)
        return {item["id"]: item["name"] for item in data.get("items", [])}
    except Exception:
        return {}


async def _apply_role_filter(
    request: Request, ctx: RequestContext, conditions: list, role_id: uuid.UUID | None
) -> bool:
    """Resolve a role filter to an id-IN predicate via the RBAC service. Returns False => empty page."""
    if role_id is None:
        return True
    rbac: ServiceClient = request.app.state.rbac
    data = await rbac.post("/internal/assignments/lookup", json={"roleId": str(role_id)}, ctx=ctx)
    actor_ids = [uuid.UUID(a) for a in data.get("actorIds", [])]
    if not actor_ids:
        return False
    conditions.append(User.id.in_(actor_ids))
    return True


async def _list_users(
    request: Request,
    session: AsyncSession,
    ctx: RequestContext,
    *,
    base_conditions: list,
    query: str | None,
    status: str | None,
    type: str | None,
    institution_id: uuid.UUID | None,
    role_id: uuid.UUID | None,
    sort: str | None,
    cursor: str | None,
    limit: int,
) -> Page[UserOut]:
    conditions = list(base_conditions)
    if query:
        needle = query.strip().lower()
        conditions.append(
            func.lower(User.first_name + " " + User.last_name).like(f"%{needle}%")
            | User.email.ilike(f"%{needle}%")
        )
    if status:
        if status not in USER_STATUSES:
            raise ValidationFailed("Invalid status filter.")
        conditions.append(User.status == status)
    if type:
        if type not in USER_TYPES:
            raise ValidationFailed("Invalid type filter.")
        conditions.append(User.type == type)
    if institution_id is not None:
        conditions.append(User.institution_id == institution_id)
    if not await _apply_role_filter(request, ctx, conditions, role_id):
        return Page[UserOut](items=[], next_cursor=None)

    sort_key = sort or "name"
    descending = sort_key.startswith("-")
    sort_name = sort_key[1:] if descending else sort_key
    column = SORTABLE.get(sort_name)
    if column is None:
        raise ValidationFailed("Invalid sort field.")
    order = column.desc() if descending else column.asc()
    tiebreak = User.id.desc() if descending else User.id.asc()

    stmt = select(User)
    for cond in conditions:
        stmt = stmt.where(cond)
    stmt = stmt.order_by(order, tiebreak)

    decoded = decode_cursor(cursor)
    if decoded is not None:
        value = coerce_cursor_value(column, decoded[0])
        row_id = decoded[1]
        if descending:
            stmt = stmt.where((column < value) | ((column == value) & (User.id < row_id)))
        else:
            stmt = stmt.where((column > value) | ((column == value) & (User.id > row_id)))

    rows = list((await session.execute(stmt.limit(limit + 1))).scalars())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = encode_cursor(VALUE_OF[sort_name](last), last.id)

    names = await _institution_names(request, ctx, rows)
    items = []
    for u in rows:
        out = _out(u)
        out.institution_name = names.get(str(u.institution_id)) if u.institution_id else None
        items.append(out)
    return Page[UserOut](items=items, next_cursor=next_cursor)


# ---- users registry ----

@router.get("/users", response_model=Page[UserOut])
async def list_users(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    query: str | None = Query(default=None),
    institution_id: uuid.UUID | None = Query(default=None, alias="institutionId"),
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    role_id: uuid.UUID | None = Query(default=None, alias="roleId"),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
) -> Page[UserOut]:
    require_perm(ctx, "user.read")
    conditions: list = []
    # Tenant isolation is enforced here — institution scope can never see platform-wide rows.
    scope_filter(ctx, User.institution_id, conditions)
    if ctx.scope == "institution" and institution_id is not None and institution_id != ctx.institution_id:
        raise ValidationFailed("Institution filter is limited to your institution.")
    return await _list_users(
        request, session, ctx,
        base_conditions=conditions, query=query, status=status, type=type,
        institution_id=institution_id, role_id=role_id, sort=sort, cursor=cursor, limit=limit,
    )


async def _fetch_scoped(session: AsyncSession, ctx: RequestContext, user_id: uuid.UUID) -> User:
    row = await session.get(User, user_id)
    if row is None:
        raise NotFound("User not found.")
    if ctx.scope == "institution" and row.institution_id != ctx.institution_id:
        # Deliberate 404: do not leak existence across tenants.
        raise NotFound("User not found.")
    if ctx.scope not in ("platform", "institution"):
        raise NotFound("User not found.")
    return row


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    require_perm(ctx, "user.read")
    row = await _fetch_scoped(session, ctx, user_id)
    out = _out(row)
    names = await _institution_names(request, ctx, [row])
    out.institution_name = names.get(str(row.institution_id)) if row.institution_id else None
    return out


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserPatch,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    require_perm(ctx, "user.update")
    row = await _fetch_scoped(session, ctx, user_id)
    diff: dict = {}
    for field_name in ("first_name", "last_name"):
        value = getattr(body, field_name)
        if value is not None and value.strip() != getattr(row, field_name):
            diff[field_name] = {"before": getattr(row, field_name), "after": value.strip()}
            setattr(row, field_name, value.strip())
    if body.email is not None:
        email = str(body.email).strip().lower()
        if email != row.email:
            clash = await session.execute(select(User).where(User.email == email, User.id != row.id))
            if clash.scalar_one_or_none() is not None:
                raise Conflict("A user with this email already exists.")
            diff["email"] = {"before": row.email, "after": email}
            row.email = email
    await session.commit()
    if diff:
        await _audit(request).emit(
            ctx,
            AuditEvent(
                action="user.update",
                target_type="user", target_id=row.id, target_label=_name(row),
                institution_id=row.institution_id, diff=diff,
            ),
        )
    return _out(row)


async def _set_user_status(
    user_id: uuid.UUID,
    new_status: str,
    request: Request,
    session: AsyncSession,
    ctx: RequestContext,
    *,
    permission: str,
    action: str,
) -> UserOut:
    require_perm(ctx, permission)
    row = await _fetch_scoped(session, ctx, user_id)
    if row.id == ctx.actor_id and new_status == "deactivated":
        raise Conflict("You can't deactivate your own account.")
    if row.status == new_status:
        return _out(row)
    before = row.status
    row.status = new_status

    # Platform administrators also carry a credential account in the identity service.
    if row.institution_id is None and row.type == "administrator":
        identity: ServiceClient = request.app.state.identity
        await identity.post(
            f"/internal/accounts/by-person/{row.id}/status",
            json={"status": "disabled" if new_status == "deactivated" else "active"},
            ctx=ctx,
        )

    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action=action,
            target_type="user", target_id=row.id, target_label=_name(row),
            institution_id=row.institution_id,
            diff={"status": {"before": before, "after": new_status}},
        ),
    )
    return _out(row)


@router.post("/users/{user_id}/activate", response_model=UserOut)
async def activate_user(
    user_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    return await _set_user_status(
        user_id, "active", request, session, ctx,
        permission="user.deactivate", action="user.activate",
    )


@router.post("/users/{user_id}/deactivate", response_model=UserOut)
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    return await _set_user_status(
        user_id, "deactivated", request, session, ctx,
        permission="user.deactivate", action="user.deactivate",
    )


# ---- platform administrators ----

def _admin_base() -> list:
    return [User.institution_id.is_(None), User.type == "administrator"]


@router.get("/administrators", response_model=Page[UserOut])
async def list_administrators(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    query: str | None = Query(default=None),
    status: str | None = Query(default=None),
    role_id: uuid.UUID | None = Query(default=None, alias="roleId"),
    sort: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
) -> Page[UserOut]:
    require_platform_scope(ctx)
    require_perm(ctx, "admin.read")
    return await _list_users(
        request, session, ctx,
        base_conditions=_admin_base(), query=query, status=status, type=None,
        institution_id=None, role_id=role_id, sort=sort, cursor=cursor, limit=limit,
    )


@router.get("/administrators/{user_id}", response_model=UserOut)
async def get_administrator(
    user_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    require_platform_scope(ctx)
    require_perm(ctx, "admin.read")
    row = await _fetch_scoped(session, ctx, user_id)
    if row.institution_id is not None:
        raise NotFound("Administrator not found.")
    return _out(row)


@router.post("/administrators", response_model=dict, status_code=201)
async def create_administrator(
    body: AdministratorIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    require_platform_scope(ctx)
    require_perm(ctx, "admin.create")
    email = str(body.email).strip().lower()
    clash = await session.execute(select(User).where(User.email == email))
    if clash.scalar_one_or_none() is not None:
        raise Conflict("A user with this email already exists.")

    person = User(
        institution_id=None,
        type="administrator",
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        email=email,
        status="invited",
    )
    session.add(person)
    await session.flush()

    audit = _audit(request)
    try:
        identity: ServiceClient = request.app.state.identity
        account = await identity.post(
            "/internal/accounts", json={"personId": str(person.id), "email": email}, ctx=ctx
        )
        if body.role_id is not None:
            rbac: ServiceClient = request.app.state.rbac
            await rbac.post(
                f"/roles/{body.role_id}/assignments",
                json={"actorId": str(person.id)},
                ctx=ctx,
            )
    except Exception:
        # Compensating action for the distributed write (two services): remove the dangling person.
        await session.delete(person)
        await session.commit()
        raise

    await session.commit()
    await audit.emit(
        ctx,
        AuditEvent(
            action="admin.create",
            target_type="user", target_id=person.id, target_label=_name(person),
            diff={"email": email, "roleId": str(body.role_id) if body.role_id else None},
        ),
    )
    return {
        "administrator": _out(person).model_dump(by_alias=True),
        # Honest simulation: no email is sent; the console displays this once.
        "invite": {
            "simulated": True,
            "inviteToken": account["inviteToken"],
            "note": "Email delivery isn't configured yet. Share this setup link manually.",
        },
    }


@router.post("/administrators/{user_id}/deactivate", response_model=UserOut)
async def deactivate_administrator(
    user_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    require_platform_scope(ctx)
    return await _set_user_status(
        user_id, "deactivated", request, session, ctx,
        permission="admin.update", action="admin.deactivate",
    )


@router.post("/administrators/{user_id}/activate", response_model=UserOut)
async def activate_administrator(
    user_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> UserOut:
    require_platform_scope(ctx)
    return await _set_user_status(
        user_id, "active", request, session, ctx,
        permission="admin.update", action="admin.activate",
    )


# ---- people aggregates ----

class TypeStats(CamelModel):
    total: int
    by_status: dict[str, int]


class InstitutionCount(CamelModel):
    institution_id: uuid.UUID
    institution_name: str | None = None
    count: int


class PeopleStats(CamelModel):
    generated_at: datetime
    by_type: dict[str, TypeStats]
    by_institution: dict[str, list[InstitutionCount]]


@router.get("/people/stats", response_model=PeopleStats)
async def people_stats(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> PeopleStats:
    """Platform-wide aggregate over the people registry (category overviews).

    Platform administrators carry institution_id NULL: they count toward byType
    totals but belong to no institution, so they never appear in byInstitution.
    """
    require_perm(ctx, "user.read")

    totals: dict[str, int] = {t: 0 for t in USER_TYPES}
    by_status: dict[str, dict[str, int]] = {t: {s: 0 for s in USER_STATUSES} for t in USER_TYPES}
    status_rows = await session.execute(
        select(User.type, User.status, func.count()).group_by(User.type, User.status)
    )
    for type_, status_, count in status_rows.all():
        totals[type_] = totals.get(type_, 0) + int(count)
        statuses = by_status.setdefault(type_, {s: 0 for s in USER_STATUSES})
        statuses[status_] = statuses.get(status_, 0) + int(count)

    grouped: dict[str, list[tuple[uuid.UUID, int]]] = {t: [] for t in USER_TYPES}
    inst_rows = await session.execute(
        select(User.institution_id, User.type, func.count())
        .where(User.institution_id.is_not(None))
        .group_by(User.institution_id, User.type)
    )
    for inst_id, type_, count in inst_rows.all():
        grouped.setdefault(type_, []).append((inst_id, int(count)))

    names = await _institution_names_for_ids(
        request, ctx, sorted({str(inst_id) for entries in grouped.values() for inst_id, _ in entries})
    )

    by_institution: dict[str, list[InstitutionCount]] = {}
    for type_ in totals:
        top = sorted(grouped.get(type_, []), key=lambda pair: (-pair[1], str(pair[0])))[:10]
        by_institution[type_] = [
            InstitutionCount(institution_id=inst_id, institution_name=names.get(str(inst_id)), count=count)
            for inst_id, count in top
        ]

    return PeopleStats(
        generated_at=datetime.now(UTC),
        by_type={t: TypeStats(total=totals[t], by_status=by_status[t]) for t in totals},
        by_institution=by_institution,
    )


# ---- internal API ----

class BatchIn(CamelModel):
    ids: list[uuid.UUID]


@router.post("/internal/people/batch")
async def people_batch(
    body: BatchIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if not body.ids:
        return {"items": []}
    result = await session.execute(select(User).where(User.id.in_(body.ids)))
    return {"items": [
        {
            "id": str(u.id), "name": _name(u), "email": u.email, "type": u.type,
            "status": u.status, "institutionId": str(u.institution_id) if u.institution_id else None,
        }
        for u in result.scalars()
    ]}


@router.get("/internal/people/{person_id}/classes")
async def person_classes(
    person_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """A person's class sections. Teachers get each section's students; students get only teacher names."""
    memberships = (
        await session.execute(
            select(ClassMember, ClassSection)
            .join(ClassSection, ClassSection.id == ClassMember.section_id)
            .where(ClassMember.person_id == person_id)
            .order_by(ClassSection.code)
        )
    ).all()
    if not memberships:
        return {"classes": []}
    section_ids = [section.id for _, section in memberships]
    members = (
        await session.execute(
            select(ClassMember, User)
            .join(User, User.id == ClassMember.person_id)
            .where(ClassMember.section_id.in_(section_ids))
            .order_by(User.last_name, User.first_name)
        )
    ).all()
    by_section: dict[uuid.UUID, list[tuple[ClassMember, User]]] = {}
    for member, user in members:
        by_section.setdefault(member.section_id, []).append((member, user))

    classes = []
    for membership, section in memberships:
        roster = by_section.get(section.id, [])
        entry = {
            "id": str(section.id), "code": section.code, "name": section.name, "term": section.term,
            "institutionId": str(section.institution_id), "role": membership.role,
            "teachers": [_name(u) for m, u in roster if m.role == "teacher"],
        }
        if membership.role == "teacher":
            entry["students"] = [
                {"id": str(u.id), "name": _name(u), "email": u.email, "status": u.status}
                for m, u in roster if m.role == "student"
            ]
        classes.append(entry)
    return {"classes": classes}


@router.get("/internal/people/{person_id}")
async def people_one(
    person_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = await session.get(User, person_id)
    if row is None:
        raise NotFound("Person not found.")
    return {
        "id": str(row.id), "name": _name(row), "email": row.email, "type": row.type,
        "status": row.status,
        "institutionId": str(row.institution_id) if row.institution_id else None,
        "createdAt": row.created_at.isoformat(),
    }


@router.get("/internal/stats/users")
async def user_stats(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    by_type_rows = await session.execute(select(User.type, func.count()).group_by(User.type))
    by_type = {t: int(c) for t, c in by_type_rows.all()}
    total = sum(by_type.values())
    now = datetime.now(UTC)
    last30 = now - timedelta(days=30)
    prior60 = now - timedelta(days=60)
    new_last = (
        await session.execute(select(func.count()).select_from(User).where(User.created_at >= last30))
    ).scalar_one()
    new_prior = (
        await session.execute(
            select(func.count()).select_from(User).where(
                User.created_at >= prior60, User.created_at < last30
            )
        )
    ).scalar_one()
    suspended_recent = (
        await session.execute(
            select(func.count()).select_from(User).where(
                User.status == "suspended", User.updated_at >= now - timedelta(days=14)
            )
        )
    ).scalar_one()
    return {
        "total": int(total),
        "byType": by_type,
        "newLast30Days": int(new_last),
        "newPrior30Days": int(new_prior),
        "suspendedRecentlyCount": int(suspended_recent),
    }


@router.get("/internal/stats/institution-users")
async def institution_user_stats(
    session: Annotated[AsyncSession, Depends(get_session)],
    ids: str = Query(default=""),
) -> dict:
    wanted = [uuid.UUID(x) for x in ids.split(",") if x]
    result: dict[str, dict] = {}
    if not wanted:
        return {"items": result}
    rows = await session.execute(
        select(User.institution_id, User.type, func.count())
        .where(User.institution_id.in_(wanted))
        .group_by(User.institution_id, User.type)
    )
    for inst_id, type_, count in rows.all():
        bucket = result.setdefault(
            str(inst_id),
            {"users": 0, "students": 0, "teachers": 0, "parents": 0, "administrators": 0},
        )
        bucket["users"] += int(count)
        bucket[f"{type_}s"] = int(count)
    return {"items": result}
