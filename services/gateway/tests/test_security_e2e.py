"""The eight security invariants from the brief, executed through the real stack path."""

import uuid

import jwt as pyjwt
import pytest

from services.gateway.tests.conftest import (
    OWNER_EMAIL,
    audit_rows,
    authz_headers,
    login,
)
from services.shared.settings import BaseServiceSettings


@pytest.mark.asyncio
async def test_full_login_flow_and_registry_read(stack, client, seeded):
    await login(client)
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["admin"]["email"] == OWNER_EMAIL
    assert "institution.create" in me.json()["permissions"]

    users = await client.get("/api/v1/users?limit=100")
    assert users.status_code == 200
    names = [u["name"] for u in users.json()["items"]]
    assert names.count("Priya Nair") == 2  # isolation fixture

    events = await audit_rows(stack)
    assert ("auth.sign_in", "success", OWNER_EMAIL) in events


@pytest.mark.asyncio
async def test_unauthenticated_requests_are_rejected(client, seeded):
    response = await client.get("/api/v1/users")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_mutation_requires_csrf_header(client, seeded):
    await login(client)
    payload = {"name": "Forge College", "code": "FORG", "type": "College"}
    missing = await client.post("/api/v1/institutions", json=payload)
    assert missing.status_code == 403
    ok = await client.post(
        "/api/v1/institutions", json=payload, headers={"X-Requested-With": "fetch"}
    )
    assert ok.status_code == 201, ok.text


@pytest.mark.asyncio
async def test_support_admin_denied_institution_create_and_denial_is_audited(stack, client, seeded):
    await login(client, "t.lindqvist@edubot.example.edu", "Support 1234!")
    denied = await client.post(
        "/api/v1/institutions",
        json={"name": "Denied College", "code": "DENY", "type": "College"},
        headers=authz_headers(client),
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "FORBIDDEN"
    events = await audit_rows(stack)
    denied_events = [e for e in events if e[1] == "denied" and e[0] == "institution.create"]
    assert denied_events, "expected a denied audit event for institution.create"


@pytest.mark.asyncio
async def test_deactivated_admin_cannot_authenticate(client, seeded):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "c.meyer@edubot.example.edu", "password": "Gone 1234!"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "ACCOUNT_DISABLED"


@pytest.mark.asyncio
async def test_platform_admin_can_read_across_institutions_but_institution_actor_cannot(client, seeded):
    await login(client)
    all_users = await client.get("/api/v1/users?limit=100")
    assert all_users.status_code == 200
    institutions_seen = {u["institutionId"] for u in all_users.json()["items"] if u["institutionId"]}
    assert len(institutions_seen) == 2

    # Forged institution-scoped token (tests the policy layer, not identity issuance)
    settings = BaseServiceSettings()
    forged = pyjwt.encode(
        {
            "iss": "edubot",
            "sub": str(uuid.uuid4()),
            "email": "manager@ashf.example.edu",
            "scope": "institution",
            "inst": seeded["ashford"] and str(seeded["ashford"]),
            "perms": ["user.read"],
            "exp": 9999999999,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    client.cookies.set("edubot_access", forged, path="/")
    response = await client.get("/api/v1/users")
    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_VIOLATION"


@pytest.mark.asyncio
async def test_refresh_rotation_through_cookies(client, seeded):
    await login(client)
    before = client.cookies.get("edubot_refresh")
    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    after = client.cookies.get("edubot_refresh")
    assert after and after != before

    # The rotated-away token presented again = replay → family revoked → refresh now fails.
    client.cookies.set("edubot_refresh", before, path="/api/v1/auth")
    replay = await client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401
    other = await client.post("/api/v1/auth/refresh")
    assert other.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_is_derived_from_data(client, seeded):
    await login(client)
    summary = await client.get("/api/v1/dashboard/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["institutions"]["total"] == 2
    assert body["institutions"]["byStatus"] == {"active": 1, "suspended": 1}
    assert body["users"]["total"] == 6
    assert body["users"]["byType"]["student"] == 2
    assert body["users"]["byType"]["administrator"] == 3
    assert any(
        e["action"] == "auth.sign_in" and e["actorLabel"] == OWNER_EMAIL
        for e in body["recentActivity"]
    )


@pytest.mark.asyncio
async def test_institution_overview_composition(client, seeded):
    await login(client)
    overview = await client.get(f"/api/v1/institutions/{seeded['ashford']}/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert body["institution"]["code"] == "ASHF"
    assert body["stats"]["users"] == 1
    assert body["stats"]["students"] == 1


@pytest.mark.asyncio
async def test_administrators_page_is_composed_with_roles_and_last_login(client, seeded):
    await login(client)
    page = await client.get("/api/v1/administrators")
    assert page.status_code == 200
    owner = next(a for a in page.json()["items"] if a["email"] == OWNER_EMAIL)
    assert owner["roles"] and owner["roles"][0]["name"] == "Platform Owner"
    assert owner["lastLoginAt"] is not None
