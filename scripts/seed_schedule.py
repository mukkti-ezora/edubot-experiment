"""Demo data for the schedule area (Ashford). Called from scripts/seed.py inside the learning seed.

A weekly timetable per class, eight weeks of held classes with attendance and six weeks ahead, classes today
for every demo section, and leave for Ingrid. Ingrid sits near 82% in PHY101 but below 75% in CS110, so the
"classes you must attend" message has something to show.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
WEEKS_BACK, WEEKS_AHEAD = 8, 6
INGRID, KWAME = "ingrid.abiodun@ashf.example.edu", "kwame.abiodun@ashf.example.edu"

# section -> [(weekday 0=Mon, IST start, minutes, room, kind)]
TIMETABLE = {
    "PHY101-A": [(0, time(9), 60, "L-101", "lecture"), (2, time(9), 60, "L-101", "lecture"),
                 (4, time(9), 60, "L-101", "lecture"), (3, time(14), 120, "Physics Lab 2", "lab")],
    "MTH201-B": [(0, time(11), 60, "L-204", "lecture"), (1, time(11), 60, "L-204", "lecture"),
                 (3, time(11), 60, "L-204", "lecture")],
    "CS110-A": [(1, time(14), 60, "L-301", "lecture"), (4, time(11), 60, "L-301", "lecture"),
                (2, time(14), 120, "CS Lab 1", "lab")],
}
# Classes on the seed day, at fixed UTC hours so they always fall on "today": section -> (UTC hour, room, kind)
TODAY = {"PHY101-A": (4, "L-101", "lecture"), "MTH201-B": (6, "L-204", "lecture"),
         "CS110-A": (9, "CS Lab 1", "lab")}
# student -> section -> share of held classes attended
RATES = {INGRID: {"PHY101-A": 0.82, "CS110-A": 0.70}, KWAME: {"MTH201-B": 0.9, "CS110-A": 0.92}}
OTHER_STUDENT_RATES = (0.95, 0.88, 0.8, 0.74, 0.91, 0.67, 0.86)
MEDICAL_LEAVE_DAYS_AGO = (20, 19)
ON_DUTY_DAYS_AHEAD = (5, 6)


def _attends(index: int, rate: float) -> bool:
    """Spreads attendance evenly: attends the k-th class when the running total of `rate` steps up."""
    return math.floor((index + 1) * rate) > math.floor(index * rate)


def _rosters(by_email: dict[str, dict], class_sections) -> dict[str, list[str]]:  # noqa: ANN001
    """The same deterministic roster scripts/seed.py builds for each section."""
    pool = sorted(p["email"] for p in by_email.values() if p["inst_code"] == "ASHF" and p["type"] == "student")
    rosters, offset = {}, 0
    for code, _, _, demo_students, extra in class_sections:
        extras = [e for e in pool[offset:offset + extra + len(demo_students)] if e not in demo_students][:extra]
        offset += extra
        rosters[code] = demo_students + extras
    return rosters


async def seed(session, by_email: dict[str, dict], ashford) -> None:  # noqa: ANN001
    from scripts.seed import ANCHOR, CLASS_SECTIONS, uid
    from services.learning.models import AttendanceRecord, ClassMeeting, ClassSession, LeaveRequest

    course_of = {"PHY101-A": uid("course:PHY101"), "MTH201-B": uid("course:MTH201"), "CS110-A": uid("course:CS110")}
    rosters = _rosters(by_email, CLASS_SECTIONS)
    today = ANCHOR.astimezone(UTC).date()
    medical = (today - timedelta(days=MEDICAL_LEAVE_DAYS_AGO[0]), today - timedelta(days=MEDICAL_LEAVE_DAYS_AGO[1]))

    for code, slots in TIMETABLE.items():
        section, course = uid(f"class:{code}"), course_of[code]
        for weekday, start, minutes, room, kind in slots:
            end = (datetime.combine(date.min, start) + timedelta(minutes=minutes)).time()
            session.add(ClassMeeting(id=uid(f"meeting:{code}:{weekday}:{start}"), institution_id=ashford,
                                     section_id=section, course_id=course, weekday=weekday, starts_at=start,
                                     ends_at=end, room=room, kind=kind))

        sessions = _term_sessions(code, slots, today, uid)
        hour, room, kind = TODAY[code]
        start_today = datetime.combine(today, time(hour), tzinfo=UTC)
        sessions.append((uid(f"class-session:{code}:today"), start_today, start_today + timedelta(hours=1), room,
                         kind))
        cancelled_id = next((sid for sid, start, *_ in sessions if start.date() > today), None)
        if cancelled_id is None:
            raise RuntimeError(f"seed_schedule: {code} has no class after today to show as cancelled")
        held_index: dict[str, int] = {}
        records = []  # added after the classes are flushed: attendance rows reference them
        for session_id, start, end, room, kind in sessions:
            is_held = end < ANCHOR and start.date() != today
            status = "cancelled" if session_id == cancelled_id else "held" if is_held else "scheduled"
            session.add(ClassSession(id=session_id, institution_id=ashford, section_id=section, course_id=course,
                                     starts_at=start, ends_at=end, room=room, kind=kind, status=status))
            if status != "held":
                continue
            for n, email in enumerate(rosters[code]):
                on_leave = email == INGRID and medical[0] <= start.date() <= medical[1]
                rate = RATES.get(email, {}).get(code, OTHER_STUDENT_RATES[n % len(OTHER_STUDENT_RATES)])
                index = held_index.get(email, 0)
                if not on_leave:
                    held_index[email] = index + 1
                record_status = ("excused" if on_leave
                                 else ("late" if index % 7 == 3 else "present") if _attends(index, rate)
                                 else "absent")
                records.append(AttendanceRecord(
                    id=uid(f"attendance:{session_id}:{email}"), institution_id=ashford, session_id=session_id,
                    person_id=by_email[email]["id"], status=record_status,
                    source="leave" if on_leave else "teacher", marked_at=end,
                ))
        await session.flush()
        session.add_all(records)
        await session.flush()

    ingrid = by_email[INGRID]["id"]
    session.add_all([
        LeaveRequest(id=uid("leave:ingrid:medical"), institution_id=ashford, person_id=ingrid, kind="medical",
                     from_date=medical[0], to_date=medical[1], reason="Viral fever; doctor's note attached at the office.",
                     status="approved", decided_by=by_email["leila.abiodun@ashf.example.edu"]["id"],
                     decided_at=ANCHOR - timedelta(days=MEDICAL_LEAVE_DAYS_AGO[0] + 1),
                     created_at=ANCHOR - timedelta(days=MEDICAL_LEAVE_DAYS_AGO[0] + 2)),
        LeaveRequest(id=uid("leave:ingrid:on-duty"), institution_id=ashford, person_id=ingrid, kind="on_duty",
                     from_date=today + timedelta(days=ON_DUTY_DAYS_AHEAD[0]),
                     to_date=today + timedelta(days=ON_DUTY_DAYS_AHEAD[1]),
                     reason="Representing the college at the inter-university hackathon.", status="pending",
                     created_at=ANCHOR - timedelta(hours=6)),
    ])
    await session.flush()


def _term_sessions(code: str, slots, today: date, uid) -> list[tuple]:  # noqa: ANN001
    """Weekly classes from eight weeks back to six weeks ahead, skipping today (it gets explicit classes)."""
    first = today - timedelta(weeks=WEEKS_BACK)
    sessions = []
    for offset in range((WEEKS_BACK + WEEKS_AHEAD) * 7 + 1):
        day = first + timedelta(days=offset)
        if day == today:
            continue
        for weekday, start, minutes, room, kind in slots:
            if day.weekday() != weekday:
                continue
            starts = datetime.combine(day, start, tzinfo=IST).astimezone(UTC)
            sessions.append((uid(f"class-session:{code}:{starts.isoformat()}"), starts,
                             starts + timedelta(minutes=minutes), room, kind))
    return sessions
