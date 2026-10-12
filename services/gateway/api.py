"""Gateway routes: auth edge, transparent proxying, BFF composition."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Request
from starlette.background import BackgroundTask
from starlette.responses import JSONResponse, Response, StreamingResponse

from services.gateway.auth import (
    clear_session_cookies,
    client_headers,
    context_headers,
    enforce_csrf,
    session_claims,
    set_session_cookies,
)
from services.gateway.config import Settings
from services.shared.context import RequestContext
from services.shared.errors import AppError, Forbidden, NotFound, Unauthenticated, ValidationFailed
from services.shared.policy import require_platform_scope

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
    ("student", "learning"),  # student portal: Learn, Practice, Doubts, Progress, Schedule
    ("teacher", "learning"),  # teacher portal: doubts inbox, grading, attendance, requests
]

BFF_PATHS = {"dashboard/summary"}
ROLE_SCOPES = frozenset({"student", "teacher", "parent"})
# Path segments that would let a public route resolve to another service's /internal API.
FORBIDDEN_PROXY_SEGMENTS = frozenset({".", "..", "internal"})
# File downloads keep how they should be shown, cached and sniffed.
PROXY_RESPONSE_HEADERS = frozenset({"content-disposition", "cache-control", "x-content-type-options"})
PROXY_BODY_LIMIT = 11 * 1024 * 1024  # a 10 MB upload plus headroom; services enforce their own, smaller limits
TUTOR_BODY_LIMIT = 32_768  # a 4,000-character message plus ids, with room for multi-byte text

logger = logging.getLogger(__name__)


class PayloadTooLarge(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"
    public_message = "That request is too large."


def _registry(request: Request):
    return request.app.state.registry


def _policy_context(claims: dict) -> RequestContext:
    """Just enough context for the shared policy kernel to judge a gateway session."""
    return RequestContext(
        actor_id=uuid.UUID(claims["sub"]), email=None, scope=claims["scope"], institution_id=None
    )


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
    if response.status_code >= 400:
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code == 404:
            raise NotFound(body.get("message", "Not found."))
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
    response = await client.post("/auth/login", json=body, headers=client_headers(request))
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
    response = await client.post("/auth/refresh", json={"refreshToken": token}, headers=client_headers(request))
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
        await client.post("/auth/logout", json={"refreshToken": token}, headers=client_headers(request))
    response = Response(status_code=204)
    clear_session_cookies(response, settings)
    return response


@router.get("/api/v1/auth/me")
async def me(request: Request) -> dict:
    claims = session_claims(request)
    person_id = claims["sub"]
    scope = claims["scope"]
    is_platform = scope == "platform"
    if not is_platform and scope not in ROLE_SCOPES:
        raise Forbidden("This account type is not supported.")
    headers = context_headers(claims, request)
    lookups = [_registry(request).client("users").get(f"/internal/people/{person_id}", headers=headers)]
    if is_platform:
        rbac = _registry(request).client("rbac")
        lookups.append(rbac.get(f"/internal/actors/{person_id}/roles", headers=headers))
    person_resp, *roles_resp = await asyncio.gather(*lookups)
    if person_resp.status_code == 404:
        raise Unauthenticated("Your account no longer exists.")
    for resp in (person_resp, *roles_resp):
        if resp.status_code >= 400:
            raise AppError("A dependent service is unavailable.")
    if is_platform:
        roles = roles_resp[0].json().get("roles", [])
        permissions = claims.get("perms", [])
    else:
        roles = []
        permissions = [f"{scope}.dashboard.read"]
    return {
        "admin": person_resp.json(),
        "roles": roles,
        "permissions": permissions,
        "scope": scope,
    }


# ---- BFF compositions ----

@router.get("/api/v1/dashboard/summary")
async def dashboard_summary(request: Request) -> dict:
    claims = session_claims(request)
    require_platform_scope(_policy_context(claims))
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
    require_platform_scope(_policy_context(claims))
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
    require_platform_scope(_policy_context(claims))
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
    require_platform_scope(_policy_context(claims))
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


# ---- role-specific dashboard BFFs ----

_SUBJECTS = [
    {"name": "Mathematics", "teacher": "Ms. Teresa Susan", "room": "204", "grade": "A", "score": 92},
    {"name": "Science", "teacher": "Mr. John Doe", "room": "Lab 02", "grade": "A", "score": 88},
    {"name": "English", "teacher": "Ms. Rita Owen", "room": "108", "grade": "B+", "score": 78},
    {"name": "Computer Science", "teacher": "Ms. Nina Patel", "room": "Lab 01", "grade": "A", "score": 90},
    {"name": "Social Studies", "teacher": "Mr. Alan Poe", "room": "110", "grade": "B+", "score": 82},
]

_TIMETABLE = [
    {"time": "08:00", "duration": "45 min", "subject": "Mathematics", "teacher": "Ms. Teresa Susan", "room": "204", "status": "completed"},
    {"time": "09:00", "duration": "45 min", "subject": "Science", "teacher": "Mr. John Doe", "room": "Lab 02", "status": "ongoing"},
    {"time": "10:15", "duration": "45 min", "subject": "English", "teacher": "Ms. Rita Owen", "room": "108", "status": "upcoming"},
    {"time": "11:15", "duration": "45 min", "subject": "Social Studies", "teacher": "Mr. Alan Poe", "room": "110", "status": "upcoming"},
    {"time": "13:00", "duration": "45 min", "subject": "Computer Science", "teacher": "Ms. Nina Patel", "room": "Lab 01", "status": "upcoming"},
    {"time": "14:00", "duration": "45 min", "subject": "Physical Education", "teacher": "Mr. Dan Ruiz", "room": "Ground", "status": "upcoming"},
]

_ASSIGNMENTS = [
    {"title": "Algebra Worksheet 4", "subject": "Mathematics", "due": "Tomorrow", "status": "pending"},
    {"title": "Lab Report: Newton's Laws", "subject": "Science", "due": "2 days", "status": "pending"},
    {"title": "Essay: Favourite Season", "subject": "English", "due": "3 days", "status": "pending"},
    {"title": "Fractions Practice", "subject": "Mathematics", "due": "Completed", "status": "graded", "score": "94%"},
    {"title": "Plant Life Cycle", "subject": "Science", "due": "Completed", "status": "graded", "score": "88%"},
    {"title": "Continent Map Study", "subject": "Social Studies", "due": "Completed", "status": "submitted"},
]

_EXAMS = [
    {"subject": "Science", "title": "Term Test", "date": "Fri, 23 Oct", "time": "09:00 AM", "room": "Lab 01"},
    {"subject": "Mathematics", "title": "Unit III", "date": "Mon, 28 Oct", "time": "10:00 AM", "room": "204"},
    {"subject": "English", "title": "Literature", "date": "Wed, 30 Oct", "time": "11:30 AM", "room": "108"},
]


UNASSIGNED_INSTITUTION = "Unassigned institution"
INSTITUTION_UNAVAILABLE = "Institution unavailable"


async def _institution_name(request: Request, claims: dict, institution_id: str | None) -> str:
    """Display name for a dashboard header. Degrades to a label rather than failing the page."""
    if institution_id is None:
        return UNASSIGNED_INSTITUTION
    try:
        batch = await _call(
            request, "tenancy", "POST", "/internal/institutions/batch",
            claims=claims, json_body={"ids": [institution_id]},
        )
    except AppError:
        logger.warning("institution name lookup failed for %s", institution_id, exc_info=True)
        return INSTITUTION_UNAVAILABLE
    items = batch.get("items", [])
    return items[0]["name"] if items else UNASSIGNED_INSTITUTION


async def _role_person(request: Request, scope: str) -> dict:
    """The caller's person record for a role dashboard, plus ``lastName`` and ``institutionName``."""
    claims = session_claims(request)
    if claims["scope"] != scope:
        raise Forbidden(f"This dashboard is for {scope}s.")
    person = await _call(request, "users", "GET", f"/internal/people/{claims['sub']}", claims=claims)
    return {
        **person,
        "lastName": person["name"].rsplit(" ", 1)[-1],
        "institutionName": await _institution_name(request, claims, person.get("institutionId")),
    }


