"""Shared problem-details error model and FastAPI handlers.

Contract (ADR/architecture README §7): errors are
  {"code": str, "message": str, "details": ..., "requestId": str|None}
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("errors")


class AppError(Exception):
    status_code = 500
    code = "INTERNAL"
    public_message = "Something went wrong."

    def __init__(
        self,
        message: str | None = None,
        *,
        details: Any = None,
        audit_action: str | None = None,
    ) -> None:
        super().__init__(message or self.public_message)
        self.message = message or self.public_message
        self.details = details
        # Set by require_perm/scope checks so the exception handler can record a denied-attempt audit event.
        self.audit_action = audit_action


class ValidationFailed(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    public_message = "Some fields are invalid."


class Unauthenticated(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    public_message = "Sign in to continue."


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"
    public_message = "You don't have permission to do that."


class TenantViolation(AppError):
    status_code = 403
    code = "TENANT_VIOLATION"
    public_message = "That resource belongs to a different institution."


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"
    public_message = "Not found."


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"
    public_message = "That conflicts with an existing record."


class RateLimited(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    public_message = "Too many attempts. Try again in a few minutes."


class AccountDisabled(AppError):
    status_code = 403
    code = "ACCOUNT_DISABLED"
    public_message = "This account has been deactivated. Contact a platform administrator."


def problem_payload(exc: AppError, request_id: str | None) -> dict:
    return {
        "code": exc.code,
        "message": exc.message,
        "details": exc.details,
        "requestId": request_id,
    }


AuditHook = Callable[[Request, AppError], Awaitable[None]]


def install_exception_handlers(
    app: FastAPI,
    *,
    on_forbidden: AuditHook | None = None,
) -> None:
    """Register uniform error handling. `on_forbidden` is used to audit denied privileged attempts."""

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        if isinstance(exc, (Forbidden, TenantViolation)) and on_forbidden is not None:
            try:
                await on_forbidden(request, exc)
            except Exception:
                log.exception("denied-audit-failed")
        request_id = getattr(request.state, "request_id", None)
        headers: dict[str, str] = {}
        if isinstance(exc, RateLimited):
            headers["Retry-After"] = str(exc.details.get("retry_after_seconds")) if isinstance(exc.details, dict) else "60"
        return JSONResponse(
            status_code=exc.status_code,
            content=problem_payload(exc, request_id),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _request_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path")]
            fields[".".join(loc) or "body"] = err.get("msg", "Invalid value")
        payload = {
            "code": ValidationFailed.code,
            "message": ValidationFailed.public_message,
            "details": {"fields": fields},
            "requestId": request_id,
        }
        return JSONResponse(status_code=422, content=payload)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled-error")
        request_id = getattr(request.state, "request_id", None)
        payload = {
            "code": "INTERNAL",
            "message": "Something went wrong. Try again.",
            "details": None,
            "requestId": request_id,
        }
        return JSONResponse(status_code=500, content=payload)
