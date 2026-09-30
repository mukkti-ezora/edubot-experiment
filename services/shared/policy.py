"""Policy kernel (ADR-0007).

Authorization is a single call: require_perm(ctx, "institution.create").
Never compare role names in application code.
"""

from __future__ import annotations

import uuid

from services.shared.context import RequestContext
from services.shared.errors import Forbidden, TenantViolation, Unauthenticated


def require_authenticated(ctx: RequestContext) -> None:
    if not ctx.is_authenticated:
        raise Unauthenticated()


def require_perm(ctx: RequestContext, perm: str) -> None:
    """Capability check. Platform scope is the only scope carrying permissions today."""
    require_authenticated(ctx)
    if ctx.scope != "platform":
        raise TenantViolation(audit_action=perm)
    if perm not in ctx.permissions:
        raise Forbidden(audit_action=perm)


def require_platform_scope(ctx: RequestContext) -> None:
    if not ctx.is_authenticated:
        raise Unauthenticated()
    if ctx.scope != "platform":
        raise TenantViolation(audit_action="platform.scope")


def ensure_resource_scope(ctx: RequestContext, institution_id: uuid.UUID | None) -> None:
    """Guard a tenant-owned resource. Institution-scoped actors only reach their own tenant."""
    if ctx.scope == "platform":
        return
    if ctx.scope == "institution" and institution_id is not None and ctx.institution_id == institution_id:
        return
    raise TenantViolation()