@router.get("/api/v1/dashboard/student")
async def student_dashboard(request: Request) -> dict:
    person = await _role_person(request, "student")
    return {
        "profile": {"name": person["name"], "institution": person["institutionName"], "id": person["id"], "email": person["email"]},
        "stats": {
            "attendance": {"value": 94, "label": "Attendance", "unit": "%"},
            "gpa": {"value": 3.7, "label": "GPA", "unit": "/4.0"},
            "courses": {"value": 6, "label": "Courses"},
            "assignmentsDue": {"value": 3, "label": "Due this week"},
        },
        "timetable": _TIMETABLE,
        "subjects": _SUBJECTS,
        "assignments": _ASSIGNMENTS,
        "exams": _EXAMS,
        "fees": {"total": 9000, "paid": 6500, "balance": 2500, "nextDue": "2026-12-25", "nextAmount": 2000},
        "weeklyAttendance": [
            {"day": "Mon", "present": True}, {"day": "Tue", "present": True},
            {"day": "Wed", "present": True}, {"day": "Thu", "present": False},
            {"day": "Fri", "present": True},
        ],
    }


@router.get("/api/v1/dashboard/teacher")
async def teacher_dashboard(request: Request) -> dict:
    person = await _role_person(request, "teacher")
    return {
        "profile": {"name": person["name"], "institution": person["institutionName"], "department": "Science", "homeroom": "Grade III-A"},
        "stats": {
            "classesToday": {"value": 6, "label": "Classes today"},
            "teachingHours": {"value": "5h 20m", "label": "Teaching hours"},
            "totalStudents": {"value": 198, "label": "My students"},
            "avgAttendance": {"value": 93, "label": "Avg attendance", "unit": "%"},
            "pendingGrades": {"value": 12, "label": "Pending grades"},
        },
        "timetable": [
            {"time": "08:00", "duration": "45 min", "class": "Grade III-A", "subject": "Mathematics", "room": "204", "students": 42, "status": "completed"},
            {"time": "09:00", "duration": "45 min", "class": "Grade IV-B", "subject": "Science", "room": "Lab 02", "students": 38, "status": "ongoing"},
            {"time": "10:15", "duration": "45 min", "class": "Grade V-A", "subject": "Mathematics", "room": "108", "students": 40, "status": "upcoming"},
            {"time": "11:15", "duration": "45 min", "class": "Grade VI-A", "subject": "Chemistry", "room": "Lab 01", "students": 36, "status": "upcoming"},
            {"time": "13:00", "duration": "45 min", "class": "Grade IV-A", "subject": "Mathematics", "room": "204", "students": 41, "status": "upcoming"},
            {"time": "14:00", "duration": "45 min", "class": "Grade III-A", "subject": "Homeroom", "room": "204", "students": 42, "status": "upcoming"},
        ],
        "classes": [
            {"name": "Grade III-A", "subject": "Mathematics", "students": 42, "attendance": 93, "avgMarks": 84},
            {"name": "Grade IV-B", "subject": "Science", "students": 38, "attendance": 90, "avgMarks": 81},
            {"name": "Grade V-A", "subject": "Mathematics", "students": 40, "attendance": 95, "avgMarks": 86},
            {"name": "Grade VI-A", "subject": "Chemistry", "students": 36, "attendance": 92, "avgMarks": 83},
            {"name": "Grade IV-A", "subject": "Mathematics", "students": 41, "attendance": 91, "avgMarks": 85},
        ],
        "pendingAssignments": [
            {"title": "Algebra Worksheet 4", "class": "Grade V-A", "due": "Today", "submitted": "34/40"},
            {"title": "Lab Report: Newton's Laws", "class": "Grade IV-B", "due": "Tomorrow", "submitted": "30/38"},
            {"title": "Periodic Table Quiz", "class": "Grade VI-A", "due": "2 days", "submitted": "28/36"},
            {"title": "Geometry Practice", "class": "Grade IV-A", "due": "3 days", "submitted": "33/41"},
        ],
        "recentActivity": [
            {"action": "Attendance submitted", "detail": "Grade III-A", "time": "09:05 AM"},
            {"action": "Assignment created", "detail": "Algebra Worksheet 4", "time": "08:40 AM"},
            {"action": "Marks published", "detail": "Unit Test II, Grade III-A", "time": "Yesterday"},
            {"action": "Meeting scheduled", "detail": "PTA, Grade IV parents", "time": "Yesterday"},
        ],
        "messages": [
            {"from": "Adaeze Abiodun (parent)", "subject": "Emma's English essay", "time": "08:12 AM"},
            {"from": "Head of Science", "subject": "Lab 02 booked for Friday practicals", "time": "Yesterday"},
            {"from": "School Office", "subject": "Term-end reports due 30 Oct", "time": "2 days ago"},
        ],
    }


