"""End-to-end fixtures: the entire distributed stack composed in-process via ASGI transports.

Production topology == test topology: browser → gateway → services over HTTP, except the
network is replaced by httpx.ASGITransport. Same headers, same middleware, same contracts.
"""

import os
import uuid

for _name in ("identity", "tenancy", "users", "rbac", "audit"):
    os.environ[f"{_name.upper()}_DATABASE_URL"] = (
        f"postgresql+asyncpg://edubot:edubot@localhost:5433/{_name}_test"
    )

import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from services.audit import db as audit_db  # noqa: E402
from services.audit.main import create_app as create_audit  # noqa: E402
from services.gateway.main import create_app as create_gateway  # noqa: E402
from services.identity import db as identity_db  # noqa: E402
from services.identity.main import create_app as create_identity  # noqa: E402
from services.identity.models import AuthAccount  # noqa: E402
from services.identity.security import hash_password  # noqa: E402
from services.rbac import db as rbac_db  # noqa: E402
from services.rbac.main import create_app as create_rbac  # noqa: E402
from services.rbac.models import Permission, Role, RoleAssignment, RolePermission  # noqa: E402
from services.rbac.seed_data import PERMISSIONS, ROLE_DESCRIPTIONS, SYSTEM_ROLES  # noqa: E402
from services.shared.audit import AuditClient  # noqa: E402
from services.shared.clients import ServiceClient  # noqa: E402
from services.shared.db import make_sessionmaker  # noqa: E402
from services.shared.settings import BaseServiceSettings  # noqa: E402
from services.tenancy import db as tenancy_db  # noqa: E402
from services.tenancy.main import create_app as create_tenancy  # noqa: E402
from services.tenancy.models import Institution  # noqa: E402
from services.users import db as users_db  # noqa: E402
from services.users.main import create_app as create_users  # noqa: E402
from services.users.models import User  # noqa: E402

INTERNAL = BaseServiceSettings().internal_token
OWNER_PASSWORD = "Correct horse 99!"
OWNER_EMAIL = "sysadmin@edubot.example.edu"


class Stack:
    """All six apps plus their databases, wired with ASGI transports."""

    def __init__(self) -> None:
        self.apps = {
            "identity": create_identity(),
            "tenancy": create_tenancy(),
            "users": create_users(),
            "rbac": create_rbac(),
            "audit": create_audit(),
        }
        audit_transport = httpx.ASGITransport(app=self.apps["audit"])
        for _name, app in self.apps.items():
            if hasattr(app.state, "audit"):
                app.state.audit = AuditClient(
                    "http://audit", INTERNAL, transport=audit_transport
                )
        self.apps["identity"].state.rbac = ServiceClient(
            "http://rbac", INTERNAL, transport=httpx.ASGITransport(app=self.apps["rbac"])
        )
        self.apps["users"].state.rbac = ServiceClient(
            "http://rbac", INTERNAL, transport=httpx.ASGITransport(app=self.apps["rbac"])
        )
        self.apps["users"].state.identity = ServiceClient(
            "http://identity", INTERNAL, transport=httpx.ASGITransport(app=self.apps["identity"])
        )
        self.apps["users"].state.tenancy = ServiceClient(
            "http://tenancy", INTERNAL, transport=httpx.ASGITransport(app=self.apps["tenancy"])
        )
        self.apps["rbac"].state.users = ServiceClient(
            "http://users", INTERNAL, transport=httpx.ASGITransport(app=self.apps["users"])
        )

        self.gateway = create_gateway(
            transports={name: httpx.ASGITransport(app=app) for name, app in self.apps.items()}
        )

    def session(self, service: str) -> AsyncSession:
        engines = {
            "identity": identity_db,
            "tenancy": tenancy_db,
            "users": users_db,
            "rbac": rbac_db,
            "audit": audit_db,
        }
        return make_sessionmaker(engines[service].get_engine())()


@pytest.fixture
async def stack() -> Stack:
    from services.identity.ratelimit import login_limiter

    login_limiter.reset()  # limiter is a process-wide singleton; isolate every gateway test
    for module in (identity_db, tenancy_db, users_db, rbac_db, audit_db):
        module.bind_from_settings()
        await module.reset_schema()
    return Stack()


@pytest.fixture
async def client(stack: Stack):
    transport = httpx.ASGITransport(app=stack.gateway)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway") as c:
        yield c


