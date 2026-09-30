import os
import uuid

import pytest

os.environ["USERS_DATABASE_URL"] = (
    "postgresql+asyncpg://edubot:edubot@localhost:5433/users_test"
)

import httpx  # noqa: E402

from services.shared.db import make_sessionmaker  # noqa: E402
from services.users import db  # noqa: E402
from services.users.config import get_settings  # noqa: E402
from services.users.models import User  # noqa: E402

get_settings.cache_clear()
from services.users.main import create_app  # noqa: E402

INTERNAL = get_settings().internal_token

INST_A = uuid.uuid4()
INST_B = uuid.uuid4()
INST_SUSPENDED = uuid.uuid4()


def platform_headers(*, permissions: list[str], actor: str | None = None) -> dict:
    return {
        "X-Edubot-Internal-Token": INTERNAL,
        "X-Edubot-Actor-Id": actor or str(uuid.uuid4()),
        "X-Edubot-Actor-Email": "sysadmin@edubot.example.edu",
        "X-Edubot-Scope": "platform",
        "X-Edubot-Permissions": ",".join(permissions),
    }


def institution_headers(institution: uuid.UUID, *, actor: str | None = None) -> dict:
    return {
        "X-Edubot-Internal-Token": INTERNAL,
        "X-Edubot-Actor-Id": actor or str(uuid.uuid4()),
        "X-Edubot-Actor-Email": "manager@inst.example.edu",
        "X-Edubot-Scope": "institution",
        "X-Edubot-Institution-Id": str(institution),
        "X-Edubot-Permissions": "",
    }


class StubAudit:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, ctx, event) -> None:  # noqa: ANN001, ANN202
        self.events.append(
            {"action": event.action, "result": event.result, "target_id": event.target_id, "diff": event.diff}
        )


class StubRbac:
    def __init__(self) -> None:
        self.role_actor_ids: list[str] = []
        self.assigned: list[dict] = []

    async def post(self, path: str, **kwargs):  # noqa: ANN001, ANN003, ANN202
        if path == "/internal/assignments/lookup":
            if kwargs.get("json", {}).get("roleId"):
                return {"actorIds": self.role_actor_ids}
        if path.startswith("/roles/"):
            self.assigned.append(kwargs.get("json", {}))
            return {"id": str(uuid.uuid4())}
        return {"byActor": {}}


class StubIdentity:
    def __init__(self) -> None:
        self.status_calls: list[tuple[str, str]] = []
        self.created_accounts: list[dict] = []

    async def post(self, path: str, **kwargs):  # noqa: ANN001, ANN003, ANN202
        if path == "/internal/accounts":
            self.created_accounts.append(kwargs.get("json", {}))
            return {"accountId": str(uuid.uuid4()), "inviteToken": "tok_" + uuid.uuid4().hex[:16]}
        if path.endswith("/status"):
            person_id = path.split("/")[-2]
            self.status_calls.append((person_id, kwargs.get("json", {}).get("status")))
            return {"status": kwargs.get("json", {}).get("status")}
        return {}


class StubTenancy:
    def __init__(self) -> None:
        self.names = {
            str(INST_A): "Ashford Institute of Technology",
            str(INST_B): "Hillview Community College",
            str(INST_SUSPENDED): "Southshore Regional Academy",
        }

    async def post(self, path: str, **kwargs):  # noqa: ANN001, ANN003, ANN202
        ids = kwargs.get("json", {}).get("ids", [])
        return {"items": [{"id": i, "name": self.names.get(i, "Unknown")} for i in ids]}


@pytest.fixture
async def app_client():
    db.bind_from_settings()
    app = create_app()
    audit, rbac, identity, tenancy = StubAudit(), StubRbac(), StubIdentity(), StubTenancy()
    app.state.audit = audit
    app.state.rbac = rbac
    app.state.identity = identity
    app.state.tenancy = tenancy
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://users") as client:
        yield client, audit, rbac, identity


@pytest.fixture(autouse=True)
async def clean_db():
    db.bind_from_settings()
    await db.reset_schema()
    yield


async def make_user(
    *,
    institution_id: uuid.UUID | None = INST_A,
    type: str = "student",
    first_name: str | None = None,
    last_name: str | None = None,
    email: str | None = None,
    status: str = "active",
    created_at=None,
) -> User:
    suffix = uuid.uuid4().hex[:6]
    sessions = make_sessionmaker(db.get_engine())
    async with sessions() as session:
        row = User(
            institution_id=institution_id,
            type=type,
            first_name=first_name or "Nell",
            last_name=last_name or f"Tester-{suffix}",
            email=email or f"user.{suffix}@ashf.example.edu",
            status=status,
        )
        if created_at is not None:
            row.created_at = created_at
        session.add(row)
        await session.commit()
        return row
