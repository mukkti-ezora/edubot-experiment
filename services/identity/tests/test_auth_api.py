import uuid

import pytest

from services.identity.tests.conftest import seed_account


@pytest.mark.asyncio
async def test_login_success_returns_token_pair(app_client):
    client, audit, _ = app_client
    await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    response = await client.post(
        "/auth/login", json={"email": "owner@edubot.example.edu", "password": "Correct horse 99!"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"]
    assert body["refreshToken"]
    assert body["scope"] == "platform"
    assert body["accessExpiresIn"] == 900
    assert any(e["action"] == "auth.sign_in" for e in audit.events)


@pytest.mark.asyncio
async def test_login_wrong_password_is_non_committal_and_audited(app_client):
    client, audit, _ = app_client
    await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    response = await client.post(
        "/auth/login", json={"email": "owner@edubot.example.edu", "password": "wrong"}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"
    assert response.json()["message"] == "Invalid email or password."
    failed = [e for e in audit.events if e["action"] == "auth.sign_in_failed"]
    assert failed and failed[0]["diff"] == {"reason": "invalid_credentials"}


@pytest.mark.asyncio
async def test_login_unknown_email_matches_wrong_password_message(app_client):
    client, _, _ = app_client
    response = await client.post(
        "/auth/login", json={"email": "ghost@edubot.example.edu", "password": "whatever"}
    )
    assert response.status_code == 401
    assert response.json()["message"] == "Invalid email or password."


@pytest.mark.asyncio
async def test_disabled_account_cannot_authenticate(app_client):
    client, audit, _ = app_client
    await seed_account("off@edubot.example.edu", "Whatever 123!", status="disabled")
    response = await client.post(
        "/auth/login", json={"email": "off@edubot.example.edu", "password": "Whatever 123!"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "ACCOUNT_DISABLED"
    assert any(
        e["action"] == "auth.sign_in_failed" and e["diff"]["reason"] == "account_disabled"
        for e in audit.events
    )


@pytest.mark.asyncio
async def test_refresh_rotates_and_old_token_is_rejected(app_client):
    client, _, _ = app_client
    await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    login = await client.post(
        "/auth/login", json={"email": "owner@edubot.example.edu", "password": "Correct horse 99!"}
    )
    refresh = login.json()["refreshToken"]

    refreshed = await client.post("/auth/refresh", json={"refreshToken": refresh})
    assert refreshed.status_code == 200
    new_refresh = refreshed.json()["refreshToken"]
    assert new_refresh != refresh

    replay = await client.post("/auth/refresh", json={"refreshToken": refresh})
    assert replay.status_code == 401

    # Reuse detection revoked the whole family, including the rotated token.
    after_reuse = await client.post("/auth/refresh", json={"refreshToken": new_refresh})
    assert after_reuse.status_code == 401


@pytest.mark.asyncio
async def test_disabled_account_cannot_refresh(app_client):
    client, _, app = app_client
    account = await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    login = await client.post(
        "/auth/login", json={"email": "owner@edubot.example.edu", "password": "Correct horse 99!"}
    )
    refresh = login.json()["refreshToken"]

    disable = await client.post(
        f"/internal/accounts/by-person/{account.person_id}/status", json={"status": "disabled"}
    )
    assert disable.status_code == 200

    # Disabling an account revokes its sessions immediately: refresh is rejected at once,
    # before the 15-minute access-token TTL would have lapsed.
    response = await client.post("/auth/refresh", json={"refreshToken": refresh})
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_rate_limit_after_five_attempts(app_client):
    client, audit, _ = app_client
    await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    payload = {"email": "owner@edubot.example.edu", "password": "wrong"}
    for _ in range(5):
        await client.post("/auth/login", json=payload)
    limited = await client.post("/auth/login", json=payload)
    assert limited.status_code == 429
    assert limited.json()["code"] == "RATE_LIMITED"
    assert any(e["action"] == "auth.sign_in_rate_limited" for e in audit.events)


@pytest.mark.asyncio
async def test_internal_api_requires_internal_token(app_client):
    client, _, _ = app_client
    response = await client.post(
        "/auth/login",
        json={"email": "x@y.example.edu", "password": "z"},
        headers={"X-Edubot-Internal-Token": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_account_conflict_on_duplicate_email(app_client):
    client, _, _ = app_client
    person = uuid.uuid4()
    first = await client.post(
        "/internal/accounts", json={"personId": str(person), "email": "dup@edubot.example.edu"}
    )
    assert first.status_code == 200
    assert first.json()["inviteToken"]
    second = await client.post(
        "/internal/accounts", json={"personId": str(uuid.uuid4()), "email": "DUP@edubot.example.edu"}
    )
    assert second.status_code == 409
    assert second.json()["code"] == "CONFLICT"
