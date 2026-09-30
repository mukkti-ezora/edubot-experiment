"""Cookie/session plumbing at the edge."""

from __future__ import annotations

from typing import Any

from starlette.requests import Request
from starlette.responses import Response

from services.gateway.config import Settings
from services.shared.context import (
    HEADER_ACTOR_EMAIL,
    HEADER_ACTOR_ID,
    HEADER_INSTITUTION_ID,
    HEADER_PERMISSIONS,
    HEADER_REQUEST_ID,
    HEADER_SCOPE,
)
from services.shared.errors import Forbidden, Unauthenticated
from services.shared.tokens import decode_access_token


def session_claims(request: Request) -> dict[str, Any]:
    token = request.cookies.get(request.app.state.settings.access_cookie) or request.cookies.get(
        "edubot_access"
    )
    if not token:
        raise Unauthenticated()
    settings = request.app.state.settings
    return decode_access_token(token, secret=settings.jwt_secret)


def context_headers(claims: dict[str, Any], request: Request) -> dict[str, str]:
    headers = {
        HEADER_ACTOR_ID: claims["sub"],
        HEADER_ACTOR_EMAIL: claims["email"],
        HEADER_SCOPE: claims["scope"],
        HEADER_PERMISSIONS: ",".join(claims.get("perms", [])),
        HEADER_REQUEST_ID: getattr(request.state, "request_id", ""),
    }
    if claims.get("inst"):
        headers[HEADER_INSTITUTION_ID] = claims["inst"]
    return headers


def enforce_csrf(request: Request) -> None:
    """Cookie-auth CSRF guard: mutations must carry our custom header (browsers can't cross-origin set it)."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    settings: Settings = request.app.state.settings
    if request.headers.get(settings.csrf_header, "") != "fetch":
        raise Forbidden("Missing request header.", details={"header": settings.csrf_header})


def set_session_cookies(response: Response, settings: Settings, payload: dict) -> None:
    response.set_cookie(
        settings.access_cookie,
        payload["accessToken"],
        max_age=payload["accessExpiresIn"],
        path="/",
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )
    response.set_cookie(
        settings.refresh_cookie,
        payload["refreshToken"],
        max_age=payload["refreshExpiresInDays"] * 86400,
        path="/api/v1/auth",
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )


def clear_session_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.access_cookie, path="/")
    response.delete_cookie(settings.refresh_cookie, path="/api/v1/auth")
