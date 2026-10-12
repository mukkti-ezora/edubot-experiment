"""Schedule: unified calendar, attendance maths, check-in codes, leave and the private calendar feed."""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from services.gateway.tests.conftest import audit_rows
from services.gateway.tests.test_doubts import FETCH, _signed_in, world  # noqa: F401
from services.learning.models import (
    Assessment,
    Assignment,
    AttendanceRecord,
    ClassSession,
    Course,
    LeaveRequest,
)
from services.learning.schedule import can_miss, must_attend

SCHEDULE = "/api/v1/student/schedule"
ATTENDANCE = "/api/v1/student/attendance"
CHECKIN = "/api/v1/student/attendance/checkin"
LEAVE = "/api/v1/student/leave"
SESSIONS = "/api/v1/teacher/sessions"
LEAVE_INBOX = "/api/v1/teacher/requests/leave"


# ---- pure attendance maths ----

@pytest.mark.parametrize("attended,denominator,remaining,threshold,expected", [
    (3, 4, 0, 75, 0),  # exactly at the threshold with nothing left: no slack
    (8, 10, 10, 75, 3),  # (8 + 10 - 3) / 20 = 75%
    (0, 0, 4, 75, 1),  # nothing held yet: 3 of 4 keeps 75%
    (2, 10, 2, 75, 0),  # already below and can't recover: never negative
])
def test_can_miss(attended, denominator, remaining, threshold, expected):
    assert can_miss(attended, denominator, remaining, threshold) == expected


@pytest.mark.parametrize("attended,denominator,threshold,expected", [
    (3, 4, 75, 0),  # at the threshold: nothing to make up
    (5, 8, 75, 4),  # (5 + 4) / (8 + 4) = 75%; 3 more would give 8 / 11 = 72.7%
    (7, 10, 75, 2),  # (7 + 2) / 12 = 75%
    (0, 0, 75, 0),  # nothing held
])
def test_must_attend(attended, denominator, threshold, expected):
    assert must_attend(attended, denominator, threshold) == expected


# ---- fixtures ----

@pytest.fixture(autouse=True)
def fresh_checkin_budget(stack):
    stack.apps["learning"].state.checkin_limiter.reset()


@pytest.fixture
async def classes(stack, world):  # noqa: F811
    """Six held PHY101 classes in the past (Sana attended four, one excused, one with no record),
    two scheduled ahead, one cancelled, and one running today."""
    now = datetime.now(UTC).replace(microsecond=0)
    async with stack.session("learning") as s:
        course = await s.get(Course, world["phy"])
        section, institution = course.section_id, course.institution_id

        def session(days: float, status: str = "held") -> ClassSession:
            start = now + timedelta(days=days)
            return ClassSession(institution_id=institution, section_id=section, course_id=course.id,
                                starts_at=start, ends_at=start + timedelta(hours=1), room="L-101",
                                kind="lecture", status=status)

        held = [session(-d) for d in (14, 12, 10, 7, 5, 3)]
        ahead = [session(2, "scheduled"), session(4, "scheduled")]
        cancelled = session(1, "cancelled")
        today = session(0.0, "scheduled")
        s.add_all([*held, *ahead, cancelled, today])
        await s.flush()
        statuses = ["present", "present", "late", "on_duty", "excused"]  # the sixth has no record: absent
        s.add_all([AttendanceRecord(institution_id=institution, session_id=held[i].id, person_id=world["sana"],
                                    status=status, source="teacher") for i, status in enumerate(statuses)])
        s.add_all([
            Assignment(institution_id=institution, course_id=course.id, title="Problem set 3", kind="assignment",
                       due_at=now + timedelta(days=3), points=10),
            Assessment(institution_id=institution, course_id=course.id, title="Kinematics quiz", kind="quiz",
                       opens_at=now + timedelta(days=1), closes_at=now + timedelta(days=2)),
            Assessment(institution_id=institution, course_id=course.id, title="Someone's practice",
                       kind="practice", owner_id=world["sam"], opens_at=now + timedelta(days=1)),
        ])
        await s.commit()
    return {"held": [h.id for h in held], "ahead": [a.id for a in ahead], "cancelled": cancelled.id,
            "today": today.id, "section": section, "now": now}


# ---- the student's schedule ----

