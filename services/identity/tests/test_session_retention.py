"""Sign-in session records are kept for 60 days after they end or go idle, then rotated out."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from services.identity import db
from services.identity.models import AuthSession, RefreshToken
from services.identity.tests.conftest import seed_account
from services.shared.db import make_sessionmaker


async def _session_aged(account, *, days_since_seen: int, ended: bool) -> None:
    seen = datetime.now(UTC) - timedelta(days=days_since_seen)
    async with make_sessionmaker(db.get_engine())() as s:
        row = AuthSession(
            account_id=account.id, person_id=account.person_id, email=account.email, scope="platform",
            started_at=seen, last_seen_at=seen, ended_at=seen if ended else None,
            end_reason="signed_out" if ended else None,
        )
        s.add(row)
        await s.flush()
        s.add(RefreshToken(account_id=account.id, session_id=row.id, token_hash=f"h-{row.id}",
                           expires_at=seen + timedelta(days=7), revoked_at=seen if ended else None))
        await s.commit()


async def _counts() -> tuple[int, int]:
    async with make_sessionmaker(db.get_engine())() as s:
        sessions = (await s.execute(select(func.count()).select_from(AuthSession))).scalar_one()
        tokens = (await s.execute(select(func.count()).select_from(RefreshToken))).scalar_one()
    return sessions, tokens


@pytest.mark.asyncio
async def test_purge_rotates_out_sessions_older_than_retention(app_client):
    client, _, _ = app_client
    account = await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    await _session_aged(account, days_since_seen=61, ended=True)   # ended long ago: purge
    await _session_aged(account, days_since_seen=75, ended=False)  # idle long ago: purge
    await _session_aged(account, days_since_seen=59, ended=True)   # inside the window: keep
    await _session_aged(account, days_since_seen=0, ended=False)   # live: keep

    response = await client.post("/internal/maintenance/purge-sessions")

    assert response.status_code == 200, response.text
    assert response.json() == {"purged": 2, "retentionDays": 60}
    assert await _counts() == (2, 2), "purged sessions take their refresh tokens with them"


@pytest.mark.asyncio
async def test_purge_is_a_no_op_when_nothing_is_old(app_client):
    client, _, _ = app_client
    account = await seed_account("owner@edubot.example.edu", "Correct horse 99!")
    await _session_aged(account, days_since_seen=1, ended=True)

    response = await client.post("/internal/maintenance/purge-sessions")

    assert response.json()["purged"] == 0
