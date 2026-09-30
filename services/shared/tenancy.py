"""Repository-level tenant scoping (ADR-0006).

Every query against tenant-owned tables goes through scope_filter(). Handlers
never hand-write institution predicates. Platform scope (Super Admin) is the
explicit, policy-gated opt-out.
"""

from __future__ import annotations

from typing import Any

from services.shared.context import RequestContext
from services.shared.errors import TenantViolation


def scope_filter(ctx: RequestContext, column: Any, conditions: list) -> None:
    """Append the appropriate tenant predicate for `column` to `conditions` in place."""
    if ctx.scope == "platform":
        return  # explicit platform opt-out; permission checks already happened upstream
    if ctx.scope == "institution" and ctx.institution_id is not None:
        conditions.append(column == ctx.institution_id)
        return
    raise TenantViolation()
