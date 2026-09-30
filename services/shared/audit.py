"""Shared audit client (ADR-0008).

Every service emits product audit events through one contract:
the audit service's POST /internal/events. Emission is synchronous with a short
timeout; on failure the event degrades to an ops-log line (audit_fallback) and
processing continues. Outbox upgrade is tracked as OD-3.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx

from services.shared.context import HEADER_INTERNAL_TOKEN, RequestContext, forward_headers

log = logging.getLogger("audit")

RESULT_SUCCESS = "success"
RESULT_DENIED = "denied"
RESULT_ERROR = "error"


@dataclass
class AuditEvent:
    action: str  # e.g. "institution.create", "auth.sign_in_failed"
    result: str = RESULT_SUCCESS
    target_type: str | None = None
    target_id: uuid.UUID | str | None = None
    target_label: str | None = None
    institution_id: uuid.UUID | str | None = None
    institution_label: str | None = None
    diff: dict | None = None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class AuditClient:
    def __init__(
        self,
        base_url: str,
        internal_token: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            transport=transport,
            timeout=httpx.Timeout(1.5, connect=0.5),
            headers={HEADER_INTERNAL_TOKEN: internal_token},
        )

    async def emit(self, ctx: RequestContext, event: AuditEvent) -> None:
        payload = {
            "occurredAt": event.occurred_at.isoformat(),
            "action": event.action,
            "result": event.result,
            "actorId": str(ctx.actor_id) if ctx.actor_id else None,
            "actorType": "admin" if ctx.is_authenticated else "anonymous",
            "actorLabel": ctx.email,
            "targetType": event.target_type,
            "targetId": str(event.target_id) if event.target_id is not None else None,
            "targetLabel": event.target_label,
            "institutionId": str(event.institution_id) if event.institution_id is not None else None,
            "institutionLabel": event.institution_label,
            "requestId": ctx.request_id or None,
            "ip": ctx.ip,
            "userAgent": ctx.user_agent,
            "diff": event.diff,
        }
        try:
            response = await self._client.post(
                "/internal/events", json=payload, headers=forward_headers(ctx)
            )
            response.raise_for_status()
        except Exception:
            log.warning(
                "audit_fallback",
                extra={
                    "action": event.action,
                    "result": event.result,
                    "actor": ctx.email,
                    "target": f"{event.target_type}:{event.target_id}",
                },
            )

    async def emit_system(self, service: str, event: AuditEvent, *, request_id: str = "") -> None:
        """Emission with no human actor (startup jobs, seeding, system transitions)."""
        RequestContext(
            actor_id=None,
            email=service,
            scope="platform",
            institution_id=None,
            request_id=request_id,
        )
        payload_actor = {"actorType": "system"}
        try:
            response = await self._client.post(
                "/internal/events",
                json={
                    "occurredAt": event.occurred_at.isoformat(),
                    "action": event.action,
                    "result": event.result,
                    "actorId": None,
                    "actorType": payload_actor["actorType"],
                    "actorLabel": service,
                    "targetType": event.target_type,
                    "targetId": str(event.target_id) if event.target_id is not None else None,
                    "targetLabel": event.target_label,
                    "institutionId": str(event.institution_id)
                    if event.institution_id is not None
                    else None,
                    "institutionLabel": event.institution_label,
                    "requestId": request_id or None,
                    "ip": None,
                    "userAgent": None,
                    "diff": event.diff,
                },
            )
            response.raise_for_status()
        except Exception:
            log.warning("audit_fallback", extra={"action": event.action, "result": event.result})

    async def aclose(self) -> None:
        await self._client.aclose()


def forbidden_audit_hook(_audit: AuditClient | None = None):
    """on_forbidden hook for install_exception_handlers.

    The audit client is resolved from request.app.state at call time so tests and
    deployment wiring can replace it after app creation.
    """
    from starlette.requests import Request

    from services.shared.context import get_context

    async def _hook(request: Request, exc):  # noqa: ANN001, ANN202
        audit: AuditClient = request.app.state.audit
        ctx = get_context(request)
        action = getattr(exc, "audit_action", None) or f"http.{request.method.lower()}"
        path = request.url.path
        await audit.emit(
            ctx,
            AuditEvent(
                action=action if "." in action else "authz.denied",
                result=RESULT_DENIED,
                target_type="http",
                target_id=None,
                target_label=f"{request.method} {path}",
                diff={"detail": exc.message},
            ),
        )

    return _hook
