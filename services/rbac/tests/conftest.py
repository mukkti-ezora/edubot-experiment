import os

import pytest

os.environ["RBAC_DATABASE_URL"] = (
    "postgresql+asyncpg://edubot:edubot@localhost:5433/rbac_test"
)

import httpx  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from services.rbac import db  # noqa: E402
from services.rbac.config import get_settings  # noqa: E402
from services.rbac.models import Permission, Role, RolePermission  # noqa: E402

get_settings.cache_clear()
from services.rbac.main import create_app  # noqa: E402
from services.rbac.seed_data import PERMISSIONS, ROLE_DESCRIPTIONS, SYSTEM_ROLES  # noqa: E402

INTERNAL = get_settings().internal_token


def admin_headers(*, permissions: list[str] | None = None, actor: str | None = None) -> dict:
    headers = {"X-Edubot-Internal-Token": INTERNAL}
    if actor is not None:
        headers["X-Edubot-Actor-Id"] = actor
        headers["X-Edubot-Actor-Email"] = "sysadmin@edubot.example.edu"
        headers["X-Edubot-Scope"] = "platform"
        headers["X-Edubot-Permissions"] = ",".join(permissions or [])
    return headers


ALL_PERMS = [k for k, _, _ in PERMISSIONS]


class StubAudit:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, ctx, event) -> None:  # noqa: ANN001, ANN202
        self.events.append({"action": event.action, "result": event.result, "diff": event.diff})


class StubUsers:
    async def post(self, path: str, **kwargs):  # noqa: ANN001, ANN003, ANN202
        ids = kwargs.get("json", {}).get("ids", [])
        return {
            "items": [
                {"id": i, "name": f"Person {i[:4]}", "email": f"p{i[:4]}@x.example.edu", "status": "active"}
                for i in ids
            ]
        }


@pytest.fixture
async def app_client():
    db.bind_from_settings()
    app = create_app()
    audit = StubAudit()
    app.state.audit = audit
    app.state.users = StubUsers()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://rbac") as client:
        yield client, audit


@pytest.fixture(autouse=True)
async def clean_db():
    db.bind_from_settings()
    await db.reset_schema()
    yield


async def seed_catalog(session: AsyncSession) -> dict[str, Permission]:
    perms = {}
    for key, domain, description in PERMISSIONS:
        row = Permission(key=key, domain=domain, description=description)
        session.add(row)
        perms[key] = row
    await session.flush()
    for role_name, keys in SYSTEM_ROLES.items():
        role = Role(
            name=role_name, description=ROLE_DESCRIPTIONS[role_name], scope="platform", is_system=True
        )
        session.add(role)
        await session.flush()
        for key in keys:
            session.add(RolePermission(role_id=role.id, permission_id=perms[key].id))
    await session.commit()
    return perms


@pytest.fixture
async def seeded(app_client):
    """Catalog seeded + an open session helper."""
    from services.shared.db import make_sessionmaker

    sessions = make_sessionmaker(db.get_engine())
    async with sessions() as session:
        await seed_catalog(session)
    return app_client
