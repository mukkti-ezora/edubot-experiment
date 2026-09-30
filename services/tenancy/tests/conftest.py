import os
import uuid

import pytest

os.environ["TENANCY_DATABASE_URL"] = (
    "postgresql+asyncpg://edubot:edubot@localhost:5433/tenancy_test"
)

import httpx  # noqa: E402

from services.shared.db import make_sessionmaker  # noqa: E402
from services.tenancy import db  # noqa: E402
from services.tenancy.config import get_settings  # noqa: E402
from services.tenancy.models import Institution  # noqa: E402

get_settings.cache_clear()
from services.tenancy.main import create_app  # noqa: E402

INTERNAL = get_settings().internal_token

ALL_PERMS = [
    "institution.read",
    "institution.create",
    "institution.update",
    "institution.suspend",
    "settings.read",
    "settings.update",
]


def admin_headers(*, permissions: list[str] | None = None, actor: str | None = None) -> dict:
    headers = {"X-Edubot-Internal-Token": INTERNAL}
    if actor is not None:
        headers["X-Edubot-Actor-Id"] = actor
        headers["X-Edubot-Actor-Email"] = "sysadmin@edubot.example.edu"
        headers["X-Edubot-Scope"] = "platform"
        headers["X-Edubot-Permissions"] = ",".join(permissions or [])
    return headers


class StubAudit:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, ctx, event) -> None:  # noqa: ANN001, ANN202
        self.events.append(
            {
                "action": event.action,
                "result": event.result,
                "target_id": event.target_id,
                "diff": event.diff,
            }
        )


@pytest.fixture
async def app_client():
    db.bind_from_settings()
    app = create_app()
    audit = StubAudit()
    app.state.audit = audit
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://tenancy") as client:
        yield client, audit


@pytest.fixture(autouse=True)
async def clean_db():
    db.bind_from_settings()
    await db.reset_schema()
    yield


async def make_institution(**overrides) -> Institution:
    defaults = {
        "id": uuid.uuid4(),
        "code": f"C{uuid.uuid4().hex[:4].upper()}",
        "name": "Test College " + uuid.uuid4().hex[:6],
        "type": "College",
        "status": "active",
        "city": "Duluth",
        "region": "MN",
        "country": "United States",
        "contact_name": "R. Halloran",
        "contact_email": "registrar@example.edu",
    }
    defaults.update(overrides)
    sessions = make_sessionmaker(db.get_engine())
    async with sessions() as session:
        row = Institution(**defaults)
        session.add(row)
        await session.commit()
        return row
