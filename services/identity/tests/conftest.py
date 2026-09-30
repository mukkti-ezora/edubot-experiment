import os
import uuid

import pytest

# Test database BEFORE any service import (see ADR-0010).
os.environ["IDENTITY_DATABASE_URL"] = (
    "postgresql+asyncpg://edubot:edubot@localhost:5433/identity_test"
)
os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = "5"

import httpx  # noqa: E402

from services.identity import db  # noqa: E402
from services.identity.config import get_settings  # noqa: E402
from services.identity.models import AuthAccount  # noqa: E402
from services.identity.security import hash_password  # noqa: E402

get_settings.cache_clear()

from services.identity.main import create_app  # noqa: E402

INTERNAL = get_settings().internal_token


class StubAudit:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, ctx, event) -> None:  # noqa: ANN001, ANN202
        self.events.append(
            {
                "action": event.action,
                "result": event.result,
                "target_label": event.target_label,
                "diff": event.diff,
            }
        )


class StubRbac:
    def __init__(self, permissions: list[str] | None = None) -> None:
        self.permissions = permissions or []

    async def get(self, path: str, **kwargs):  # noqa: ANN001, ANN003, ANN202
        return {"permissions": self.permissions}


@pytest.fixture
async def app_client():
    db.bind_from_settings()
    app = create_app()
    audit = StubAudit()
    app.state.audit = audit
    app.state.rbac = StubRbac(["dashboard.read", "institution.read"])
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://identity",
        headers={"X-Edubot-Internal-Token": INTERNAL},
    ) as client:
        yield client, audit, app


@pytest.fixture(autouse=True)
async def clean_db():
    from services.identity.ratelimit import login_limiter

    login_limiter.reset()
    db.bind_from_settings()
    await db.reset_schema()
    yield


async def seed_account(email: str, password: str, status: str = "active") -> AuthAccount:
    engine = db.get_engine()
    from services.shared.db import make_sessionmaker

    sessions = make_sessionmaker(engine)
    async with sessions() as session:
        account = AuthAccount(
            email=email,
            password_hash=hash_password(password),
            person_id=uuid.uuid4(),
            scope="platform",
            status=status,
        )
        session.add(account)
        await session.commit()
        return account
