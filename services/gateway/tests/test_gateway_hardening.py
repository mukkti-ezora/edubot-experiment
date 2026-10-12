"""Gateway edge hardening: non-platform sessions stay out of platform data and internal APIs."""

import uuid

import pytest

from services.gateway.tests.conftest import OWNER_PERSON_ID, login
from services.gateway.tests.test_role_dashboards import PASSWORD, _add_role_account

TRAVERSAL_PATHS = [
    f"/api/v1/users/%2e%2e/internal/people/{OWNER_PERSON_ID}",
    "/api/v1/activity/%2e%2e/internal/events/recent",
    "/api/v1/roles/%2E%2E/internal/actors/x/roles",
    "/api/v1/users/%2e%2e%2finternal/people/x",
    "/api/v1/users/./internal/people/x",
    "/api/v1/users/internal/people/x",
    "/api/v1/users/x/%2e%2e",
    "/api/v1/users/%252e%252e/internal/people/x",
]

ADMIN_BFF_PATHS = [
    f"/api/v1/institutions/{uuid.UUID(int=1)}/overview",
    "/api/v1/administrators",
    f"/api/v1/administrators/{OWNER_PERSON_ID}",
]


async def _login_student(stack, client, seeded) -> None:
    await _add_role_account(stack, seeded["ashford"], "student", "ada.student@ashf.example.edu")
    await login(client, "ada.student@ashf.example.edu", PASSWORD)


@pytest.mark.asyncio
async def test_summary_rejects_role_sessions(stack, client, seeded):
    await _login_student(stack, client, seeded)

    response = await client.get("/api/v1/dashboard/summary")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_summary_still_serves_platform_admins(client, seeded):
    await login(client)

    response = await client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("path", TRAVERSAL_PATHS)
async def test_proxy_refuses_paths_into_internal_apis_for_students(stack, client, seeded, path):
    await _login_student(stack, client, seeded)

    response = await client.get(path)

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("path", TRAVERSAL_PATHS)
async def test_proxy_refuses_paths_into_internal_apis_for_admins(client, seeded, path):
    await login(client)

    response = await client.get(path)

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_proxy_refuses_internal_writes(stack, client, seeded):
    await _login_student(stack, client, seeded)

    response = await client.post(
        "/api/v1/activity/%2e%2e/internal/events",
        json={"action": "forged", "actorId": str(uuid.uuid4())},
        headers={"X-Requested-With": "fetch"},
    )

    assert response.status_code == 404, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ADMIN_BFF_PATHS)
async def test_admin_bffs_reject_role_sessions(stack, client, seeded, path):
    await _login_student(stack, client, seeded)

    response = await client.get(path)

    assert response.status_code == 403, response.text
