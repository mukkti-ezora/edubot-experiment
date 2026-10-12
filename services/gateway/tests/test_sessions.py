"""Login sessions: one stable id per sign-in, for every role, visible to the Platform Owner only."""

import httpx
import jwt as pyjwt
import pytest

from services.gateway.tests.conftest import OWNER_EMAIL, login
from services.gateway.tests.test_role_dashboards import PASSWORD, _add_role_account

FETCH = {"X-Requested-With": "fetch"}


def _sid(client: httpx.AsyncClient) -> str:
    token = client.cookies.get("edubot_access") or next(
        v for k, v in client.cookies.items() if "access" in k
    )
    return pyjwt.decode(token, options={"verify_signature": False})["sid"]


async def _student_client(stack, seeded):
    await _add_role_account(stack, seeded["ashford"], "student", "ada.student@ashf.example.edu")
    transport = httpx.ASGITransport(app=stack.gateway)
    student = httpx.AsyncClient(transport=transport, base_url="http://gateway")
    await login(student, "ada.student@ashf.example.edu", PASSWORD)
    return student


@pytest.mark.asyncio
async def test_sign_in_issues_a_session_id(client, seeded):
    await login(client)

    assert _sid(client)


@pytest.mark.asyncio
async def test_session_id_survives_refresh(client, seeded):
    await login(client)
    before = _sid(client)

    refreshed = await client.post("/api/v1/auth/refresh", headers=FETCH)

    assert refreshed.status_code == 200, refreshed.text
    assert _sid(client) == before


@pytest.mark.asyncio
async def test_platform_owner_sees_sessions_for_every_role(stack, client, seeded):
    student = await _student_client(stack, seeded)
    await login(client)

    page = (await client.get("/api/v1/sessions?limit=50")).json()

    roles = {s["role"] for s in page["items"]}
    assert {"student", "platform"} <= roles
    mine = next(s for s in page["items"] if s["email"] == "ada.student@ashf.example.edu")
    assert mine["status"] == "active"
    assert mine["institutionName"] == "Ashford Institute of Technology"
    await student.aclose()


@pytest.mark.asyncio
async def test_session_detail_lists_the_actions_taken_in_it(client, seeded):
    await login(client)
    sid = _sid(client)

    detail = await client.get(f"/api/v1/sessions/{sid}")

    assert detail.status_code == 200, detail.text
    actions = [e["action"] for e in detail.json()["events"]]
    assert "auth.sign_in" in actions


@pytest.mark.asyncio
async def test_sign_out_ends_only_that_session(stack, seeded):
    transport = httpx.ASGITransport(app=stack.gateway)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway") as phone, \
            httpx.AsyncClient(transport=transport, base_url="http://gateway") as laptop:
        await login(phone)
        await login(laptop)
        phone_sid = _sid(phone)

        await phone.post("/api/v1/auth/logout", headers=FETCH)

        sessions = {s["id"]: s for s in (await laptop.get("/api/v1/sessions?limit=50")).json()["items"]}
        assert sessions[phone_sid]["status"] == "ended"
        assert sessions[phone_sid]["endReason"] == "signed_out"
        assert sessions[_sid(laptop)]["status"] == "active"


@pytest.mark.asyncio
async def test_revoked_session_cannot_refresh(stack, client, seeded):
    student = await _student_client(stack, seeded)
    await login(client)

    revoked = await client.post(f"/api/v1/sessions/{_sid(student)}/revoke", headers=FETCH)
    assert revoked.status_code == 200, revoked.text

    again = await student.post("/api/v1/auth/refresh", headers=FETCH)
    assert again.status_code == 401
    await student.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("who", ["support", "student"])
async def test_sessions_are_platform_owner_only(stack, client, seeded, who):
    if who == "support":
        await login(client, "t.lindqvist@edubot.example.edu", "Support 1234!")
        other = client
    else:
        other = await _student_client(stack, seeded)

    response = await other.get("/api/v1/sessions")

    assert response.status_code == 403
    if other is not client:
        await other.aclose()


@pytest.mark.asyncio
async def test_owner_email_is_on_its_own_session(client, seeded):
    await login(client)

    items = (await client.get("/api/v1/sessions?limit=50")).json()["items"]

    assert any(s["email"] == OWNER_EMAIL and s["id"] == _sid(client) for s in items)


@pytest.mark.asyncio
async def test_session_records_the_users_browser_not_the_gateway(stack, seeded):
    browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
    transport = httpx.ASGITransport(app=stack.gateway)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway", headers={"user-agent": browser}) as c:
        await login(c)

        mine = (await c.get(f"/api/v1/sessions/{_sid(c)}")).json()

    assert mine["userAgent"] == browser
    sign_in = next(e for e in mine["events"] if e["action"] == "auth.sign_in")
    assert sign_in["userAgent"] == browser


@pytest.mark.asyncio
async def test_stale_tab_after_revoke_does_not_end_the_other_sessions(stack, client, seeded):
    student = await _student_client(stack, seeded)
    transport = httpx.ASGITransport(app=stack.gateway)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway") as laptop:
        await login(laptop, "ada.student@ashf.example.edu", PASSWORD)
        await login(client)
        await client.post(f"/api/v1/sessions/{_sid(student)}/revoke", headers=FETCH)

        stale = await student.post("/api/v1/auth/refresh", headers=FETCH)
        still_signed_in = await laptop.post("/api/v1/auth/refresh", headers=FETCH)

    assert stale.status_code == 401
    assert still_signed_in.status_code == 200, still_signed_in.text
    sessions = {s["id"]: s for s in (await client.get("/api/v1/sessions?limit=50")).json()["items"]}
    assert sessions[_sid(student)]["endReason"] == "revoked"
    await student.aclose()


@pytest.mark.asyncio
async def test_client_cannot_choose_its_recorded_address(stack, seeded):
    transport = httpx.ASGITransport(app=stack.gateway, client=("203.0.113.9", 4000))
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway",
                                 headers={"x-forwarded-for": "198.51.100.77"}) as c:
        await login(c)

        mine = (await c.get(f"/api/v1/sessions/{_sid(c)}")).json()

    assert mine["ip"] == "203.0.113.9"
