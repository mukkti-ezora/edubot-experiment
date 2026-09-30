import os

import pytest

os.environ["AUDIT_DATABASE_URL"] = (
    "postgresql+asyncpg://edubot:edubot@localhost:5433/audit_test"
)

import httpx  # noqa: E402

from services.audit import db  # noqa: E402
from services.audit.config import get_settings  # noqa: E402

get_settings.cache_clear()
from services.audit.main import create_app  # noqa: E402

INTERNAL = get_settings().internal_token


def admin_headers(*, permissions: list[str] | None = None, actor: str | None = None) -> dict:
    headers = {"X-Edubot-Internal-Token": INTERNAL}
    if actor is not None:
        headers["X-Edubot-Actor-Id"] = actor
        headers["X-Edubot-Actor-Email"] = "admin@edubot.example.edu"
        headers["X-Edubot-Scope"] = "platform"
        headers["X-Edubot-Permissions"] = ",".join(permissions or [])
    return headers


@pytest.fixture
async def app_client():
    db.bind_from_settings()
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://audit") as client:
        yield client


@pytest.fixture(autouse=True)
async def clean_db():
    db.bind_from_settings()
    await db.reset_schema()
    yield
