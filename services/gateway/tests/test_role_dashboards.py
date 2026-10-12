"""Role dashboards (student / teacher / parent): scope gating and institution resolution."""

import logging
import uuid

import httpx
import pytest

from services.gateway.tests.conftest import login
from services.identity.models import AuthAccount
from services.identity.security import hash_password
from services.users.models import User

PASSWORD = "Role demo 1234!"
ROLES = ("student", "teacher", "parent")
ASHFORD_NAME = "Ashford Institute of Technology"


async def _add_role_account(
    stack, institution_id: uuid.UUID | None, scope: str, email: str, user_type: str | None = None
) -> None:
    person_id = uuid.uuid4()
    async with stack.session("users") as s:
        s.add(
            User(
                id=person_id, institution_id=institution_id, type=user_type or scope,
                first_name="Ada", last_name="Okafor", email=email, status="active",
            )
        )
        await s.commit()
    async with stack.session("identity") as s:
        s.add(
            AuthAccount(
                email=email, password_hash=hash_password(PASSWORD),
                person_id=person_id, scope=scope, status="active",
            )
        )
        await s.commit()


async def _login_as(stack, client, seeded, role: str) -> None:
    email = f"ada.{role}@ashf.example.edu"
    await _add_role_account(stack, seeded["ashford"], role, email)
    await login(client, email, PASSWORD)


def _break_service(stack, service: str) -> None:
    """Make every gateway call to `service` answer 503, as during an outage."""
    outage = httpx.MockTransport(lambda _request: httpx.Response(503, json={"message": "down"}))
    stack.gateway.state.registry._clients[service] = httpx.AsyncClient(
        base_url=f"http://{service}", transport=outage
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["student", "teacher"])
async def test_profile_shows_institution_name(stack, client, seeded, role):
    await _login_as(stack, client, seeded, role)

    response = await client.get(f"/api/v1/dashboard/{role}")

    assert response.status_code == 200, response.text
    assert response.json()["profile"]["institution"] == ASHFORD_NAME


@pytest.mark.asyncio
async def test_parent_children_carry_institution_and_surname(stack, client, seeded):
    await _login_as(stack, client, seeded, "parent")

    children = (await client.get("/api/v1/dashboard/parent")).json()["children"]

    assert len(children) == 2
    assert {c["institution"] for c in children} == {ASHFORD_NAME}
    assert all(c["name"].endswith(" Okafor") for c in children)


@pytest.mark.asyncio
async def test_person_without_institution_gets_fallback_label(stack, client, seeded):
    await _add_role_account(stack, None, "student", "ada.orphan@example.edu")
    await login(client, "ada.orphan@example.edu", PASSWORD)

    response = await client.get("/api/v1/dashboard/student")

    assert response.status_code == 200, response.text
    assert response.json()["profile"]["institution"] == "Unassigned institution"


@pytest.mark.asyncio
async def test_tenancy_outage_degrades_and_is_logged(stack, client, seeded, caplog):
    await _login_as(stack, client, seeded, "student")
    _break_service(stack, "tenancy")

    with caplog.at_level(logging.WARNING, logger="services.gateway.api"):
        response = await client.get("/api/v1/dashboard/student")

    assert response.status_code == 200, response.text
    assert response.json()["profile"]["institution"] == "Institution unavailable"
    assert any("institution name lookup failed" in r.message for r in caplog.records)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("caller", "dashboard"),
    [(c, d) for c in ROLES for d in ROLES if c != d],
)
async def test_dashboard_rejects_other_role(stack, client, seeded, caller, dashboard):
    await _login_as(stack, client, seeded, caller)

    response = await client.get(f"/api/v1/dashboard/{dashboard}")

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
@pytest.mark.parametrize("dashboard", ROLES)
async def test_platform_admin_cannot_read_role_dashboards(client, seeded, dashboard):
    await login(client)

    response = await client.get(f"/api/v1/dashboard/{dashboard}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_role_dashboard_requires_session(client, seeded):
    response = await client.get("/api/v1/dashboard/student")

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_me_returns_role_dashboard_permission(stack, client, seeded, role):
    await _login_as(stack, client, seeded, role)

    me = await client.get("/api/v1/auth/me")

    assert me.status_code == 200, me.text
    assert me.json()["permissions"] == [f"{role}.dashboard.read"]
    assert me.json()["scope"] == role


@pytest.mark.asyncio
async def test_me_rejects_unknown_scope(stack, client, seeded):
    await _add_role_account(stack, seeded["ashford"], "staff", "ada.staff@ashf.example.edu", "teacher")
    await login(client, "ada.staff@ashf.example.edu", PASSWORD)

    me = await client.get("/api/v1/auth/me")

    assert me.status_code == 403
    assert me.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_me_fails_loudly_when_rbac_is_down_for_platform_admin(stack, client, seeded):
    await login(client)
    _break_service(stack, "rbac")

    me = await client.get("/api/v1/auth/me")

    assert me.status_code >= 500


@pytest.mark.asyncio
async def test_teacher_dashboard_includes_messages(stack, client, seeded):
    await _login_as(stack, client, seeded, "teacher")

    body = (await client.get("/api/v1/dashboard/teacher")).json()

    assert body["messages"], "teacher portal needs messages for its Messages page"
    assert {"from", "subject", "time"} <= set(body["messages"][0])