OWNER_PERSON_ID = uuid.uuid4()
SUPPORT_PERSON_ID = uuid.uuid4()
DISABLED_PERSON_ID = uuid.uuid4()


async def seed_platform(stack: Stack) -> dict:
    """Minimal coherent platform: 2 institutions, people incl. isolation fixture, RBAC, accounts."""
    ashford = Institution(
        id=uuid.uuid4(), code="ASHF", name="Ashford Institute of Technology",
        type="Institute of Technology", status="active", city="Portland", region="OR", country="United States",
    )
    hillview = Institution(
        id=uuid.uuid4(), code="HILV", name="Hillview Community College",
        type="Community College", status="suspended", city="Fresno", region="CA", country="United States",
    )
    async with stack.session("tenancy") as s:
        s.add_all([ashford, hillview])
        await s.commit()

    async with stack.session("users") as s:
        s.add_all(
            [
                User(
                    id=OWNER_PERSON_ID, institution_id=None, type="administrator",
                    first_name="Marisol", last_name="Vance", email=OWNER_EMAIL, status="active",
                ),
                User(
                    id=SUPPORT_PERSON_ID, institution_id=None, type="administrator",
                    first_name="Tomas", last_name="Lindqvist", email="t.lindqvist@edubot.example.edu",
                    status="active",
                ),
                User(
                    id=DISABLED_PERSON_ID, institution_id=None, type="administrator",
                    first_name="Cassian", last_name="Meyer", email="c.meyer@edubot.example.edu",
                    status="deactivated",
                ),
                # isolation fixture: same person-name in two institutions
                User(
                    institution_id=ashford.id, type="student", first_name="Priya", last_name="Nair",
                    email="priya.nair@ashf.example.edu", status="active",
                ),
                User(
                    institution_id=hillview.id, type="student", first_name="Priya", last_name="Nair",
                    email="priya.nair@hilv.example.edu", status="active",
                ),
                User(
                    institution_id=hillview.id, type="teacher", first_name="Owen", last_name="Cabrera",
                    email="o.cabrera@hilv.example.edu", status="active",
                ),
            ]
        )
        await s.commit()

    async with stack.session("rbac") as s:
        perms = {}
        for key, domain, description in PERMISSIONS:
            row = Permission(key=key, domain=domain, description=description)
            s.add(row)
            perms[key] = row
        await s.flush()
        role_ids = {}
        for role_name, keys in SYSTEM_ROLES.items():
            role = Role(
                name=role_name, description=ROLE_DESCRIPTIONS[role_name],
                scope="platform", is_system=True,
            )
            s.add(role)
            await s.flush()
            role_ids[role_name] = role.id
            for key in keys:
                s.add(RolePermission(role_id=role.id, permission_id=perms[key].id))
        await s.flush()
        s.add(RoleAssignment(actor_id=OWNER_PERSON_ID, role_id=role_ids["Platform Owner"], scope="platform"))
        s.add(RoleAssignment(actor_id=SUPPORT_PERSON_ID, role_id=role_ids["Support Admin"], scope="platform"))
        await s.commit()

    async with stack.session("identity") as s:
        s.add_all(
            [
                AuthAccount(
                    email=OWNER_EMAIL, password_hash=hash_password(OWNER_PASSWORD),
                    person_id=OWNER_PERSON_ID, scope="platform", status="active",
                ),
                AuthAccount(
                    email="t.lindqvist@edubot.example.edu", password_hash=hash_password("Support 1234!"),
                    person_id=SUPPORT_PERSON_ID, scope="platform", status="active",
                ),
                AuthAccount(
                    email="c.meyer@edubot.example.edu", password_hash=hash_password("Gone 1234!"),
                    person_id=DISABLED_PERSON_ID, scope="platform", status="disabled",
                ),
            ]
        )
        await s.commit()

    return {"ashford": ashford.id, "hillview": hillview.id}


@pytest.fixture
async def seeded(stack: Stack) -> dict:
    return await seed_platform(stack)


async def login(client: httpx.AsyncClient, email: str = OWNER_EMAIL, password: str = OWNER_PASSWORD) -> None:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


def authz_headers(client: httpx.AsyncClient) -> dict:
    return {"X-Requested-With": "fetch"}


async def audit_rows(stack: Stack) -> list:
    from sqlalchemy import select

    from services.audit.models import AuditEventRow

    async with stack.session("audit") as s:
        result = await s.execute(select(AuditEventRow))
        return [ (r.action, r.result, r.actor_label) for r in result.scalars() ]
