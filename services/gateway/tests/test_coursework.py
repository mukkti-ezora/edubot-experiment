"""Coursework: submitting assignments, late rules, extensions, and teacher grading, end to end through the gateway."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from services.audit.models import AuditEventRow
from services.gateway.tests.conftest import audit_rows
from services.gateway.tests.test_doubts import FETCH, _signed_in, world  # noqa: F401
from services.learning import coursework as coursework_module
from services.learning.coursework import extension_auto_approves, late_score, minutes_late
from services.learning.models import Assignment, Course, LearningEvent, Submission

MINE = "/api/v1/student/assignments"
GRADING = "/api/v1/teacher/submissions"
EXTENSIONS = "/api/v1/teacher/requests/extensions"
RUBRIC = [{"criterion": "Method", "description": "Shows the working", "points": 6},
          {"criterion": "Answer", "description": "Correct final answer", "points": 4}]
DUE = datetime(2026, 10, 12, 17, 0, tzinfo=UTC)


@pytest.fixture
async def coursework(stack, world):  # noqa: F811
    now = datetime.now(UTC)
    ash = (await _course(stack, world["phy"])).institution_id
    ids = {name: uuid.uuid4() for name in ("open", "rubric", "past", "closed", "text_only", "other_class")}
    async with stack.session("learning") as s:
        s.add_all([
            Assignment(id=ids["open"], institution_id=ash, course_id=world["phy"], title="Problem set 2",
                       kind="assignment", due_at=now + timedelta(days=3), points=10, max_resubmissions=1),
            Assignment(id=ids["rubric"], institution_id=ash, course_id=world["phy"], title="Lab report",
                       kind="lab", due_at=now + timedelta(days=3), points=20, rubric=RUBRIC),
            Assignment(id=ids["past"], institution_id=ash, course_id=world["phy"], title="Lab 1", kind="lab",
                       due_at=now - timedelta(hours=30), points=10, accepts_late_days=3),
            Assignment(id=ids["closed"], institution_id=ash, course_id=world["phy"], title="Old quiz", kind="quiz",
                       due_at=now - timedelta(days=5), points=10, accepts_late_days=3),
            Assignment(id=ids["text_only"], institution_id=ash, course_id=world["phy"], title="Reflection",
                       kind="assignment", due_at=now + timedelta(days=3), points=5, submission_types=["text"]),
            Assignment(id=ids["other_class"], institution_id=ash, course_id=world["chm"], title="Chemistry set",
                       kind="assignment", due_at=now + timedelta(days=3), points=10),
        ])
        await s.commit()
    return ids


async def _course(stack, course_id):
    async with stack.session("learning") as s:
        return await s.get(Course, course_id)


async def _submit(client, assignment_id, **body):
    return await client.post(f"{MINE}/{assignment_id}/submit", json={"text": "My answer", **body}, headers=FETCH)


async def _submission(stack, assignment_id) -> Submission:
    async with stack.session("learning") as s:
        return (await s.execute(select(Submission).where(Submission.assignment_id == assignment_id))).scalar_one()


# ---- rules ----

@pytest.mark.parametrize("at,late", [
    (DUE, 0),
    (DUE - timedelta(seconds=1), 0),
    (DUE + timedelta(seconds=1), 1),
    (DUE + timedelta(minutes=1), 1),
    (DUE + timedelta(days=1, minutes=1), 1441),
])
def test_minutes_late_rounds_up_and_on_time_is_not_late(at, late):
    assert minutes_late(DUE, at) == late


@pytest.mark.parametrize("late_minutes,score", [(0, 10.0), (1, 9.0), (1440, 9.0), (1441, 8.0), (60 * 24 * 20, 0.0)])
def test_late_penalty_is_per_started_day_and_never_negative(late_minutes, score):
    assert late_score(10, late_minutes, percent_per_day=10) == score


@pytest.mark.parametrize("extra,earlier,asked_after_due,expected", [
    (timedelta(hours=48), 0, False, True),
    (timedelta(hours=48, minutes=1), 0, False, False),
    (timedelta(hours=1), 1, False, False),
    (timedelta(hours=1), 0, True, False),
])
def test_extension_auto_approval_boundaries(extra, earlier, asked_after_due, expected):
    now = DUE + timedelta(minutes=1) if asked_after_due else DUE - timedelta(hours=1)

    assert extension_auto_approves(now=now, due=DUE, until=DUE + extra, window_hours=48,
                                   earlier_requests=earlier) is expected


# ---- student ----

@pytest.mark.asyncio
async def test_students_see_their_courses_assignments_with_status(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        listing = (await sana.get(MINE)).json()

    statuses = {item["title"]: item["status"] for item in listing["items"]}
    assert "Chemistry set" not in statuses
    assert statuses["Problem set 2"] == "not_started"
    assert statuses["Old quiz"] == "missing"
    assert listing["counts"]["missing"] == 1


@pytest.mark.asyncio
async def test_assignment_from_another_class_is_hidden(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.get(f"{MINE}/{coursework['other_class']}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_draft_is_saved_but_not_handed_in(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        draft = (await sana.put(f"{MINE}/{coursework['open']}/draft", json={"text": "Half done"},
                                headers=FETCH)).json()

    assert draft["status"] == "draft"
    assert draft["submission"]["text"] == "Half done" and draft["submission"]["submittedAt"] is None


@pytest.mark.asyncio
async def test_submitting_on_time_is_not_late_and_is_on_the_trail(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        done = (await _submit(sana, coursework["open"], link="https://example.org/work")).json()

    async with stack.session("learning") as s:
        kinds = [e.kind for e in (await s.execute(select(LearningEvent))).scalars()]
    assert done["status"] == "submitted" and done["submission"]["revision"] == 1
    assert done["submission"]["link"] == "https://example.org/work"
    assert "assignment_submitted" in kinds


@pytest.mark.asyncio
async def test_submitting_after_the_deadline_records_how_late(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        done = (await _submit(sana, coursework["past"])).json()

    assert done["status"] == "late"
    assert 30 * 60 <= done["lateMinutes"] <= 30 * 60 + 2


@pytest.mark.asyncio
async def test_submissions_close_after_the_late_window(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await _submit(sana, coursework["closed"])

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_resubmissions_are_limited(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        statuses = [(await _submit(sana, coursework["open"], text=f"v{i}")).status_code for i in range(3)]

    assert statuses == [200, 200, 409]


@pytest.mark.asyncio
async def test_a_draft_cannot_overwrite_handed_in_work(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["open"])
        response = await sana.put(f"{MINE}/{coursework['open']}/draft", json={"text": "oops"}, headers=FETCH)

    assert response.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"text": "   "}, {"text": "", "link": None}])
async def test_empty_work_is_refused(stack, world, coursework, body):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"{MINE}/{coursework['open']}/submit", json=body, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_submission_type_the_assignment_does_not_take_is_refused(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await _submit(sana, coursework["text_only"], link="https://example.org")

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_an_early_short_extension_is_approved_straight_away(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        detail = (await sana.get(f"{MINE}/{coursework['open']}")).json()
        until = datetime.fromisoformat(detail["dueAt"]) + timedelta(hours=24)
        asked = await sana.post(f"{MINE}/{coursework['open']}/extension",
                                json={"until": until.isoformat(), "reason": "Sports meet"}, headers=FETCH)

    body = asked.json()
    assert asked.status_code == 201
    assert body["extension"]["status"] == "approved" and body["extension"]["autoApproved"] is True
    assert datetime.fromisoformat(body["effectiveDueAt"]) == until


@pytest.mark.asyncio
async def test_an_extension_asked_after_the_deadline_waits_for_the_teacher(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        until = datetime.now(UTC) + timedelta(days=1)
        body = (await sana.post(f"{MINE}/{coursework['past']}/extension",
                                json={"until": until.isoformat(), "reason": "I was ill"}, headers=FETCH)).json()
        again = await sana.post(f"{MINE}/{coursework['past']}/extension",
                                json={"until": until.isoformat(), "reason": "Again"}, headers=FETCH)

    assert body["extension"]["status"] == "pending"
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_an_extension_must_move_the_deadline_later(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"{MINE}/{coursework['open']}/extension",
                                   json={"until": datetime.now(UTC).isoformat(), "reason": "?"}, headers=FETCH)

    assert response.status_code == 422


# ---- teacher ----

@pytest.mark.asyncio
async def test_teacher_sees_handed_in_work_from_their_classes_only(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["open"])
        await sana.put(f"{MINE}/{coursework['rubric']}/draft", json={"text": "draft"}, headers=FETCH)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        queue = (await tara.get(GRADING)).json()
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        other = (await omar.get(GRADING)).json()

    assert [(i["assignment"]["title"], i["student"]["name"]) for i in queue["items"]] == [("Problem set 2", "Sana Okafor")]
    assert queue["counts"] == {"toGrade": 1, "graded": 0}
    assert other["items"] == []


@pytest.mark.asyncio
async def test_grading_by_rubric_scales_to_the_points_and_is_audited(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["rubric"])
        submission = await _submission(stack, coursework["rubric"])
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            graded = (await tara.post(f"{GRADING}/{submission.id}/grade", json={
                "rubricScores": [{"criterion": "Method", "points": 6}, {"criterion": "Answer", "points": 2}],
                "feedback": "Check the units in step 3."}, headers=FETCH)).json()
        seen = (await sana.get(f"{MINE}/{coursework['rubric']}")).json()

    assert graded["work"]["score"] == 16.0
    assert seen["status"] == "graded" and seen["feedbackReady"] is True
    assert seen["submission"]["feedback"] == "Check the units in step 3."
    assert ("submission.grade", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_late_work_is_graded_with_the_penalty(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["past"])  # about 30 hours late: two started days
    submission = await _submission(stack, coursework["past"])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        graded = (await tara.post(f"{GRADING}/{submission.id}/grade", json={"score": 10}, headers=FETCH)).json()

    assert graded["work"]["score"] == 8.0


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"rubricScores": [{"criterion": "Method", "points": 7}, {"criterion": "Answer", "points": 4}]},
    {"rubricScores": [{"criterion": "Method", "points": 6}]},
])
async def test_rubric_scores_must_cover_every_criterion_within_its_points(stack, world, coursework, body):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["rubric"])
    submission = await _submission(stack, coursework["rubric"])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        response = await tara.post(f"{GRADING}/{submission.id}/grade", json=body, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_graded_work_cannot_be_resubmitted(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["open"])
        submission = await _submission(stack, coursework["open"])
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            await tara.post(f"{GRADING}/{submission.id}/grade", json={"score": 9}, headers=FETCH)
        response = await _submit(sana, coursework["open"])

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_teacher_cannot_grade_another_class(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["open"])
    submission = await _submission(stack, coursework["open"])
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        response = await omar.post(f"{GRADING}/{submission.id}/grade", json={"score": 1}, headers=FETCH)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_feedback_is_marked_seen(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["open"])
        submission = await _submission(stack, coursework["open"])
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            await tara.post(f"{GRADING}/{submission.id}/grade", json={"score": 9}, headers=FETCH)
        seen = (await sana.post(f"{MINE}/{coursework['open']}/feedback-seen", headers=FETCH)).json()

    assert seen["feedbackReady"] is False


@pytest.mark.asyncio
async def test_teacher_decides_a_pending_extension_and_it_moves_the_deadline(stack, world, coursework):  # noqa: F811
    until = datetime.now(UTC) + timedelta(days=2)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await sana.post(f"{MINE}/{coursework['past']}/extension",
                        json={"until": until.isoformat(), "reason": "I was ill"}, headers=FETCH)
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            waiting = (await tara.get(EXTENSIONS)).json()
            decided = await tara.post(f"{EXTENSIONS}/{waiting['items'][0]['id']}/decide",
                                      json={"approve": True, "note": "Get well soon."}, headers=FETCH)
            twice = await tara.post(f"{EXTENSIONS}/{waiting['items'][0]['id']}/decide",
                                    json={"approve": False}, headers=FETCH)
        done = (await _submit(sana, coursework["past"])).json()

    assert waiting["items"][0]["student"]["name"] == "Sana Okafor"
    assert decided.json()["status"] == "approved"
    assert twice.status_code == 409
    assert done["status"] == "submitted" and done["lateMinutes"] == 0
    assert ("extension.approved", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_coursework_routes_are_role_scoped(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        student_on_grading = await sana.get(GRADING)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        teacher_on_mine = await tara.get(MINE)

    assert (student_on_grading.status_code, teacher_on_mine.status_code) == (403, 403)


# ---- review fixes ----

async def _grade_audit(stack) -> AuditEventRow:
    async with stack.session("audit") as s:
        return (await s.execute(select(AuditEventRow).where(AuditEventRow.action == "submission.grade"))).scalar_one()


@pytest.mark.asyncio
async def test_a_fractional_late_score_is_stored_exactly(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["past"])  # two started days late: 20% off
    submission = await _submission(stack, coursework["past"])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        graded = await tara.post(f"{GRADING}/{submission.id}/grade", json={"score": 9.5}, headers=FETCH)

    assert graded.status_code == 200
    assert (await _submission(stack, coursework["past"])).score == 7.6


@pytest.mark.asyncio
async def test_the_grade_audit_records_the_score_and_penalty(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["past"])
    submission = await _submission(stack, coursework["past"])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.post(f"{GRADING}/{submission.id}/grade", json={"score": 10}, headers=FETCH)

    assert (await _grade_audit(stack)).diff == {"score": 8.0, "rawScore": 10.0, "points": 10, "latePenaltyPercent": 20}


@pytest.mark.asyncio
async def test_two_first_submissions_at_once_both_succeed_on_one_record(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        first, second = await asyncio.gather(_submit(sana, coursework["open"]), _submit(sana, coursework["open"]))

    assert (first.status_code, second.status_code) == (200, 200)
    assert (await _submission(stack, coursework["open"])).revision == 2


@pytest.mark.asyncio
async def test_two_extension_requests_at_once_make_only_one(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        until = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        body = {"until": until, "reason": "Ill"}
        responses = await asyncio.gather(*[
            sana.post(f"{MINE}/{coursework['past']}/extension", json=body, headers=FETCH) for _ in range(2)])

    assert sorted(r.status_code for r in responses) == [201, 409]


@pytest.mark.asyncio
@pytest.mark.parametrize("days_after_due,status", [(14, 201), (15, 422)])
async def test_an_extension_can_move_the_deadline_at_most_two_weeks(stack, world, coursework,  # noqa: F811
                                                                  days_after_due, status):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        detail = (await sana.get(f"{MINE}/{coursework['open']}")).json()
        until = datetime.fromisoformat(detail["dueAt"]) + timedelta(days=days_after_due)
        response = await sana.post(f"{MINE}/{coursework['open']}/extension",
                                   json={"until": until.isoformat(), "reason": "Fest"}, headers=FETCH)

    assert response.status_code == status


@pytest.mark.asyncio
async def test_a_second_request_after_a_decline_waits_for_the_teacher(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        due = datetime.fromisoformat((await sana.get(f"{MINE}/{coursework['open']}")).json()["dueAt"])
        first = (await sana.post(f"{MINE}/{coursework['open']}/extension",
                                 json={"until": (due + timedelta(days=5)).isoformat(), "reason": "Fest"},
                                 headers=FETCH)).json()
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            await tara.post(f"{EXTENSIONS}/{first['extension']['id']}/decide", json={"approve": False},
                            headers=FETCH)
        second = (await sana.post(f"{MINE}/{coursework['open']}/extension",
                                  json={"until": (due + timedelta(hours=24)).isoformat(), "reason": "Ill"},
                                  headers=FETCH)).json()

    assert second["extension"]["status"] == "pending" and second["extension"]["autoApproved"] is False


@pytest.mark.asyncio
async def test_today_uses_the_approved_extension(stack, world, coursework):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        asked = (await sana.post(f"{MINE}/{coursework['past']}/extension",
                                 json={"until": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                                       "reason": "Ill"}, headers=FETCH)).json()
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            await tara.post(f"{EXTENSIONS}/{asked['extension']['id']}/decide", json={"approve": True}, headers=FETCH)
        today = (await sana.get("/api/v1/student/today")).json()

    lab = next(d for d in today["due"] if d["title"] == "Lab 1")
    assert lab["status"] == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("link", ["ftp://files.example.edu/report.pdf", "https://example.edu/" + "a" * 500])
async def test_links_must_be_short_web_addresses(stack, world, coursework, link):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await _submit(sana, coursework["open"], link=link)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_zero_point_rubric_needs_an_explicit_score(stack, world, coursework):  # noqa: F811
    async with stack.session("learning") as s:
        assignment = await s.get(Assignment, coursework["rubric"])
        assignment.rubric = [{"criterion": "Effort", "description": "Took part", "points": 0}]
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, coursework["rubric"])
    submission = await _submission(stack, coursework["rubric"])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        url = f"{GRADING}/{submission.id}/grade"
        rubric_only = await tara.post(url, json={"rubricScores": [{"criterion": "Effort", "points": 0}]},
                                      headers=FETCH)
        with_score = await tara.post(url, json={"rubricScores": [{"criterion": "Effort", "points": 0}],
                                                "score": 15}, headers=FETCH)

    assert rubric_only.status_code == 422
    assert with_score.status_code == 200 and with_score.json()["work"]["score"] == 15.0


@pytest.mark.asyncio
async def test_the_list_keeps_the_latest_assignments_when_it_is_long(stack, world, coursework, monkeypatch):  # noqa: F811
    monkeypatch.setattr(coursework_module, "LIST_LIMIT", 3)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        items = (await sana.get(MINE)).json()["items"]

    titles = [i["title"] for i in items]
    assert "Old quiz" not in titles and len(titles) == 3
    assert [i["dueAt"] for i in items] == sorted(i["dueAt"] for i in items)
