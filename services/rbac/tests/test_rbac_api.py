import uuid

import pytest

from services.rbac.tests.conftest import ALL_PERMS, admin_headers

ACTOR_OWNER = str(uuid.uuid4())


@pytest.mark.asyncio
async def test_permission_catalog_is_readable_with_role_read(seeded):
    client, _ = seeded
    response = await client.get(
        "/permissions", headers=admin_headers(actor=ACTOR_OWNER, permissions=["role.read"])
    )
    assert response.status_code == 200
    keys = [p["key"] for p in response.json()]
    assert "institution.create" in keys
    assert "audit.read" in keys
    assert len(keys) == len(ALL_PERMS)


@pytest.mark.asyncio
async def test_role_listing_and_resolution(seeded):
    """The core RBAC loop: assign role → actor permission snapshot contains its keys."""
    client, _ = seeded
    headers = admin_headers(actor=ACTOR_OWNER, permissions=ALL_PERMS)
    roles = await client.get("/roles", headers=headers)
    assert roles.status_code == 200
    support = next(r for r in roles.json() if r["name"] == "Support Admin")
    assert support["permissionCount"] > 0

    person = uuid.uuid4()
    assigned = await client.post(
        f"/roles/{support['id']}/assignments", headers=headers, json={"actorId": str(person)}
    )
    assert assigned.status_code == 201

    snapshot = await client.get(
        f"/internal/actors/{person}/permissions",
        headers={"X-Edubot-Internal-Token": admin_headers()["X-Edubot-Internal-Token"]},
    )
    assert snapshot.status_code == 200
    perms = snapshot.json()["permissions"]
    assert "user.deactivate" in perms
    assert "institution.create" not in perms  # Support Admin cannot create institutions


@pytest.mark.asyncio
async def test_duplicate_assignment_conflict(seeded):
    client, _ = seeded
    headers = admin_headers(actor=ACTOR_OWNER, permissions=ALL_PERMS)
    roles = await client.get("/roles", headers=headers)
    role_id = roles.json()[0]["id"]
    person = uuid.uuid4()
    first = await client.post(
        f"/roles/{role_id}/assignments", headers=headers, json={"actorId": str(person)}
    )
    assert first.status_code == 201
    second = await client.post(
        f"/roles/{role_id}/assignments", headers=headers, json={"actorId": str(person)}
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_in_use_role_cannot_be_deleted_and_self_unassign_blocked(seeded):
    client, _ = seeded
    headers = admin_headers(actor=ACTOR_OWNER, permissions=ALL_PERMS)
    roles = await client.get("/roles", headers=headers)
    owner = next(r for r in roles.json() if r["name"] == "Platform Owner")

    person = uuid.uuid4()
    created = await client.post(
        f"/roles/{owner['id']}/assignments", headers=headers, json={"actorId": str(person)}
    )
    assignment_id = created.json()["id"]
    # In use → delete blocked even for a system role reason aside
    delete_resp = await client.delete(f"/roles/{owner['id']}", headers=headers)
    assert delete_resp.status_code == 409

    self_assignment = await client.post(
        f"/roles/{owner['id']}/assignments",
        headers=headers,
        json={"actorId": ACTOR_OWNER},
    )
    # removing own assignment is blocked
    if self_assignment.status_code == 201:
        blocked = await client.delete(
            f"/assignments/{self_assignment.json()['id']}", headers=headers
        )
        assert blocked.status_code == 409
    else:
        assert self_assignment.status_code == 409

    removed = await client.delete(f"/assignments/{assignment_id}", headers=headers)
    assert removed.status_code == 204


@pytest.mark.asyncio
async def test_role_create_update_audit_and_unknown_permission_rejected(seeded):
    client, audit = seeded
    headers = admin_headers(actor=ACTOR_OWNER, permissions=ALL_PERMS)
    bad = await client.post(
        "/roles",
        headers=headers,
        json={"name": "Broken Role", "permissionKeys": ["does.not.exist"]},
    )
    assert bad.status_code == 422

    created = await client.post(
        "/roles",
        headers=headers,
        json={
            "name": "Registrar Reviewer",
            "description": "Reads institutions and audit.",
            "permissionKeys": ["institution.read", "audit.read"],
        },
    )
    assert created.status_code == 201
    role_id = created.json()["id"]

    updated = await client.patch(
        f"/roles/{role_id}",
        headers=headers,
        json={"permissionKeys": ["institution.read", "audit.read", "user.read"]},
    )
    assert updated.status_code == 200
    keys = [p["key"] for p in updated.json()["permissions"]]
    assert "user.read" in keys

    actions = [e["action"] for e in audit.events]
    assert "role.create" in actions and "role.update" in actions
    update_events = [e for e in audit.events if e["action"] == "role.update"]
    assert update_events[0]["diff"]["permissions"]["added"] == ["user.read"]


@pytest.mark.asyncio
async def test_requires_permissions(seeded):
    client, _ = seeded
    response = await client.get(
        "/roles", headers=admin_headers(actor=str(uuid.uuid4()), permissions=["user.read"])
    )
    assert response.status_code == 403
