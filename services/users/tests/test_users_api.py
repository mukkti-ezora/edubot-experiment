import uuid

import pytest

from services.users.tests.conftest import (
    INST_A,
    INST_B,
    institution_headers,
    make_user,
    platform_headers,
)

ALL_PERMS = ["user.read", "user.update", "user.deactivate", "admin.read", "admin.create", "admin.update"]


@pytest.mark.asyncio
async def test_platform_scope_sees_all_tenants_and_types(app_client):
    client, *_ = app_client
    a1 = await make_user(institution_id=INST_A, type="student")
    b1 = await make_user(institution_id=INST_B, type="teacher")
    platform_admin = await make_user(institution_id=None, type="administrator", email="p.admin@edubot.example.edu")
    response = await client.get(
        "/users?limit=100", headers=platform_headers(permissions=["user.read"])
    )
    assert response.status_code == 200
    ids = {i["id"] for i in response.json()["items"]}
    assert {str(a1.id), str(b1.id), str(platform_admin.id)} <= ids
    ashford = next(i for i in response.json()["items"] if i["id"] == str(a1.id))
    assert ashford["institutionName"] == "Ashford Institute of Technology"


@pytest.mark.asyncio
async def test_institution_scope_cannot_read_platform_registry(app_client):
    """Institution-scoped contexts lack user.read semantics: the registry is a platform surface."""
    client, *_ = app_client
    await make_user(institution_id=INST_A)
    response = await client.get("/users", headers=institution_headers(INST_A))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cross_tenant_read_and_write_are_invisible(app_client):
    """Institution-scoped contexts hit the scope policy before any record exists for them:
    reads and writes against another tenant fail (403 TENANT_VIOLATION), never leak."""
    client, *_ = app_client
    victim = await make_user(institution_id=INST_B, email="victim@hill.example.edu")
    headers = institution_headers(INST_A)
    read = await client.get(f"/users/{victim.id}", headers=headers)
    assert read.status_code == 403
    write = await client.patch(
        f"/users/{victim.id}", headers=headers, json={"firstName": "Hacked"}
    )
    assert write.status_code == 403
    deactivate = await client.post(f"/users/{victim.id}/deactivate", headers=headers)
    assert deactivate.status_code == 403

    # The other tenant's record is untouched:
    untouched = await client.get(
        f"/users/{victim.id}", headers=platform_headers(permissions=["user.read"])
    )
    assert untouched.status_code == 200
    assert untouched.json()["firstName"] == "Nell"
    assert untouched.json()["status"] == "active"


@pytest.mark.asyncio
async def test_search_filter_sort_and_keyset_pagination_with_duplicate_names(app_client):
    """Duplicate (name) rows across institutions — the isolation fixture — must paginate correctly."""
    client, *_ = app_client
    dup1 = await make_user(institution_id=INST_A, first_name="Priya", last_name="Nair", email="priya.nair@ashf.example.edu")
    dup2 = await make_user(institution_id=INST_B, first_name="Priya", last_name="Nair", email="priya.nair@hilv.example.edu")
    for _i in range(9):
        await make_user(institution_id=INST_A)

    headers = platform_headers(permissions=["user.read"])
    searched = await client.get("/users?query=priya nair&limit=10", headers=headers)
    assert searched.status_code == 200
    found = {i["email"] for i in searched.json()["items"]}
    assert found == {"priya.nair@ashf.example.edu", "priya.nair@hilv.example.edu"}
    assert {str(dup1.id), str(dup2.id)} == {i["id"] for i in searched.json()["items"]}

    seen: set[str] = set()
    cursor = None
    for _ in range(6):
        params: dict = {"limit": 3, "sort": "name"}
        if cursor:
            params["cursor"] = cursor
        page = await client.get("/users", params=params, headers=headers)
        body = page.json()
        for item in body["items"]:
            assert item["id"] not in seen
            seen.add(item["id"])
        cursor = body["nextCursor"]
        if not cursor:
            break
    assert len(seen) == 11

    filtered = await client.get(
        f"/users?institutionId={INST_B}&limit=100", headers=headers
    )
    assert {i["id"] for i in filtered.json()["items"]} == {str(dup2.id)}


@pytest.mark.asyncio
async def test_deactivate_admin_syncs_identity_and_self_guard(app_client):
    client, audit, _, identity = app_client
    actor = uuid.uuid4()
    admin = await make_user(institution_id=None, type="administrator", email="a@edubot.example.edu")

    me = await make_user(institution_id=None, type="administrator", email="me@edubot.example.edu")
    self_block = await client.post(
        f"/administrators/{me.id}/deactivate",
        headers=platform_headers(permissions=ALL_PERMS, actor=str(me.id)),
    )
    assert self_block.status_code == 409
    assert "own account" in self_block.json()["message"]

    ok = await client.post(
        f"/administrators/{admin.id}/deactivate",
        headers=platform_headers(permissions=ALL_PERMS, actor=str(actor)),
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "deactivated"
    assert (str(admin.id), "disabled") in identity.status_calls
    assert any(e["action"] == "admin.deactivate" for e in audit.events)


@pytest.mark.asyncio
async def test_create_administrator_invite_is_simulated_and_audited(app_client):
    client, audit, rbac, identity = app_client
    role_id = uuid.uuid4()
    response = await client.post(
        "/administrators",
        headers=platform_headers(permissions=ALL_PERMS),
        json={
            "firstName": "Demetri",
            "lastName": "Kowalczyk",
            "email": "d.kowalczyk@edubot.example.edu",
            "roleId": str(role_id),
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["administrator"]["status"] == "invited"
    # Never pretend an email was sent.
    assert body["invite"]["simulated"] is True
    assert "manually" in body["invite"]["note"]
    assert identity.created_accounts and identity.created_accounts[0]["email"] == "d.kowalczyk@edubot.example.edu"
    assert rbac.assigned and rbac.assigned[0]["actorId"] == body["administrator"]["id"]
    assert any(e["action"] == "admin.create" for e in audit.events)

    dup = await client.post(
        "/administrators",
        headers=platform_headers(permissions=ALL_PERMS),
        json={
            "firstName": "Demetri",
            "lastName": "Kowalczyk",
            "email": "D.KOWALCZYK@edubot.example.edu",
        },
    )
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_role_filter_and_requires_permissions(app_client):
    client, _, rbac, _ = app_client
    included = await make_user(first_name="Target", last_name="Person")
    await make_user()
    rbac.role_actor_ids = [str(included.id)]
    headers = platform_headers(permissions=ALL_PERMS)
    filtered = await client.get(f"/users?roleId={uuid.uuid4()}&limit=25", headers=headers)
    assert [i["id"] for i in filtered.json()["items"]] == [str(included.id)]

    denied = await client.get("/users", headers=platform_headers(permissions=["audit.read"]))
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_user_patch_conflict_and_diff(app_client):
    client, audit, *_ = app_client
    await make_user(email="keep@ashf.example.edu")
    edited = await make_user(email="change@ashf.example.edu")
    headers = platform_headers(permissions=["user.read", "user.update"])
    clash = await client.patch(
        f"/users/{edited.id}", headers=headers, json={"email": "KEEP@ashf.example.edu"}
    )
    assert clash.status_code == 409
    ok = await client.patch(
        f"/users/{edited.id}", headers=headers, json={"firstName": "Renamed"}
    )
    assert ok.status_code == 200
    event = next(e for e in audit.events if e["action"] == "user.update")
    assert event["diff"]["first_name"] == {"before": "Nell", "after": "Renamed"}
