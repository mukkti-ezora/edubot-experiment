"""Request context: the tenancy + identity primitive (ADR-0006).

The gateway verifies the access token and injects X-Edubot-* headers.
Services rehydrate a RequestContext from those headers after verifying the
internal token. Handlers declare authorization via require_perm(); repository
helpers apply scope. Nothing in a handler should ever filter on institution_id
by hand.
"""

from __future__ import annotations

import hmac
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

HEADER_INTERNAL_TOKEN = "X-Edubot-Internal-Token"
HEADER_REQUEST_ID = "X-Request-Id"
HEADER_ACTOR_ID = "X-Edubot-Actor-Id"
HEADER_ACTOR_EMAIL = "X-Edubot-Actor-Email"
HEADER_SCOPE = "X-Edubot-Scope"  # "platform" | "institution"
HEADER_INSTITUTION_ID = "X-Edubot-Institution-Id"
HEADER_PERMISSIONS = "X-Edubot-Permissions"  # comma-separated capability keys

SCOPE_PLATFORM = "platform"
SCOPE_INSTITUTION = "institution"


@dataclass(frozen=True)
class RequestContext:
    actor_id: uuid.UUID | None
    email: str | None
    scope: str | None  # None == anonymous (e.g. login calls)
    institution_id: uuid.UUID | None
    permissions: frozenset[str] = field(default_factory=frozenset)
    request_id: str = ""
    ip: str | None = None
    user_agent: str | None = None

    @property
    def is_authenticated(self) -> bool:
        return self.actor_id is not None

    @property
    def is_platform(self) -> bool:
        return self.scope == SCOPE_PLATFORM


def anonymous_context(request: Request) -> RequestContext:
    return RequestContext(
        actor_id=None,
        email=None,
        scope=None,
        institution_id=None,
        permissions=frozenset(),
        request_id=getattr(request.state, "request_id", ""),
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def get_context(request: Request) -> RequestContext:
    ctx = getattr(request.state, "ctx", None)
    if ctx is None:
        ctx = anonymous_context(request)
        request.state.ctx = ctx
    return ctx


def forward_headers(ctx: RequestContext) -> dict[str, str]:
    """Headers a service sends onward when calling another service."""
    headers: dict[str, str] = {HEADER_REQUEST_ID: ctx.request_id}
    if ctx.actor_id is not None:
        headers[HEADER_ACTOR_ID] = str(ctx.actor_id)
    if ctx.email:
        headers[HEADER_ACTOR_EMAIL] = ctx.email
    if ctx.scope:
        headers[HEADER_SCOPE] = ctx.scope
    if ctx.institution_id:
        headers[HEADER_INSTITUTION_ID] = str(ctx.institution_id)
    if ctx.permissions:
        headers[HEADER_PERMISSIONS] = ",".join(sorted(ctx.permissions))
    return headers


class ContextMiddleware(BaseHTTPMiddleware):
    """Verifies the internal token and binds request-id + RequestContext.

    Any direct (non-gateway) caller without the internal token is rejected; the
    internal network contract is the only way in. Actor headers are optional:
    their absence means an anonymous call (used by login/refresh).
    """

    def __init__(self, app, *, internal_token: str):  # noqa: ANN001
        super().__init__(app)
        self._internal_token = internal_token

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001
        supplied = request.headers.get(HEADER_INTERNAL_TOKEN, "")
        expected = self._internal_token
        if not supplied or not hmac.compare_digest(supplied, expected):
            return JSONResponse(
                status_code=401,
                content={
                    "code": "UNAUTHENTICATED",
                    "message": "Missing or invalid internal token.",
                    "details": None,
                    "requestId": None,
                },
            )

        request_id = request.headers.get(HEADER_REQUEST_ID) or str(uuid.uuid4())
        request.state.request_id = request_id

        actor_raw = request.headers.get(HEADER_ACTOR_ID)
        actor_id = uuid.UUID(actor_raw) if actor_raw else None
        scope = request.headers.get(HEADER_SCOPE)
        inst_raw = request.headers.get(HEADER_INSTITUTION_ID)
        institution_id = uuid.UUID(inst_raw) if inst_raw else None
        perms_raw = request.headers.get(HEADER_PERMISSIONS, "")
        permissions: Iterable[str] = [p for p in perms_raw.split(",") if p]

        request.state.ctx = RequestContext(
            actor_id=actor_id,
            email=request.headers.get(HEADER_ACTOR_EMAIL),
            scope=scope,
            institution_id=institution_id,
            permissions=frozenset(permissions),
            request_id=request_id,
            ip=request.headers.get("x-forwarded-for", request.client.host if request.client else None),
            user_agent=request.headers.get("user-agent"),
        )

        response = await call_next(request)
        response.headers[HEADER_REQUEST_ID] = request_id
        return response
