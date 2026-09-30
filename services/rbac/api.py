import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.rbac.db import get_session
from services.rbac.models import Permission, Role, RoleAssignment, RolePermission
from services.shared.audit import AuditClient, AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import Conflict, NotFound, ValidationFailed
from services.shared.policy import require_perm
from services.shared.schemas import CamelModel

router = APIRouter()


class PermissionOut(CamelModel):
    id: uuid.UUID
    key: str
    domain: str
    description: str


class RoleSummaryOut(CamelModel):
    id: uuid.UUID
    name: str
    scope: str
    description: str
    is_system: bool
    permission_count: int
    member_count: int


class RoleDetailOut(CamelModel):
    id: uuid.UUID
    name: str
    scope: str
    description: str
    is_system: bool
    permissions: list[PermissionOut]
    members: list[dict]
    member_count: int


class RoleIn(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    permission_keys: list[str] = Field(default_factory=list)


class RolePatch(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    permission_keys: list[str] | None = None


class AssignmentIn(CamelModel):
    actor_id: uuid.UUID
    institution_id: uuid.UUID | None = None


class AssignmentOut(CamelModel):
    id: uuid.UUID
    actor_id: uuid.UUID
    role_id: uuid.UUID
    scope: str
    institution_id: uuid.UUID | None
    created_at: object


def _audit(request: Request) -> AuditClient:
    return request.app.state.audit


# ---- permission catalog ----

@router.get("/permissions", response_model=list[PermissionOut])
async def list_permissions(
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> list[PermissionOut]:
    require_perm(ctx, "role.read")
    result = await session.execute(select(Permission).order_by(Permission.domain, Permission.key))
    return [
        PermissionOut(id=p.id, key=p.key, domain=p.domain, description=p.description)
        for p in result.scalars()
    ]


# ---- roles ----

@router.get("/roles", response_model=list[RoleSummaryOut])
async def list_roles(
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    query: str | None = Query(default=None),
) -> list[RoleSummaryOut]:
    require_perm(ctx, "role.read")
    perm_counts = (
        select(RolePermission.role_id, func.count().label("count"))
        .group_by(RolePermission.role_id)
        .subquery()
    )
    member_counts = (
        select(RoleAssignment.role_id, func.count().label("count"))
        .group_by(RoleAssignment.role_id)
        .subquery()
    )
    stmt = (
        select(Role, perm_counts.c.count, member_counts.c.count)
        .outerjoin(perm_counts, perm_counts.c.role_id == Role.id)
        .outerjoin(member_counts, member_counts.c.role_id == Role.id)
        .order_by(Role.name)
    )
    if query:
        stmt = stmt.where(Role.name.ilike(f"%{query.strip()}%"))
    result = await session.execute(stmt)
    return [
        RoleSummaryOut(
            id=role.id,
            name=role.name,
            scope=role.scope,
            description=role.description,
            is_system=role.is_system,
            permission_count=int(pcount or 0),
            member_count=int(mcount or 0),
        )
        for role, pcount, mcount in result.all()
    ]


async def _role_or_404(session: AsyncSession, role_id: uuid.UUID) -> Role:
    role = await session.get(Role, role_id)
    if role is None:
        raise NotFound("Role not found.")
    return role


async def _permissions_for_keys(session: AsyncSession, keys: list[str]) -> list[Permission]:
    if not keys:
        return []
    result = await session.execute(select(Permission).where(Permission.key.in_(keys)))
    found = {p.key: p for p in result.scalars()}
    unknown = [k for k in keys if k not in found]
    if unknown:
        raise ValidationFailed("Unknown permissions.", details={"fields": {"permissionKeys": ", ".join(unknown)}})
    return [found[k] for k in dict.fromkeys(keys)]  # dedupe, keep order


async def _set_role_permissions(session: AsyncSession, role: Role, keys: list[str]) -> None:
    perms = await _permissions_for_keys(session, keys)
    await session.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
    for p in perms:
        session.add(RolePermission(role_id=role.id, permission_id=p.id))
    await session.flush()


@router.post("/roles", response_model=RoleDetailOut, status_code=201)
async def create_role(
    body: RoleIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> RoleDetailOut:
    require_perm(ctx, "role.create")
    existing = await session.execute(select(Role).where(func.lower(Role.name) == body.name.strip().lower()))
    if existing.scalar_one_or_none() is not None:
        raise Conflict("A role with this name already exists.")
    role = Role(name=body.name.strip(), description=body.description, scope="platform")
    session.add(role)
    await session.flush()
    await _set_role_permissions(session, role, body.permission_keys)
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action="role.create",
            target_type="role",
            target_id=role.id,
            target_label=role.name,
            diff={"permissionKeys": body.permission_keys},
        ),
    )
    return await get_role(role.id, session, ctx, request)


@router.get("/roles/{role_id}", response_model=RoleDetailOut)
async def get_role(
    role_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    request: Request,
) -> RoleDetailOut:
    require_perm(ctx, "role.read")
    role = await _role_or_404(session, role_id)

    perm_stmt = (
        select(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role.id)
        .order_by(Permission.domain, Permission.key)
    )
    perms = (await session.execute(perm_stmt)).scalars().all()

    assign_stmt = select(RoleAssignment).where(RoleAssignment.role_id == role.id).order_by(RoleAssignment.created_at)
    assignments = list((await session.execute(assign_stmt)).scalars())

    members: list[dict] = []
    if assignments:
        users_client = request.app.state.users
        try:
            people = await users_client.post(
                "/internal/people/batch",
                json={"ids": [str(a.actor_id) for a in assignments]},
                ctx=ctx,
            )
            by_id = {p["id"]: p for p in people.get("items", [])}
        except Exception:
            by_id = {}
        for a in assignments:
            person = by_id.get(str(a.actor_id))
            members.append(
                {
                    "assignmentId": str(a.id),
                    "personId": str(a.actor_id),
                    "name": person.get("name") if person else "Unknown administrator",
                    "email": person.get("email") if person else None,
                    "status": person.get("status") if person else None,
                    "scope": a.scope,
                }
            )

    member_count = (
        await session.execute(
            select(func.count()).select_from(RoleAssignment).where(RoleAssignment.role_id == role.id)
        )
    ).scalar_one()

    return RoleDetailOut(
        id=role.id,
        name=role.name,
        scope=role.scope,
        description=role.description,
        is_system=role.is_system,
        permissions=[
            PermissionOut(id=p.id, key=p.key, domain=p.domain, description=p.description)
            for p in perms
        ],
        members=members,
        member_count=int(member_count),
    )


@router.patch("/roles/{role_id}", response_model=RoleDetailOut)
async def update_role(
    role_id: uuid.UUID,
    body: RolePatch,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> RoleDetailOut:
    require_perm(ctx, "role.create")
    role = await _role_or_404(session, role_id)
    diff: dict = {}
    if body.name is not None and body.name.strip() != role.name:
        clash = await session.execute(
            select(Role).where(func.lower(Role.name) == body.name.strip().lower(), Role.id != role.id)
        )
        if clash.scalar_one_or_none() is not None:
            raise Conflict("A role with this name already exists.")
        diff["name"] = {"before": role.name, "after": body.name.strip()}
        role.name = body.name.strip()
    if body.description is not None and body.description != role.description:
        diff["description"] = {"before": role.description, "after": body.description}
        role.description = body.description
    if body.permission_keys is not None:
        current = {
            row[0]
            for row in (
                await session.execute(
                    select(Permission.key)
                    .join(RolePermission, RolePermission.permission_id == Permission.id)
                    .where(RolePermission.role_id == role.id)
                )
            ).all()
        }
        incoming = set(body.permission_keys)
        if current != incoming:
            diff["permissions"] = {
                "added": sorted(incoming - current),
                "removed": sorted(current - incoming),
            }
            await _set_role_permissions(session, role, body.permission_keys)
    await session.commit()
    if diff:
        await _audit(request).emit(
            ctx,
            AuditEvent(action="role.update", target_type="role", target_id=role.id, target_label=role.name, diff=diff),
        )
    return await get_role(role.id, session, ctx, request)


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> None:
    require_perm(ctx, "role.create")
    role = await _role_or_404(session, role_id)
    if role.is_system:
        raise Conflict("System roles can't be deleted.")
    member_count = (
        await session.execute(
            select(func.count()).select_from(RoleAssignment).where(RoleAssignment.role_id == role.id)
        )
    ).scalar_one()
    if member_count:
        raise Conflict(
            "This role is assigned to administrators. Reassign them before deleting it.",
            details={"memberCount": int(member_count)},
        )
    await session.delete(role)
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(action="role.delete", target_type="role", target_id=role_id, target_label=role.name),
    )


# ---- assignments ----

@router.post("/roles/{role_id}/assignments", response_model=AssignmentOut, status_code=201)
async def assign_role(
    role_id: uuid.UUID,
    body: AssignmentIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> AssignmentOut:
    require_perm(ctx, "role.assign")
    role = await _role_or_404(session, role_id)
    existing = await session.execute(
        select(RoleAssignment).where(
            RoleAssignment.role_id == role.id,
            RoleAssignment.actor_id == body.actor_id,
            RoleAssignment.scope == "platform",
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise Conflict("This administrator already has this role.")
    assignment = RoleAssignment(
        actor_id=body.actor_id, role_id=role.id, scope="platform", institution_id=None, created_by=ctx.actor_id
    )
    session.add(assignment)
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action="role.assign",
            target_type="role",
            target_id=role.id,
            target_label=role.name,
            diff={"actorId": str(body.actor_id)},
        ),
    )
    await session.refresh(assignment)
    return AssignmentOut(
        id=assignment.id,
        actor_id=assignment.actor_id,
        role_id=assignment.role_id,
        scope=assignment.scope,
        institution_id=assignment.institution_id,
        created_at=assignment.created_at,
    )


@router.delete("/assignments/{assignment_id}", status_code=204)
async def unassign_role(
    assignment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> None:
    require_perm(ctx, "role.assign")
    assignment = await session.get(RoleAssignment, assignment_id)
    if assignment is None:
        raise NotFound("Assignment not found.")
    role = await session.get(Role, assignment.role_id)
    if assignment.actor_id == ctx.actor_id:
        raise Conflict("You can't remove your own role assignment.")
    await session.delete(assignment)
    await session.commit()
    await _audit(request).emit(
        ctx,
        AuditEvent(
            action="role.unassign",
            target_type="role",
            target_id=assignment.role_id,
            target_label=role.name if role else None,
            diff={"actorId": str(assignment.actor_id)},
        ),
    )


# ---- internal API ----

@router.get("/internal/actors/{actor_id}/permissions")
async def actor_permissions(
    actor_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    stmt = (
        select(Permission.key)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(RoleAssignment, RoleAssignment.role_id == RolePermission.role_id)
        .where(RoleAssignment.actor_id == actor_id, RoleAssignment.scope == "platform")
        .distinct()
    )
    result = await session.execute(stmt)
    return {"permissions": sorted(row[0] for row in result.all())}


@router.get("/internal/actors/{actor_id}/roles")
async def actor_roles(
    actor_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    stmt = (
        select(Role)
        .join(RoleAssignment, RoleAssignment.role_id == Role.id)
        .where(RoleAssignment.actor_id == actor_id)
        .order_by(Role.name)
    )
    result = await session.execute(stmt)
    return {"roles": [{"id": str(r.id), "name": r.name} for r in result.scalars()]}


class LookupIn(CamelModel):
    actor_ids: list[uuid.UUID] = Field(default_factory=list)
    role_id: uuid.UUID | None = None


@router.post("/internal/assignments/lookup")
async def lookup_assignments(
    body: LookupIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    stmt = select(RoleAssignment, Role.name).join(Role, Role.id == RoleAssignment.role_id)
    if body.actor_ids:
        stmt = stmt.where(RoleAssignment.actor_id.in_(body.actor_ids))
    if body.role_id:
        stmt = stmt.where(RoleAssignment.role_id == body.role_id)
    result = await session.execute(stmt)
    by_actor: dict[str, list[dict]] = {}
    for assignment, name in result.all():
        by_actor.setdefault(str(assignment.actor_id), []).append(
            {"id": str(assignment.id), "roleId": str(assignment.role_id), "name": name}
        )
    if body.role_id and not body.actor_ids:
        return {"actorIds": [str(a.actor_id) for a, _ in result.all()]}
    return {"byActor": by_actor}
