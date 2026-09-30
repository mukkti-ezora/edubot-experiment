import uuid

import pytest

from services.tenancy.tests.conftest import ALL_PERMS, admin_headers, make_institution

OWNER = str(uuid.uuid4())


@pytest.mark.asyncio
async def test_create_institution_requires_permission(app_client):
    client, _ = app_client
    denied = await client.post(
        "/institutions",
        headers=admin_headers(actor=str(uuid.uuid4()), permissions=["institution.read"]),
        json={"name": "No Permission College", "code": "NPC", "type": "College"},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_create_and_conflict_on_duplicate_code(app_client):
    client, audit = app_client
    headers = admin_headers(actor=OWNER, permissions=ALL_PERMS)
    created = await client.post(
        "/institutions",
        headers=headers,
        json={
            "name": "Ashford Institute of Technology",
            "code": "ASHF",
            "type": "Institute of Technology",
            "city": "Portland",
            "region": "OR",
            "country": "United States",
            "contactName": "Imogen Craft",
            "contactEmail": "registrar@ashf.example.edu",
        },
    )
    assert created.status_code == 201
    assert created.json()["status"] == "pending"  # new institutions start pending
    assert any(e["action"] == "institution.create" for e in audit.events)

    dup = await client.post(
        "/institutions",
        headers=headers,
        json={"name": "Different Name", "code": "ASHF", "type": "College"},
    )
    assert dup.status_code == 409

    bad_type = await client.post(
        "/institutions",
        headers=headers,
        json={"name": "Mystery School", "code": "MYS", "type": "Hogwarts"},
    )
    assert bad_type.status_code == 422


@pytest.mark.asyncio
async def test_update_emits_diff_and_suspend_reactivate_transition(app_client):
    client, audit = app_client
    inst = await make_institution()
    headers = admin_headers(actor=OWNER, permissions=ALL_PERMS)

    updated = await client.patch(
        f"/institutions/{inst.id}", headers=headers, json={"city": "Reno", "type": "Academy"}
    )
    assert updated.status_code == 200
    assert updated.json()["city"] == "Reno"
    update_event = next(e for e in audit.events if e["action"] == "institution.update")
    assert update_event["diff"]["city"] == {"before": "Duluth", "after": "Reno"}

    suspended = await client.post(
        f"/institutions/{inst.id}/suspend", headers=headers, json={"reason": "Accreditation review"}
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"
    assert suspended.json()["suspendedAt"] is not None

    reactivated = await client.post(
        f"/institutions/{inst.id}/reactivate", headers=headers, json={}
    )
    assert reactivated.json()["status"] == "active"
    assert reactivated.json()["suspendedAt"] is None

    actions = [e["action"] for e in audit.events]
    assert "institution.suspend" in actions and "institution.reactivate" in actions


@pytest.mark.asyncio
async def test_list_filters_sort_and_pagination(app_client):
    client, _ = app_client
    for i in range(12):
        await make_institution(status="active" if i % 3 else "pending", type="College" if i % 2 else "University")
    headers = admin_headers(actor=OWNER, permissions=ALL_PERMS)

    page1 = await client.get("/institutions?limit=5&sort=name", headers=headers)
    assert page1.status_code == 200
    body = page1.json()
    assert len(body["items"]) == 5
    assert body["nextCursor"]
    names1 = [i["name"] for i in body["items"]]
    assert names1 == sorted(names1)

    page2 = await client.get(
        f"/institutions?limit=5&sort=name&cursor={body['nextCursor']}", headers=headers
    )
    assert len(page2.json()["items"]) == 5
    assert page1.json()["items"][0]["id"] != page2.json()["items"][0]["id"]

    pending = await client.get("/institutions?status=pending&limit=50", headers=headers)
    assert all(i["status"] == "pending" for i in pending.json()["items"])
    universities = await client.get("/institutions?type=University&limit=50", headers=headers)
    assert all(i["type"] == "University" for i in universities.json()["items"])

    bad_sort = await client.get("/institutions?sort=name;DROP TABLE institutions", headers=headers)
    assert bad_sort.status_code == 422


@pytest.mark.asyncio
async def test_settings_read_update_and_audit(app_client):
    client, audit = app_client
    denied = await client.get(
        "/settings/platform", headers=admin_headers(actor=str(uuid.uuid4()), permissions=["institution.read"])
    )
    assert denied.status_code == 403

    headers = admin_headers(actor=OWNER, permissions=ALL_PERMS)
    current = await client.get("/settings/platform", headers=headers)
    assert current.status_code == 200
    assert current.json()["platformName"] == "EduBot"

    updated = await client.put(
        "/settings/platform",
        headers=headers,
        json={"platformName": "EduBot Cloud", "supportEmail": "help@edubot.example.edu"},
    )
    assert updated.status_code == 200
    assert updated.json()["platformName"] == "EduBot Cloud"
    settings_events = [e for e in audit.events if e["action"] == "settings.update"]
    assert settings_events and settings_events[0]["diff"]["platform_name"]["after"] == "EduBot Cloud"