@pytest.mark.asyncio
async def test_schedule_combines_classes_deadlines_and_tests(stack, world, classes):  # noqa: F811
    start = classes["now"].date()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        events = (await sana.get(SCHEDULE, params={"from": str(start), "to": str(start + timedelta(days=6))})).json()

    kinds = sorted({e["type"] for e in events["events"]})
    titles = [e["title"] for e in events["events"]]
    assert kinds == ["assessment", "class", "due"]
    assert "Problem set 3" in titles and "Kinematics quiz" in titles
    assert "Someone's practice" not in titles  # another student's private practice set
    assert any(e["type"] == "class" and e["status"] == "cancelled" for e in events["events"])


@pytest.mark.asyncio
@pytest.mark.parametrize("days,ok", [(62, True), (63, False), (-1, False)])
async def test_schedule_range_is_bounded(stack, world, days, ok):  # noqa: F811
    start = date(2026, 10, 1)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.get(SCHEDULE, params={"from": str(start), "to": str(start + timedelta(days=days))})

    assert (response.status_code == 200) is ok


# ---- attendance ----

@pytest.mark.asyncio
async def test_attendance_counts_on_duty_and_late_and_drops_excused(stack, world, classes):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        course = (await sana.get(ATTENDANCE)).json()["courses"][0]

    # 6 held, 1 excused -> 5 counted; present, present, late, on duty -> 4 attended; 1 with no record -> absent
    assert (course["held"], course["excused"], course["attended"], course["absent"]) == (6, 1, 4, 1)
    assert course["percentage"] == 80.0
    assert course["remaining"] == 3  # two ahead plus today's, which isn't over (cancelled doesn't count)
    assert course["canMiss"] == 1  # missing 1 of 3 leaves (4 + 2) / (5 + 3) = 75%
    assert course["belowThreshold"] is False


@pytest.mark.asyncio
async def test_below_threshold_says_how_many_classes_to_attend(stack, world, classes):  # noqa: F811
    async with stack.session("learning") as s:
        for record in (await s.execute(select(AttendanceRecord))).scalars():
            if record.status in ("late", "on_duty"):
                record.status = "absent"
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        course = (await sana.get(ATTENDANCE)).json()["courses"][0]

    # 2 attended of 5 counted = 40%; (2 + n) / (5 + n) >= 75% needs n = 7, but only 3 classes remain
    assert course["belowThreshold"] is True
    assert course["mustAttend"] == 7
    assert course["reachable"] is False


# ---- check-in codes ----

async def _open_code(stack, session_id) -> str:
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        opened = await tara.post(f"{SESSIONS}/{session_id}/checkin", headers=FETCH)
    assert opened.status_code == 200, opened.text
    return opened.json()["code"]


@pytest.mark.asyncio
async def test_checking_in_with_the_teachers_code_marks_you_present(stack, world, classes):  # noqa: F811
    code = await _open_code(stack, classes["today"])
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        first = await sana.post(CHECKIN, json={"code": code}, headers=FETCH)
        again = await sana.post(CHECKIN, json={"code": code}, headers=FETCH)

    assert first.status_code == 200 and first.json()["status"] == "present"
    assert first.json()["alreadyMarked"] is False
    assert again.json()["status"] == "present" and again.json()["alreadyMarked"] is True  # idempotent
    async with stack.session("learning") as s:
        records = (await s.execute(select(AttendanceRecord).where(
            AttendanceRecord.session_id == classes["today"]))).scalars().all()
    assert [(r.status, r.source) for r in records] == [("present", "checkin")]