@router.get("/api/v1/dashboard/parent")
async def parent_dashboard(request: Request) -> dict:
    person = await _role_person(request, "parent")
    return {
        "profile": {"name": person["name"], "email": person["email"]},
        "children": [
            {
                "id": "child-1",
                "name": "Emma " + person["lastName"],
                "class": "Grade IV-A",
                "institution": person["institutionName"],
                "stats": {
                    "attendance": {"value": 96, "label": "Attendance", "unit": "%"},
                    "gpa": {"value": 3.8, "label": "GPA", "unit": "/4.0"},
                    "homeworkDue": {"value": 1, "label": "Homework due"},
                    "feesDue": {"value": 0, "label": "Fees due", "unit": "$"},
                },
                "subjects": [
                    {"name": "Mathematics", "grade": "A+", "score": 94, "trend": "up"},
                    {"name": "Science", "grade": "A", "score": 91, "trend": "up"},
                    {"name": "English", "grade": "C+", "score": 68, "trend": "down"},
                    {"name": "Social Studies", "grade": "B+", "score": 85, "trend": "flat"},
                    {"name": "Computer Science", "grade": "A", "score": 89, "trend": "up"},
                ],
                "timetable": _TIMETABLE[:5],
                "homework": [
                    {"title": "Algebra Worksheet 4", "subject": "Mathematics", "due": "Tomorrow", "status": "pending"},
                    {"title": "Fractions Practice", "subject": "Mathematics", "due": "Done", "status": "graded", "score": "A+"},
                    {"title": "Plant Life Cycle", "subject": "Science", "due": "Done", "status": "graded", "score": "A"},
                ],
                "fees": {"total": 9000, "paid": 7000, "balance": 2000, "nextDue": "2026-12-25"},
                "achievements": ["Math Olympiad Gold", "Perfect Attendance Oct", "Science Fair 1st"],
            },
            {
                "id": "child-2",
                "name": "Liam " + person["lastName"],
                "class": "Grade VI-B",
                "institution": person["institutionName"],
                "stats": {
                    "attendance": {"value": 91, "label": "Attendance", "unit": "%"},
                    "gpa": {"value": 3.4, "label": "GPA", "unit": "/4.0"},
                    "homeworkDue": {"value": 0, "label": "Homework due"},
                    "feesDue": {"value": 500, "label": "Fees due", "unit": "$"},
                },
                "subjects": [
                    {"name": "Mathematics", "grade": "B+", "score": 82, "trend": "up"},
                    {"name": "Science", "grade": "B", "score": 78, "trend": "flat"},
                    {"name": "English", "grade": "A", "score": 90, "trend": "up"},
                    {"name": "Social Studies", "grade": "B", "score": 76, "trend": "down"},
                    {"name": "Computer Science", "grade": "A", "score": 88, "trend": "up"},
                ],
                "timetable": _TIMETABLE[:5],
                "homework": [
                    {"title": "Essay: My Hero", "subject": "English", "due": "Done", "status": "graded", "score": "A"},
                ],
                "fees": {"total": 9000, "paid": 8500, "balance": 500, "nextDue": "2026-12-25"},
                "achievements": ["Debate Runner-up", "100m Sprint Gold"],
            },
        ],
        "messages": [
            {"from": "Ms. Teresa Susan", "subject": "Great work on algebra test", "time": "2 hours ago"},
            {"from": "School Office", "subject": "Term-end report cards available", "time": "1 day ago"},
            {"from": "PTA Committee", "subject": "Meeting invite: 28 Oct, 4 PM", "time": "2 days ago"},
        ],
        "events": [
            {"title": "Science Term Test", "date": "Fri, 23 Oct", "type": "exam"},
            {"title": "Annual Science Fair", "date": "Mon, 28 Oct", "type": "event"},
            {"title": "PTA Meeting", "date": "Tue, 29 Oct", "type": "meeting"},
        ],
    }


