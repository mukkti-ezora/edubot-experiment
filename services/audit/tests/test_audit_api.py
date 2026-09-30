import uuid
from datetime import UTC, datetime, timedelta

import pytest

from services.audit.tests.conftest import INTERNAL, admin_headers

OWNER_ACTOR = str(uuid.uuid4())


def make_event(action: str, *, minutes_ago: int = 0, **overrides) -> dict:
    base = {
        "occurredAt": (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat(),
        "action": action,
        "result": "success",
        "actorType": "admin",
        "actorLabel": "sysadmin@edubot.example.edu",
        "institutionLabel": None,
        "diff": None,
    }
    base.update(overrides)
    return base


async def post_events(client, events: list[dict]) -> None:
    for event in events:
        response = await client.post("/internal/events", json=event, headers={"X-Edubot-Internal-Token": INTERNAL})
        assert response.status_code == 201


@pytest.mark.asyncio
async def test_record_and_read_event_roundtrip(app_client):
    client = app_client
    await post_events(
        client,
        [
            make_event(
                "institution.create",
                targetType="institution",
                targetId=str(uuid.uuid4()),
                targetLabel="Ashford Institute of Technology",
            )
        ],
    )
    headers = admin_headers(actor=OWNER_ACTOR, permissions=["audit.read"])
    listing = await client.get("/activity", headers=headers)
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) == 1
    assert items[0]["action"] == "institution.create"

    detail = await client.get(f"/activity/{items[0]['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["targetLabel"] == "Ashford Institute of Technology"
    assert detail.json()["actorLabel"] == "sysadmin@edubot.example.edu"


@pytest.mark.asyncio
async def test_activity_requires_audit_permission(app_client):
    client = app_client
    denied = await client.get("/activity", headers=admin_headers(actor=str(uuid.uuid4()), permissions=[]))
    assert denied.status_code == 403
    unauth = await client.get("/activity", headers={"X-Edubot-Internal-Token": INTERNAL})
    assert unauth.status_code == 401


@pytest.mark.asyncio
async def test_filters_combine(app_client):
    client = app_client
    inst_a = uuid.uuid4()
    events = [
        make_event("institution.create", institutionId=str(inst_a), institutionLabel="Ashford"),
        make_event("auth.sign_in_failed", result="denied", minutes_ago=5),
        make_event("user.deactivate", institutionId=str(inst_a), institutionLabel="Ashford", minutes_ago=40000),
    ]
    await post_events(client, events)
    headers = admin_headers(actor=OWNER_ACTOR, permissions=["audit.read"])

    by_result = await client.get("/activity?result=denied", headers=headers)
    assert [i["action"] for i in by_result.json()["items"]] == ["auth.sign_in_failed"]

    by_inst = await client.get(f"/activity?institutionId={inst_a}", headers=headers)
    assert len(by_inst.json()["items"]) == 2

    by_search = await client.get("/activity?query=sign_in", headers=headers)
    assert [i["action"] for i in by_search.json()["items"]] == ["auth.sign_in_failed"]

    window = await client.get(
        "/activity",
        params={"dateFrom": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
        headers=headers,
    )
    assert len(window.json()["items"]) == 2

    combined = await client.get(
        f"/activity?institutionId={inst_a}&result=success&query=create", headers=headers
    )
    assert [i["action"] for i in combined.json()["items"]] == ["institution.create"]


@pytest.mark.asyncio
async def test_pagination_walks_full_result_set(app_client):
    client = app_client
    await post_events(
        client, [make_event("misc.action", minutes_ago=i) for i in range(30)]
    )
    headers = admin_headers(actor=OWNER_ACTOR, permissions=["audit.read"])
    seen: list[str] = []
    cursor: str | None = None
    while True:
        params = {"limit": 7}
        if cursor:
            params["cursor"] = cursor
        page = await client.get("/activity", params=params, headers=headers)
        assert page.status_code == 200
        body = page.json()
        seen.extend(i["id"] for i in body["items"])
        cursor = body["nextCursor"]
        if not cursor:
            break
    assert len(seen) == 30
    assert len(set(seen)) == 30


@pytest.mark.asyncio
async def test_no_delete_or_update_paths_exist(app_client):
    client = app_client
    headers = admin_headers(actor=OWNER_ACTOR, permissions=["audit.read"])
    target = str(uuid.uuid4())
    for method in ("delete", "patch", "put"):
        response = await client.request(method, f"/activity/{target}", headers=headers)
        assert response.status_code in (405, 404)


@pytest.mark.asyncio
async def test_invalid_result_rejected(app_client):
    client = app_client
    response = await client.post(
        "/internal/events",
        json=make_event("x", result="weird"),
        headers={"X-Edubot-Internal-Token": INTERNAL},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_internal_stats(app_client):
    client = app_client
    inst_a = uuid.uuid4()
    await post_events(
        client,
        [
            make_event("institution.update", institutionId=str(inst_a), institutionLabel="Ashford"),
            make_event("institution.update", institutionId=str(inst_a), institutionLabel="Ashford"),
            make_event("auth.sign_in_failed", result="denied"),
        ],
    )
    since = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    by_inst = await client.get(
        "/internal/stats/activity-by-institution",
        params={"since": since},
        headers={"X-Edubot-Internal-Token": INTERNAL},
    )
    assert by_inst.json()["items"][0]["events"] == 2
    failures = await client.get(
        "/internal/stats/failed-signins", params={"since": since},
        headers={"X-Edubot-Internal-Token": INTERNAL},
    )
    assert failures.json()["count"] == 1