@pytest.mark.asyncio
async def test_a_code_expired_by_one_second_is_refused(stack, world, classes):  # noqa: F811
    code = await _open_code(stack, classes["today"])
    async with stack.session("learning") as s:
        row = await s.get(ClassSession, classes["today"])
        row.checkin_open_until = datetime.now(UTC) - timedelta(seconds=1)
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(CHECKIN, json={"code": code}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_guessing_codes_is_rate_limited(stack, world, classes):  # noqa: F811
    await _open_code(stack, classes["today"])
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        statuses = [(await sana.post(CHECKIN, json={"code": f"{i:06d}"}, headers=FETCH)).status_code
                    for i in range(11)]

    assert set(statuses[:10]) <= {422, 200}
    assert statuses[10] == 429


@pytest.mark.asyncio
@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef"])
async def test_codes_must_be_six_digits(stack, world, code):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(CHECKIN, json={"code": code}, headers=FETCH)

    assert response.status_code == 422


# ---- leave ----

SOON = date.today() + timedelta(days=21)  # well inside the window students may ask leave for


def _leave(start: date, days: int, kind: str = "medical") -> dict:
    return {"kind": kind, "fromDate": str(start), "toDate": str(start + timedelta(days=days - 1)),
            "reason": "Fever"}


@pytest.mark.asyncio
@pytest.mark.parametrize("days,status", [(30, 201), (31, 422), (0, 422)])
async def test_leave_can_cover_up_to_thirty_days(stack, world, days, status):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(LEAVE, json=_leave(SOON, days), headers=FETCH)

    assert response.status_code == status


@pytest.mark.asyncio
async def test_overlapping_leave_is_refused(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await sana.post(LEAVE, json=_leave(SOON, 3), headers=FETCH)
        overlap = await sana.post(LEAVE, json=_leave(SOON + timedelta(days=2), 2), headers=FETCH)
        listing = (await sana.get(LEAVE)).json()

    assert overlap.status_code == 409
    assert [item["days"] for item in listing["items"]] == [3]


@pytest.mark.asyncio
async def test_teachers_see_leave_only_from_their_students(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await sana.post(LEAVE, json=_leave(SOON, 2), headers=FETCH)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        mine = (await tara.get(LEAVE_INBOX)).json()
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        other = (await omar.get(LEAVE_INBOX)).json()

    assert [item["student"]["name"] for item in mine["items"]] == ["Sana Okafor"]
    assert other["items"] == []


@pytest.mark.asyncio
async def test_approved_leave_excuses_classes_but_keeps_teacher_marks(stack, world, classes):  # noqa: F811
    held = classes["held"]
    async with stack.session("learning") as s:
        sixth = await s.get(ClassSession, held[5])  # no record yet
        first = await s.get(ClassSession, held[0])  # teacher marked present
        span = (first.starts_at.date(), sixth.starts_at.date())
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        leave = (await sana.post(LEAVE, json={"kind": "medical", "fromDate": str(span[0]), "toDate": str(span[1]),
                                              "reason": "Hospital"}, headers=FETCH)).json()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        decided = await tara.post(f"{LEAVE_INBOX}/{leave['id']}/decide", json={"approve": True}, headers=FETCH)
        twice = await tara.post(f"{LEAVE_INBOX}/{leave['id']}/decide", json={"approve": False}, headers=FETCH)

    async with stack.session("learning") as s:
        records = {r.session_id: (r.status, r.source) for r in (await s.execute(select(AttendanceRecord))).scalars()}
        row = await s.get(LeaveRequest, uuid.UUID(leave["id"]))
    assert decided.status_code == 200 and row.status == "approved"
    assert decided.json()["excusedSessions"] == 1  # five of the six already carry teacher marks, which stay
    assert records[held[0]] == ("present", "teacher")
    assert records[held[5]] == ("excused", "leave")
    assert twice.status_code == 409
    assert ("leave.decide", "success", "tara@ashf.example.edu") in await audit_rows(stack)


# ---- teacher sessions ----

@pytest.mark.asyncio
async def test_teacher_takes_attendance_for_todays_class(stack, world, classes):  # noqa: F811
    today = classes["now"].date()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        day = (await tara.get(SESSIONS, params={"date": str(today)})).json()
        session = next(s for s in day["sessions"] if s["id"] == str(classes["today"]))
        marked = await tara.post(f"{SESSIONS}/{classes['today']}/attendance", headers=FETCH, json={"records": [
            {"personId": str(world["sana"]), "status": "present"},
            {"personId": str(world["sam"]), "status": "absent"},
        ]})

    assert sorted(m["name"] for m in session["roster"]) == ["Sam Okafor", "Sana Okafor"]
    assert marked.status_code == 200 and marked.json()["status"] == "held"
    assert ("attendance.mark", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_attendance_only_for_students_on_the_roster(stack, world, classes):  # noqa: F811
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        response = await tara.post(f"{SESSIONS}/{classes['today']}/attendance", headers=FETCH, json={
            "records": [{"personId": str(world["omar"]), "status": "present"}]})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_teachers_cannot_touch_another_class(stack, world, classes):  # noqa: F811
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        mark = await omar.post(f"{SESSIONS}/{classes['today']}/attendance", headers=FETCH,
                               json={"records": []})
        code = await omar.post(f"{SESSIONS}/{classes['today']}/checkin", headers=FETCH)

    assert (mark.status_code, code.status_code) == (404, 404)


@pytest.mark.asyncio
async def test_students_cannot_open_teacher_sessions(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.get(SESSIONS)

    assert response.status_code == 403


# ---- calendar feed ----

@pytest.mark.asyncio
async def test_calendar_feed_serves_valid_icalendar(stack, world, classes):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        feed = (await sana.post("/api/v1/student/calendar-feed", headers=FETCH)).json()
        ics = await sana.get(feed["url"])

    body = ics.content
    lines = body.split(b"\r\n")
    assert ics.headers["content-type"].startswith("text/calendar")
    assert lines[0] == b"BEGIN:VCALENDAR" and b"END:VCALENDAR" in lines
    assert b"\n" not in body.replace(b"\r\n", b"")  # CRLF only
    assert all(len(line) <= 75 for line in lines)  # folded
    assert body.count(b"BEGIN:VEVENT") >= 4
    assert b"SUMMARY:PHY101" in body


@pytest.mark.asyncio
async def test_rotating_the_feed_revokes_the_old_link(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        old = (await sana.post("/api/v1/student/calendar-feed", headers=FETCH)).json()
        await sana.post("/api/v1/student/calendar-feed", headers=FETCH)
        stale = await sana.get(old["url"])

    assert stale.status_code == 404


@pytest.mark.asyncio
async def test_days_are_the_institutions_local_days(stack, world):  # noqa: F811
    """00:30 IST on 12 Oct is still 11 Oct in UTC: it belongs to the 12th for an Indian institution."""
    early = datetime(2026, 10, 11, 19, 0, tzinfo=UTC)  # 00:30 IST, 12 Oct
    async with stack.session("learning") as s:
        course = await s.get(Course, world["phy"])
        s.add(ClassSession(institution_id=course.institution_id, section_id=course.section_id, course_id=course.id,
                           starts_at=early, ends_at=early + timedelta(hours=1), kind="lecture", status="scheduled"))
        await s.commit()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        on_12th = (await tara.get("/api/v1/teacher/sessions", params={"date": "2026-10-12"})).json()
        on_11th = (await tara.get("/api/v1/teacher/sessions", params={"date": "2026-10-11"})).json()

    assert len(on_12th["sessions"]) == 1
    assert on_11th["sessions"] == []


# ---- review fixes ----

@pytest.mark.asyncio
async def test_a_teacher_already_marked_you_check_in_says_so(stack, world, classes):  # noqa: F811
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.post(f"{SESSIONS}/{classes['today']}/attendance", headers=FETCH,
                        json={"records": [{"personId": str(world["sana"]), "status": "absent"}]})
    code = await _open_code(stack, classes["today"])
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = (await sana.post(CHECKIN, json={"code": code}, headers=FETCH)).json()

    assert response["alreadyMarked"] is True and response["status"] == "absent"


@pytest.mark.asyncio
async def test_cancelled_classes_refuse_check_in(stack, world, classes):  # noqa: F811
    code = await _open_code(stack, classes["today"])
    async with stack.session("learning") as s:
        (await s.get(ClassSession, classes["today"])).status = "cancelled"
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(CHECKIN, json={"code": code}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_check_in_codes_are_stored_keyed_not_as_plain_hashes(stack, world, classes):  # noqa: F811
    import hashlib

    code = await _open_code(stack, classes["today"])
    async with stack.session("learning") as s:
        stored = (await s.get(ClassSession, classes["today"])).checkin_code_hash

    assert stored and stored != hashlib.sha256(code.encode()).hexdigest()


@pytest.mark.asyncio
@pytest.mark.parametrize("which,status", [("cancelled", 409), ("ahead", 409)])
async def test_attendance_only_for_classes_that_happened(stack, world, classes, which, status):  # noqa: F811
    session_id = classes["cancelled"] if which == "cancelled" else classes["ahead"][0]
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        response = await tara.post(f"{SESSIONS}/{session_id}/attendance", headers=FETCH,
                                   json={"records": [{"personId": str(world["sana"]), "status": "present"}]})

    assert response.status_code == status


@pytest.mark.asyncio
async def test_a_student_listed_twice_is_refused(stack, world, classes):  # noqa: F811
    mark = {"personId": str(world["sana"]), "status": "present"}
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        response = await tara.post(f"{SESSIONS}/{classes['today']}/attendance", headers=FETCH,
                                   json={"records": [mark, {**mark, "status": "absent"}]})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_classes_excused_by_leave_ahead_are_not_counted_as_remaining(stack, world, classes):  # noqa: F811
    async with stack.session("learning") as s:
        ahead = (await s.get(ClassSession, classes["ahead"][0])).starts_at.date()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        leave = (await sana.post(LEAVE, json={"kind": "medical", "fromDate": str(ahead), "toDate": str(ahead),
                                              "reason": "Surgery"}, headers=FETCH)).json()
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            await tara.post(f"{LEAVE_INBOX}/{leave['id']}/decide", json={"approve": True}, headers=FETCH)
        course = (await sana.get(ATTENDANCE)).json()["courses"][0]

    assert course["remaining"] == 2  # three ahead, one excused by approved leave


@pytest.mark.asyncio
async def test_leave_is_refused_when_the_students_classes_cannot_be_found(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        leave = (await sana.post(LEAVE, json=_leave(SOON, 2), headers=FETCH)).json()
    users = stack.apps["learning"].state.users
    original_get = users.get

    async def no_classes_for_sana(path, **kwargs):  # noqa: ANN001, ANN003, ANN202
        if path == f"/internal/people/{world['sana']}/classes":
            return {"classes": []}
        return await original_get(path, **kwargs)

    users.get = no_classes_for_sana
    try:
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            decided = await tara.post(f"{LEAVE_INBOX}/{leave['id']}/decide", json={"approve": True}, headers=FETCH)
    finally:
        users.get = original_get

    async with stack.session("learning") as s:
        row = await s.get(LeaveRequest, uuid.UUID(leave["id"]))
    assert decided.status_code == 409 and row.status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("offset_from,offset_to,status", [
    (-30, -30, 201), (-31, -31, 422), (180, 180, 201), (179, 181, 422),
])
async def test_leave_dates_stay_within_a_sensible_window(stack, world, offset_from, offset_to, status):  # noqa: F811
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    body = {"kind": "leave", "fromDate": str(today + timedelta(days=offset_from)),
            "toDate": str(today + timedelta(days=offset_to)), "reason": "Family"}
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(LEAVE, json=body, headers=FETCH)

    assert response.status_code == status


@pytest.mark.asyncio
async def test_calendar_text_cannot_inject_lines(stack, world, classes):  # noqa: F811
    async with stack.session("learning") as s:
        row = await s.get(ClassSession, classes["ahead"][0])
        row.room = "L-101\rX-INJECTED:1"
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        feed = (await sana.post("/api/v1/student/calendar-feed", headers=FETCH)).json()
        body = (await sana.get(feed["url"])).content

    assert b"\rX-INJECTED" not in body and b"\nX-INJECTED" not in body
    assert b"L-101\\nX-INJECTED" in body


@pytest.mark.asyncio
async def test_an_event_at_midnight_belongs_to_one_day(stack, world):  # noqa: F811
    zone = ZoneInfo("Asia/Kolkata")
    first = datetime.now(zone).date() + timedelta(days=3)
    midnight = datetime.combine(first + timedelta(days=1), datetime.min.time(), tzinfo=zone)
    async with stack.session("learning") as s:
        course = await s.get(Course, world["phy"])
        s.add(Assessment(institution_id=course.institution_id, course_id=course.id, title="Midnight quiz",
                         kind="quiz", opens_at=midnight, closes_at=midnight + timedelta(hours=2)))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        day_one = (await sana.get(SCHEDULE, params={"from": str(first), "to": str(first)})).json()
        day_two = (await sana.get(SCHEDULE, params={"from": str(first + timedelta(days=1)),
                                                    "to": str(first + timedelta(days=1))})).json()

    assert "Midnight quiz" not in [e["title"] for e in day_one["events"]]
    assert "Midnight quiz" in [e["title"] for e in day_two["events"]]
