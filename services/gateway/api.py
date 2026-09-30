"""Gateway routes: auth edge, transparent proxying, BFF composition."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse, Response

from services.gateway.auth import (
    clear_session_cookies,
    context_headers,
    enforce_csrf,
    session_claims,
    set_session_cookies,
)
from services.gateway.config import Settings
from services.shared.errors import AppError, NotFound, Unauthenticated

router = APIRouter()

# prefix → service name (order matters: longest first)
ROUTE_MAP: list[tuple[str, str]] = [
    ("administrators", "users"),
    ("institutions", "tenancy"),
    ("settings", "tenancy"),
    ("users", "users"),
    ("roles", "rbac"),
    ("permissions", "rbac"),
    ("activity", "audit"),
]

BFF_PATHS = {"dashboard/summary"}


def _registry(request: Request):
    return request.app.state.registry


def _settings(request: Request) -> Settings:
    return request.app.state.settings


async def _call(
    request: Request,
    service: str,
    method: str,
    path: str,
    *,
    claims: dict | None = None,
    json_body: Any = None,
) -> dict:
    client = _registry(request).client(service)
    headers = context_headers(claims, request) if claims else {}
    try:
        response = await client.request(
            method,
            path,
            params=dict(request.query_params),
            json=json_body,
            headers=headers,
        )
    except Exception as exc:
        raise AppError("A dependent service is unavailable. Retry in a moment.") from exc
    if response.status_code == 404:
        body = response.json()
        raise NotFound(body.get("message", "Not found."))
    if response.status_code >= 400:
        try:
            body = response.json()
        except Exception:
            body = {}
        error = AppError(body.get("message", "Request failed."), details=body.get("details"))
        error.status_code = response.status_code
        error.code = body.get("code", "INTERNAL")
        raise error
    return response.json() if response.content else {}


# ---- auth edge ----

@router.post("/api/v1/auth/login")
async def login(request: Request) -> JSONResponse:
    settings = _settings(request)
    body = await request.json()
    client = _registry(request).client("identity")
    response = await client.post("/auth/login", json=body)
    payload = response.json() if response.content else {}
    if response.status_code >= 400:
        return JSONResponse(status_code=response.status_code, content=payload)
    out = JSONResponse(status_code=200, content={"scope": payload["scope"]})
    set_session_cookies(out, settings, payload)
    return out


@router.post("/api/v1/auth/refresh")
async def refresh(request: Request) -> JSONResponse:
    settings = _settings(request)
    token = request.cookies.get(settings.refresh_cookie)
    client = _registry(request).client("identity")
    response = await client.post("/auth/refresh", json={"refreshToken": token})
    payload = response.json() if response.content else {}
    if response.status_code >= 400:
        return JSONResponse(status_code=response.status_code, content=payload)
    out = JSONResponse(status_code=200, content={"scope": payload["scope"]})
    set_session_cookies(out, settings, payload)
    return out


@router.post("/api/v1/auth/logout", status_code=204)
async def logout(request: Request) -> Response:
    settings = _settings(request)
    token = request.cookies.get(settings.refresh_cookie)
    if token:
        client = _registry(request).client("identity")
        await client.post("/auth/logout", json={"refreshToken": token})
    response = Response(status_code=204)
    clear_session_cookies(response, settings)
    return response


@router.get("/api/v1/auth/me")
async def me(request: Request) -> dict:
    claims = session_claims(request)
    person_id = claims["sub"]
    users = _registry(request).client("users")
    rbac = _registry(request).client("rbac")
    headers = context_headers(claims, request)
    person_resp, roles_resp = await asyncio.gather(
        users.get(f"/internal/people/{person_id}", headers=headers),
        rbac.get(f"/internal/actors/{person_id}/roles", headers=headers),
    )
    if person_resp.status_code == 404:
        raise Unauthenticated("Your account no longer exists.")
    for resp in (person_resp, roles_resp):
        if resp.status_code >= 400:
            raise AppError("A dependent service is unavailable.")
    return {
        "admin": person_resp.json(),
        "roles": roles_resp.json().get("roles", []),
        "permissions": claims.get("perms", []),
        "scope": claims["scope"],
    }


# ---- BFF compositions ----

@router.get("/api/v1/dashboard/summary")
async def dashboard_summary(request: Request) -> dict:
    claims = session_claims(request)
    headers = context_headers(claims, request)
    registry = _registry(request)
    now = datetime.now(UTC)
    day_ago = (now - timedelta(hours=24)).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()

    inst_stats, user_stats, recent, by_inst, failed = await asyncio.gather(
        registry.client("tenancy").get("/internal/stats/institutions", headers=headers),
        registry.client("users").get("/internal/stats/users", headers=headers),
        registry.client("audit").get("/internal/events/recent", params={"limit": 8}, headers=headers),
        registry.client("audit").get(
            "/internal/stats/activity-by-institution", params={"since": week_ago}, headers=headers
        ),
        registry.client("audit").get(
            "/internal/stats/failed-signins", params={"since": day_ago}, headers=headers
        ),
    )
    for resp in (inst_stats, user_stats, recent, by_inst, failed):
        if resp.status_code >= 400:
            raise AppError("A dependent service is unavailable.")

    institutions = inst_stats.json()
    users = user_stats.json()
    failed_signins_24h = failed.json()["count"]

    return {
        "generatedAt": now.isoformat(),
        "institutions": {
            "total": institutions["total"],
            "byStatus": institutions["byStatus"],
            "newLast30Days": institutions["newLast30Days"],
            "newPrior30Days": institutions["newPrior30Days"],
        },
        "users": {
            "total": users["total"],
            "byType": users["byType"],
            "newLast30Days": users["newLast30Days"],
            "newPrior30Days": users["newPrior30Days"],
        },
        "attention": {
            "pendingInstitutions": institutions["pendingReview"],
            "suspendedUsersRecently": users["suspendedRecentlyCount"],
            "failedSignins24h": failed_signins_24h,
            "failedSigninsElevated": failed_signins_24h >= 10,
        },
        "recentActivity": recent.json()["items"],
        "institutionActivity": by_inst.json()["items"],
    }


@router.get("/api/v1/institutions/{institution_id}/overview")
async def institution_overview(request: Request, institution_id: uuid.UUID) -> dict:
    claims = session_claims(request)
    headers = context_headers(claims, request)
    registry = _registry(request)
    inst_resp = await registry.client("tenancy").get(f"/institutions/{institution_id}", headers=headers)
    if inst_resp.status_code == 404:
        raise NotFound("Institution not found.")
    if inst_resp.status_code >= 400:
        raise AppError("A dependent service is unavailable.")
    stats_resp, activity_resp = await asyncio.gather(
        registry.client("users").get(
            "/internal/stats/institution-users", params={"ids": str(institution_id)}, headers=headers
        ),
        registry.client("audit").get(
            "/activity",
            params={"institutionId": str(institution_id), "limit": 8},
            headers=headers,
        ),
    )
    stats = stats_resp.json()["items"].get(str(institution_id), {}) if stats_resp.status_code < 400 else {}
    activity = activity_resp.json()["items"] if activity_resp.status_code < 400 else []
    return {
        "institution": inst_resp.json(),
        "stats": stats,
        "recentActivity": activity,
    }


@router.get("/api/v1/administrators")
async def administrators_page(request: Request) -> dict:
    """Compose: people (users owners) + role names (rbac) + last sign-in (identity)."""
    claims = session_claims(request)
    headers = context_headers(claims, request)
    registry = _registry(request)
    page = await _call(
        request, "users", "GET", "/administrators", claims=claims
    )
    ids = [item["id"] for item in page.get("items", [])]
    if not ids:
        return page
    assignments, last_login = await asyncio.gather(
        registry.client("rbac").post(
            "/internal/assignments/lookup", json={"actorIds": ids}, headers=headers
        ),
        registry.client("identity").post(
            "/internal/accounts/batch", json={"personIds": ids}, headers=headers
        ),
    )
    roles_by_actor = assignments.json().get("byActor", {}) if assignments.status_code < 400 else {}
    login_by_person = last_login.json().get("lastLogin", {}) if last_login.status_code < 400 else {}
    for item in page["items"]:
        item["roles"] = roles_by_actor.get(item["id"], [])
        item["lastLoginAt"] = login_by_person.get(item["id"])
    return page


@router.get("/api/v1/administrators/{person_id}")
async def administrator_detail(request: Request, person_id: uuid.UUID) -> dict:
    claims = session_claims(request)
    headers = context_headers(claims, request)
    registry = _registry(request)
    person_resp = await registry.client("users").get(f"/administrators/{person_id}", headers=headers)
    if person_resp.status_code == 404:
        raise NotFound("Administrator not found.")
    if person_resp.status_code >= 400:
        raise AppError("A dependent service is unavailable.")
    account_resp, roles_resp = await asyncio.gather(
        registry.client("identity").get(
            f"/internal/accounts/by-person/{person_id}", headers=headers
        ),
        registry.client("rbac").get(f"/internal/actors/{person_id}/roles", headers=headers),
    )
    return {
        "administrator": person_resp.json(),
        "account": account_resp.json() if account_resp.status_code < 400 else None,
        "roles": roles_resp.json().get("roles", []) if roles_resp.status_code < 400 else [],
    }


# ---- transparent proxy (last) ----

@router.api_route(
    "/api/v1/{path:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"], include_in_schema=False
)
async def proxy(request: Request, path: str) -> Response:
    enforce_csrf(request)
    claims = session_claims(request)
    target: tuple[str, str] | None = None
    for prefix, service in ROUTE_MAP:
        if path == prefix or path.startswith(prefix + "/"):
            target = (service, prefix)
            break
    if target is None or path in BFF_PATHS:
        raise NotFound("Unknown API route.")
    service, _ = target
    client = _registry(request).client(service)
    body = await request.body()
    headers = context_headers(claims, request)
    content_type = request.headers.get("content-type")
    if content_type:
        headers["content-type"] = content_type
    response = await client.request(
        request.method,
        "/" + path,
        params=dict(request.query_params),
        content=body or None,
        headers=headers,
    )
    return Response(
        status_code=response.status_code,
        content=response.content,
        media_type=response.headers.get("content-type"),
    )