# ---- class roster (role portals) ----

ROSTER_SCOPES = frozenset({"teacher", "student"})


@router.get("/api/v1/roster")
async def roster(request: Request) -> dict:
    """Teachers: their sections and students. Students: their sections and teachers."""
    claims = session_claims(request)
    if claims["scope"] not in ROSTER_SCOPES:
        raise Forbidden("The class roster is available to teachers and students.")
    return await _call(request, "users", "GET", f"/internal/people/{claims['sub']}/classes", claims=claims)


# ---- learning: the tutor streams, so it is relayed here; other portal calls use the proxy below ----

@router.post("/api/v1/student/tutor/messages")
async def student_tutor(request: Request) -> Response:
    """Relay the tutor's server-sent events without buffering, so replies appear as they are written."""
    enforce_csrf(request)
    claims = session_claims(request)
    body = await request.body()
    if len(body) > TUTOR_BODY_LIMIT:
        raise ValidationFailed("That message is too long.")
    client = _registry(request).client("learning")
    upstream = client.build_request(
        "POST", "/student/tutor/messages", content=body,
        headers={**context_headers(claims, request), "content-type": "application/json"},
        timeout=httpx.Timeout(120.0, connect=5.0),
    )
    try:
        response = await client.send(upstream, stream=True)
    except httpx.HTTPError as exc:
        raise AppError("The tutor isn't available right now. Try again in a few minutes.") from exc
    if response.status_code >= 400:
        payload = await response.aread()
        await response.aclose()
        return Response(content=payload, status_code=response.status_code, media_type="application/json")

    async def relay():  # noqa: ANN202
        try:
            async for chunk in response.aiter_raw():
                yield chunk
        except httpx.HTTPError:
            # The learning service went away mid-answer: say so instead of ending as if the reply were complete.
            yield (b'data: {"type": "error", "code": "TUTOR_UNAVAILABLE", '
                   b'"message": "The tutor stopped answering. Try asking again."}\n\n')

    return StreamingResponse(relay(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"},
                             background=BackgroundTask(response.aclose))


# ---- sign-in sessions (Platform Owner) ----

SESSION_EVENTS_LIMIT = 100


async def _people_and_institutions(request: Request, claims: dict, person_ids: list[str]) -> dict[str, dict]:
    """Name and institution for each person, for labelling sessions. Missing people are omitted."""
    if not person_ids:
        return {}
    registry, headers = _registry(request), context_headers(claims, request)
    people_resp = await registry.client("users").post(
        "/internal/people/batch", json={"ids": person_ids}, headers=headers
    )
    people = {p["id"]: p for p in people_resp.json().get("items", [])} if people_resp.status_code < 400 else {}
    inst_ids = sorted({p["institutionId"] for p in people.values() if p.get("institutionId")})
    names: dict[str, str] = {}
    if inst_ids:
        inst_resp = await registry.client("tenancy").post(
            "/internal/institutions/batch", json={"ids": inst_ids}, headers=headers
        )
        if inst_resp.status_code < 400:
            names = {i["id"]: i["name"] for i in inst_resp.json().get("items", [])}
    return {
        pid: {"name": p["name"], "institutionName": names.get(p.get("institutionId") or "")}
        for pid, p in people.items()
    }


def _label_session(raw: dict, people: dict[str, dict]) -> dict:
    person = people.get(raw["personId"], {})
    return {**raw, "name": person.get("name"), "institutionName": person.get("institutionName")}


@router.get("/api/v1/sessions")
async def sessions_page(request: Request) -> dict:
    claims = session_claims(request)
    data = await _call(request, "identity", "GET", "/sessions", claims=claims)
    people = await _people_and_institutions(request, claims, sorted({s["personId"] for s in data["items"]}))
    return {"items": [_label_session(s, people) for s in data["items"]]}


@router.get("/api/v1/sessions/{session_id}")
async def session_detail(request: Request, session_id: uuid.UUID) -> dict:
    claims = session_claims(request)
    detail = await _call(request, "identity", "GET", f"/sessions/{session_id}", claims=claims)
    people = await _people_and_institutions(request, claims, [detail["personId"]])
    events_resp = await _registry(request).client("audit").get(
        "/activity",
        params={"sessionId": str(session_id), "limit": SESSION_EVENTS_LIMIT},
        headers=context_headers(claims, request),
    )
    events = events_resp.json().get("items", []) if events_resp.status_code < 400 else []
    return {**_label_session(detail, people), "events": events}


@router.post("/api/v1/sessions/{session_id}/revoke")
async def session_revoke(request: Request, session_id: uuid.UUID) -> dict:
    enforce_csrf(request)
    claims = session_claims(request)
    return await _call(request, "identity", "POST", f"/sessions/{session_id}/revoke", claims=claims)


# ---- public calendar feed (no session: the unguessable token is the credential) ----

@router.get("/api/v1/calendar-feed/{token}.ics", include_in_schema=False)
async def calendar_feed(request: Request, token: str) -> Response:
    client = _registry(request).client("learning")
    try:
        response = await client.request("GET", f"/public/calendar/{token}.ics")
    except httpx.HTTPError as exc:
        raise AppError("The calendar is unavailable. Your calendar app will retry.") from exc
    return Response(status_code=response.status_code, content=response.content,
                    media_type=response.headers.get("content-type"))


# ---- transparent proxy (last) ----

async def _read_capped(request: Request, limit: int) -> bytes:
    """Buffer a request body up to `limit` bytes; anything larger is refused before it fills memory."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise PayloadTooLarge()
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise PayloadTooLarge()
        chunks.append(chunk)
    return b"".join(chunks)


@router.api_route(
    "/api/v1/{path:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"], include_in_schema=False
)
async def proxy(request: Request, path: str) -> Response:
    enforce_csrf(request)
    claims = session_claims(request)
    if FORBIDDEN_PROXY_SEGMENTS.intersection(path.split("/")):
        raise NotFound("Unknown API route.")
    target: tuple[str, str] | None = None
    for prefix, service in ROUTE_MAP:
        if path == prefix or path.startswith(prefix + "/"):
            target = (service, prefix)
            break
    if target is None or path in BFF_PATHS:
        raise NotFound("Unknown API route.")
    service, _ = target
    client = _registry(request).client(service)
    body = await _read_capped(request, PROXY_BODY_LIMIT)
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
    passthrough = {k: v for k, v in response.headers.items() if k.lower() in PROXY_RESPONSE_HEADERS}
    return Response(
        status_code=response.status_code,
        content=response.content,
        media_type=response.headers.get("content-type"),
        headers=passthrough,
    )
