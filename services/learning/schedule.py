"""Schedule: timetable, calendar (with a private ICS feed), attendance with check-in codes and shortage maths,
and leave requests.

Attendance rules: present, late and on-duty count as attended; excused classes leave the denominator; a held
class with no record for a student counts as absent. Calendar days are the institution's local days (OD-12).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import Field, StringConstraints
from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import db
from services.learning.enrolment import Enrolment, my_courses, student_enrolment, teacher_enrolment
from services.learning.files import describe_many, owned_attachments
from services.learning.models import (
    Assessment,
    Assignment,
    AttendanceRecord,
    CalendarFeed,
    ClassSession,
    Course,
    LearningEvent,
    LeaveRequest,
)
from services.shared.audit import AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import Conflict, NotFound, RateLimited, ValidationFailed
from services.shared.schemas import CamelModel

router = APIRouter()
log = logging.getLogger(__name__)

ATTENDED = frozenset({"present", "late", "on_duty"})
MAX_RANGE_DAYS = 62
DEFAULT_RANGE_DAYS = 6
FEED_DAYS = 60
MAX_LEAVE_DAYS = 30
LEAVE_PAST_DAYS = 30  # leave can be asked for after the fact, but not for last term
LEAVE_AHEAD_DAYS = 180
CHECKIN_ATTEMPTS = 10
CHECKIN_WINDOW_SECONDS = 600
ICS_LINE_OCTETS = 75
RECENT_RECORDS = 10
PERCENT = 100

AttendanceStatus = Literal["present", "late", "absent", "excused", "on_duty"]
LeaveKind = Literal["leave", "medical", "on_duty"]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


# ---- attendance maths (pure) ----

def can_miss(attended: int, denominator: int, remaining: int, threshold_percent: int) -> int:
    """The most of the remaining classes a student can miss and still finish at or above the threshold."""
    slack = (PERCENT * (attended + remaining) - threshold_percent * (denominator + remaining)) // PERCENT
    return max(0, min(slack, remaining))


def must_attend(attended: int, denominator: int, threshold_percent: int) -> int:
    """How many classes in a row a student below the threshold must attend to get back to it (0 if not below)."""
    shortfall = threshold_percent * denominator - PERCENT * attended
    if shortfall <= 0:
        return 0
    per_class = PERCENT - threshold_percent
    return -(-shortfall // per_class)  # ceiling division


def _percentage(attended: int, denominator: int) -> float | None:
    return round(PERCENT * attended / denominator, 1) if denominator else None


@dataclass(frozen=True)
class Tally:
    held: int
    attended: int
    excused: int
    remaining: int  # future classes the student still has to choose to attend
    committed: int = 0  # future classes already on duty: they will count as attended

    @property
    def denominator(self) -> int:
        return self.held - self.excused

    def summary(self, threshold_percent: int) -> dict:
        denominator = self.denominator
        below = denominator > 0 and PERCENT * self.attended < threshold_percent * denominator
        needed = must_attend(self.attended, denominator, threshold_percent)
        return {
            "held": self.held, "attended": self.attended, "excused": self.excused,
            "absent": denominator - self.attended, "percentage": _percentage(self.attended, denominator),
            "remaining": self.remaining, "belowThreshold": below,
            "canMiss": can_miss(self.attended + self.committed, denominator + self.committed, self.remaining,
                                threshold_percent),
            "mustAttend": needed, "reachable": needed <= self.remaining,
        }


# ---- shared queries ----

def _hash(secret: str) -> str:
    """For 256-bit random tokens (calendar feeds): a plain hash is enough to make a leaked row useless."""
    return hashlib.sha256(secret.encode()).hexdigest()


def _code_digest(request: Request, code: str) -> str:
    """Six-digit codes are guessable from a plain hash, so they are keyed with a server secret."""
    key = request.app.state.settings.internal_token.encode()
    return hmac.new(key, code.encode(), hashlib.sha256).hexdigest()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _sessions(session: AsyncSession, institution_id: uuid.UUID, section_ids: frozenset[uuid.UUID],
                    *conditions) -> list[ClassSession]:  # noqa: ANN002
    if not section_ids:
        return []
    return list((await session.execute(
        select(ClassSession)
        .where(ClassSession.institution_id == institution_id, ClassSession.section_id.in_(section_ids), *conditions)
        .order_by(ClassSession.starts_at)
    )).scalars())


async def _records(session: AsyncSession, person_id: uuid.UUID, session_ids: list[uuid.UUID]
                   ) -> dict[uuid.UUID, AttendanceRecord]:
    if not session_ids:
        return {}
    return {r.session_id: r for r in (await session.execute(
        select(AttendanceRecord).where(AttendanceRecord.person_id == person_id,
                                       AttendanceRecord.session_id.in_(session_ids))
    )).scalars()}


def _tally(sessions: list[ClassSession], records: dict[uuid.UUID, AttendanceRecord], now: datetime) -> Tally:
    held = [s for s in sessions if s.status == "held"]
    statuses = [records[s.id].status if s.id in records else "absent" for s in held]
    ahead = [records[s.id].status if s.id in records else None
             for s in sessions if s.status == "scheduled" and s.ends_at > now]
    return Tally(held=len(held), attended=sum(status in ATTENDED for status in statuses),
                 excused=statuses.count("excused"), remaining=ahead.count(None),
                 committed=ahead.count("on_duty"))


def _course_ref(course: Course) -> dict:
    return {"courseId": str(course.id), "courseCode": course.code, "courseTitle": course.title,
            "subject": course.subject}


def _class_event(row: ClassSession, course: Course, record: AttendanceRecord | None) -> dict:
    return {
        "id": str(row.id), "type": "class", "title": f"{course.code} {row.kind}", **_course_ref(course),
        "startsAt": _iso(row.starts_at), "endsAt": _iso(row.ends_at), "room": row.room, "kind": row.kind,
        "status": row.status, "attendance": record.status if record else None,
    }


def _trail(me: Enrolment, ctx: RequestContext, kind: str, detail: dict, course_id: uuid.UUID | None = None
           ) -> LearningEvent:
    return LearningEvent(institution_id=me.institution_id, person_id=me.person_id, session_id=ctx.session_id,
                         kind=kind, course_id=course_id, detail=detail)


async def _audit(request: Request, ctx: RequestContext, action: str, target_type: str, target_id: uuid.UUID,
                 label: str, institution_id: uuid.UUID) -> None:
    await request.app.state.audit.emit(ctx, AuditEvent(action=action, target_type=target_type,
                                                       target_id=target_id, target_label=label,
                                                       institution_id=institution_id))


# ---- local calendar days ----

def local_zone(request: Request) -> ZoneInfo:
    return ZoneInfo(request.app.state.settings.institution_timezone)


def day_bounds(first: date, last: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    """From the start of `first` to the end of `last`, as the institution's local days."""
    return (datetime.combine(first, time.min, tzinfo=zone),
            datetime.combine(last + timedelta(days=1), time.min, tzinfo=zone))


# ---- helpers for /student/today ----

async def today_classes(session: AsyncSession, me: Enrolment, now: datetime, zone: ZoneInfo) -> list[dict]:
    """The student's classes on today's local calendar day, with their attendance so far."""
    today = now.astimezone(zone).date()
    day_start, day_end = day_bounds(today, today, zone)
    courses = {c.id: c for c in await my_courses(session, me)}
    rows = await _sessions(session, me.institution_id, me.section_ids, ClassSession.starts_at >= day_start,
                           ClassSession.starts_at < day_end)
    records = await _records(session, me.person_id, [r.id for r in rows])
    return [_class_event(r, courses[r.course_id], records.get(r.id)) for r in rows if r.course_id in courses]


async def attendance_alerts(session: AsyncSession, me: Enrolment, threshold_percent: int, now: datetime
                            ) -> list[dict]:
    """Courses where the student is below the threshold, or one more absence away from it."""
    alerts = []
    for course, tally in await _course_tallies(session, me, now):
        summary = tally.summary(threshold_percent)
        if summary["belowThreshold"]:
            alerts.append({**_course_ref(course), "level": "below", **summary})
        elif tally.denominator and summary["canMiss"] == 0 and tally.remaining:
            alerts.append({**_course_ref(course), "level": "at_risk", **summary})
    return alerts


async def _course_tallies(session: AsyncSession, me: Enrolment, now: datetime) -> list[tuple[Course, Tally]]:
    courses = await my_courses(session, me)
    rows = await _sessions(session, me.institution_id, me.section_ids)
    records = await _records(session, me.person_id, [r.id for r in rows])
    return [(course, _tally([r for r in rows if r.course_id == course.id], records, now)) for course in courses]


# ---- student: schedule ----

@router.get("/student/schedule")
async def student_schedule(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> dict:
    """Classes, deadlines and test windows between two dates (inclusive), at most 62 days apart."""
    me = await student_enrolment(request, ctx)
    zone = local_zone(request)
    start = start or datetime.now(zone).date()
    end = end or start + timedelta(days=DEFAULT_RANGE_DAYS)
    if end < start or (end - start).days > MAX_RANGE_DAYS:
        raise ValidationFailed(f"Choose a range of up to {MAX_RANGE_DAYS} days.")
    window_start, window_end = day_bounds(start, end, zone)
    events = await _events(session, me, window_start, window_end)
    return {"from": str(start), "to": str(end), "events": events}


async def _events(session: AsyncSession, me: Enrolment, window_start: datetime, window_end: datetime) -> list[dict]:
    courses = {c.id: c for c in await my_courses(session, me)}
    rows = await _sessions(session, me.institution_id, me.section_ids, ClassSession.starts_at >= window_start,
                           ClassSession.starts_at < window_end)
    records = await _records(session, me.person_id, [r.id for r in rows])
    events = [_class_event(r, courses[r.course_id], records.get(r.id)) for r in rows if r.course_id in courses]
    if courses:
        events += [_due_event(a, courses[a.course_id]) for a in (await session.execute(
            select(Assignment).where(Assignment.course_id.in_(courses), Assignment.due_at >= window_start,
                                     Assignment.due_at < window_end)
        )).scalars()]
        events += [_assessment_event(a, courses[a.course_id]) for a in (await session.execute(
            select(Assessment).where(
                Assessment.course_id.in_(courses),
                or_(Assessment.owner_id.is_(None), Assessment.owner_id == me.person_id),
                or_(and_(Assessment.opens_at >= window_start, Assessment.opens_at < window_end),
                    and_(Assessment.closes_at >= window_start, Assessment.closes_at < window_end)),
            )
        )).scalars()]
    return sorted(events, key=lambda e: e["startsAt"])


def _due_event(assignment: Assignment, course: Course) -> dict:
    return {"id": str(assignment.id), "type": "due", "title": assignment.title, **_course_ref(course),
            "startsAt": _iso(assignment.due_at), "endsAt": None, "kind": assignment.kind}


def _assessment_event(assessment: Assessment, course: Course) -> dict:
    return {"id": str(assessment.id), "type": "assessment", "title": assessment.title, **_course_ref(course),
            "startsAt": _iso(assessment.opens_at or assessment.closes_at), "endsAt": _iso(assessment.closes_at),
            "kind": assessment.kind}


# ---- student: attendance ----

@router.get("/student/attendance")
async def student_attendance(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    threshold = request.app.state.settings.attendance_threshold_percent
    now = datetime.now(UTC)
    tallies = await _course_tallies(session, me, now)
    rows = await _sessions(session, me.institution_id, me.section_ids, ClassSession.status == "held")
    recent = sorted((await _records(session, me.person_id, [r.id for r in rows])).values(),
                    key=lambda r: r.marked_at, reverse=True)[:RECENT_RECORDS]
    by_id = {r.id: r for r in rows}
    codes = {c.id: c.code for c, _ in tallies}
    return {
        "thresholdPercent": threshold,
        "courses": [{**_course_ref(course), **tally.summary(threshold)} for course, tally in tallies],
        "recent": [{"sessionId": str(r.session_id), "courseCode": codes.get(by_id[r.session_id].course_id),
                    "startsAt": _iso(by_id[r.session_id].starts_at), "status": r.status, "source": r.source}
                   for r in recent],
    }


class CheckinIn(CamelModel):
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


@router.post("/student/attendance/checkin")
async def checkin(
    body: CheckinIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Every attempt counts toward the allowance, so a six-digit code can't be guessed by trying them all."""
    me = await student_enrolment(request, ctx)
    allowed, retry_after = request.app.state.checkin_limiter.check(
        f"checkin:{me.person_id}", limit=CHECKIN_ATTEMPTS, window_seconds=CHECKIN_WINDOW_SECONDS)
    if not allowed:
        raise RateLimited("Too many check-in attempts. Ask your teacher to mark you present.",
                          details={"retryAfterSeconds": retry_after})
    now = datetime.now(UTC)
    candidates = await _sessions(session, me.institution_id, me.section_ids, ClassSession.checkin_open_until > now,
                                 ClassSession.status != "cancelled")
    digest = _code_digest(request, body.code)
    match = next((s for s in candidates if s.checkin_code_hash and hmac.compare_digest(s.checkin_code_hash, digest)),
                 None)
    if match is None:
        raise ValidationFailed("That code doesn't match an open class. Check it with your teacher.")
    inserted = (await session.execute(
        insert(AttendanceRecord)
        .values(id=uuid.uuid4(), institution_id=me.institution_id, session_id=match.id, person_id=me.person_id,
                status="present", source="checkin", marked_at=now)
        .on_conflict_do_nothing(constraint="uq_attendance_person")  # a second tab or a teacher's mark wins
        .returning(AttendanceRecord.id)
    )).scalar_one_or_none()
    if inserted is not None:
        session.add(_trail(me, ctx, "attendance_checkin", {"sessionId": str(match.id)}, match.course_id))
    await session.commit()
    record = (await _records(session, me.person_id, [match.id]))[match.id]
    return {"sessionId": str(match.id), "status": record.status, "source": record.source,
            "alreadyMarked": inserted is None}


# ---- student: leave ----

class LeaveIn(CamelModel):
    kind: LeaveKind
    from_date: date
    to_date: date
    reason: Reason
    attachment_ids: list[uuid.UUID] = Field(default_factory=list)


async def _leave_views(session: AsyncSession, leaves: list[LeaveRequest]) -> list[dict]:
    """Every request's view, with one attachment lookup for all of them."""
    files = await describe_many(session, [i for leave in leaves for i in leave.attachment_ids])
    return [_leave_view(leave, files) for leave in leaves]


def _leave_view(leave: LeaveRequest, files: dict[str, dict]) -> dict:
    return {
        "id": str(leave.id), "kind": leave.kind, "fromDate": str(leave.from_date), "toDate": str(leave.to_date),
        "days": (leave.to_date - leave.from_date).days + 1, "reason": leave.reason, "status": leave.status,
        "decisionNote": leave.decision_note, "decidedAt": _iso(leave.decided_at),
        "createdAt": _iso(leave.created_at), "attachments": [files[i] for i in leave.attachment_ids if i in files],
    }


@router.get("/student/leave")
async def my_leave(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    rows = (await session.execute(
        select(LeaveRequest).where(LeaveRequest.person_id == me.person_id,
                                   LeaveRequest.institution_id == me.institution_id)
        .order_by(LeaveRequest.from_date.desc())
    )).scalars().all()
    return {"items": await _leave_views(session, list(rows))}


@router.post("/student/leave", status_code=201)
async def apply_for_leave(
    body: LeaveIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    days = (body.to_date - body.from_date).days + 1
    if not 1 <= days <= MAX_LEAVE_DAYS:
        raise ValidationFailed(f"Leave runs from one day up to {MAX_LEAVE_DAYS} days, ending on or after it starts.")
    today = datetime.now(local_zone(request)).date()
    if body.from_date < today - timedelta(days=LEAVE_PAST_DAYS) or body.to_date > today + timedelta(
            days=LEAVE_AHEAD_DAYS):
        raise ValidationFailed(f"Leave can start up to {LEAVE_PAST_DAYS} days ago and end up to {LEAVE_AHEAD_DAYS} "
                               "days from today.")
    overlapping = (await session.execute(select(LeaveRequest.id).where(
        LeaveRequest.person_id == me.person_id, LeaveRequest.status.in_(("pending", "approved")),
        LeaveRequest.from_date <= body.to_date, LeaveRequest.to_date >= body.from_date).limit(1))).first()
    if overlapping is not None:
        raise Conflict("You already have leave covering some of these days.")
    leave = LeaveRequest(institution_id=me.institution_id, person_id=me.person_id, kind=body.kind,
                         from_date=body.from_date, to_date=body.to_date, reason=body.reason,
                         attachment_ids=await owned_attachments(session, me, body.attachment_ids))
    session.add(leave)
    await session.flush()
    session.add(_trail(me, ctx, "leave_requested", {"leaveId": str(leave.id), "kind": body.kind}))
    await session.commit()
    return (await _leave_views(session, [leave]))[0]


# ---- student: calendar feed ----

@router.post("/student/calendar-feed")
async def calendar_feed(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Creates the private feed link, or replaces it (revoking the old one). The token is shown only now."""
    me = await student_enrolment(request, ctx)
    token = secrets.token_urlsafe(32)
    feed = await session.get(CalendarFeed, me.person_id) or CalendarFeed(person_id=me.person_id,
                                                                          institution_id=me.institution_id)
    feed.token_hash, feed.created_at, feed.institution_id = _hash(token), datetime.now(UTC), me.institution_id
    session.add(feed)
    await session.commit()
    return {"url": f"/api/v1/calendar-feed/{token}.ics", "days": FEED_DAYS}


async def _student_sections(request: Request, person_id: uuid.UUID, institution_id: uuid.UUID
                            ) -> frozenset[uuid.UUID]:
    """A student's class sections in one institution, for work done without their sign-in (feeds, leave)."""
    data = await request.app.state.users.get(f"/internal/people/{person_id}/classes")
    return frozenset(uuid.UUID(c["id"]) for c in data.get("classes", [])
                     if c["role"] == "student" and c["institutionId"] == str(institution_id))


@router.get("/public/calendar/{token}.ics")
async def calendar_ics(token: str, request: Request,
                       session: Annotated[AsyncSession, Depends(db.get_session)]) -> Response:
    feed = (await session.execute(select(CalendarFeed).where(CalendarFeed.token_hash == _hash(token)))
            ).scalar_one_or_none()
    if feed is None:
        raise NotFound("Calendar not found.")
    me = Enrolment(person_id=feed.person_id, institution_id=feed.institution_id,
                   section_ids=await _student_sections(request, feed.person_id, feed.institution_id))
    now = datetime.now(UTC)
    events = await _events(session, me, now - timedelta(days=1), now + timedelta(days=FEED_DAYS))
    return Response(content=to_icalendar(events, now), media_type="text/calendar; charset=utf-8",
                    headers={"Cache-Control": "private, max-age=900"})


def _ics_text(value: str) -> str:
    """RFC 5545 TEXT escaping. Every line break (CRLF, CR or LF) becomes an escaped \\n, so a value can never
    start a new content line."""
    one_line = value.replace("\r\n", "\n").replace("\r", "\n")
    return one_line.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_time(value: str) -> str:
    return datetime.fromisoformat(value).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _fold(line: str) -> list[str]:
    """RFC 5545 line folding: at most 75 octets per line, continuations start with a space."""
    parts, current, limit = [], b"", ICS_LINE_OCTETS
    for char in line:
        encoded = char.encode()
        if len(current) + len(encoded) > limit:
            parts.append(current.decode())
            current, limit = b"", ICS_LINE_OCTETS - 1  # room for the leading space
        current += encoded
    parts.append(current.decode())
    return [parts[0], *(" " + p for p in parts[1:])]


def to_icalendar(events: list[dict], now: datetime) -> bytes:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EduBot//Schedule//EN", "CALSCALE:GREGORIAN",
             "X-WR-CALNAME:EduBot"]
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    for event in events:
        title = event["title"] if event["type"] == "class" else f"{event['courseCode']}: {event['title']}"
        lines += ["BEGIN:VEVENT", f"UID:{event['type']}-{event['id']}@edubot", f"DTSTAMP:{stamp}",
                  f"DTSTART:{_ics_time(event['startsAt'])}"]
        if event.get("endsAt"):
            lines.append(f"DTEND:{_ics_time(event['endsAt'])}")
        lines.append(f"SUMMARY:{_ics_text(title)}")
        if event.get("room"):
            lines.append(f"LOCATION:{_ics_text(event['room'])}")
        if event.get("status") == "cancelled":
            lines.append("STATUS:CANCELLED")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return ("\r\n".join(folded for line in lines for folded in _fold(line)) + "\r\n").encode()


# ---- teacher: sessions and attendance ----

async def _rosters(request: Request, ctx: RequestContext, me: Enrolment) -> dict[uuid.UUID, dict[uuid.UUID, str]]:
    """Students per class section the teacher teaches."""
    data = await request.app.state.users.get(f"/internal/people/{me.person_id}/classes", ctx=ctx)
    return {uuid.UUID(c["id"]): {uuid.UUID(s["id"]): s["name"] for s in c.get("students", [])}
            for c in data.get("classes", []) if c["role"] == "teacher" and uuid.UUID(c["id"]) in me.section_ids}


async def _class_session(session: AsyncSession, me: Enrolment, session_id: uuid.UUID) -> ClassSession:
    row = await session.get(ClassSession, session_id)
    if row is None or row.institution_id != me.institution_id or row.section_id not in me.section_ids:
        raise NotFound("Class not found.")
    return row


async def _teacher_views(session: AsyncSession, rows: list[ClassSession],
                         rosters: dict[uuid.UUID, dict[uuid.UUID, str]]) -> list[dict]:
    """Views for a day's classes with two queries in total, however many classes there are."""
    if not rows:
        return []
    courses = {c.id: c for c in (await session.execute(
        select(Course).where(Course.id.in_({r.course_id for r in rows})))).scalars()}
    records: dict[uuid.UUID, dict[uuid.UUID, AttendanceRecord]] = defaultdict(dict)
    for record in (await session.execute(
            select(AttendanceRecord).where(AttendanceRecord.session_id.in_([r.id for r in rows])))).scalars():
        records[record.session_id][record.person_id] = record
    return [_teacher_view(r, courses[r.course_id], records[r.id], rosters.get(r.section_id, {})) for r in rows]


def _teacher_view(row: ClassSession, course: Course, records: dict[uuid.UUID, AttendanceRecord],
                  roster: dict[uuid.UUID, str]) -> dict:
    open_until = row.checkin_open_until
    return {
        "id": str(row.id), **_course_ref(course), "sectionId": str(row.section_id), "startsAt": _iso(row.starts_at),
        "endsAt": _iso(row.ends_at), "room": row.room, "kind": row.kind, "status": row.status,
        "checkinOpenUntil": _iso(open_until) if open_until and open_until > datetime.now(UTC) else None,
        "roster": sorted(({"personId": str(pid), "name": name,
                           "status": records[pid].status if pid in records else None,
                           "source": records[pid].source if pid in records else None}
                          for pid, name in roster.items()), key=lambda m: m["name"]),
    }


@router.get("/teacher/sessions")
async def teacher_sessions(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    day: Annotated[date | None, Query(alias="date")] = None,
) -> dict:
    me = await teacher_enrolment(request, ctx)
    zone = local_zone(request)
    day = day or datetime.now(zone).date()
    start, end = day_bounds(day, day, zone)
    rows = await _sessions(session, me.institution_id, me.section_ids, ClassSession.starts_at >= start,
                           ClassSession.starts_at < end)
    return {"date": str(day), "sessions": await _teacher_views(session, rows, await _rosters(request, ctx, me))}


class MarkIn(CamelModel):
    person_id: uuid.UUID
    status: AttendanceStatus


class AttendanceIn(CamelModel):
    records: Annotated[list[MarkIn], Field(max_length=500)]


@router.post("/teacher/sessions/{session_id}/attendance")
async def mark_attendance(
    session_id: uuid.UUID,
    body: AttendanceIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """Teacher marks are final: they replace check-ins and leave, and leave never overwrites them."""
    me = await teacher_enrolment(request, ctx)
    row = await _class_session(session, me, session_id)
    now = datetime.now(UTC)
    if row.status == "cancelled":
        raise Conflict("This class was cancelled, so there's no attendance to take.")
    if row.starts_at > now:
        raise Conflict("This class hasn't started yet.")
    people = [m.person_id for m in body.records]
    if len(people) != len(set(people)):
        raise ValidationFailed("Each student can be marked once.")
    roster = (await _rosters(request, ctx, me)).get(row.section_id, {})
    strangers = set(people) - roster.keys()
    if strangers:
        raise ValidationFailed("Some of those students aren't in this class.")
    existing = {r.person_id: r for r in (await session.execute(
        select(AttendanceRecord).where(AttendanceRecord.session_id == row.id))).scalars()}
    for mark in body.records:
        record = existing.get(mark.person_id) or AttendanceRecord(
            institution_id=me.institution_id, session_id=row.id, person_id=mark.person_id)
        record.status, record.source, record.marked_at = mark.status, "teacher", now
        session.add(record)
    row.status = "held"
    await session.commit()
    course = await session.get(Course, row.course_id)
    local_start = row.starts_at.astimezone(local_zone(request))
    await _audit(request, ctx, "attendance.mark", "class_session", row.id,
                 f"{course.code} {local_start:%Y-%m-%d %H:%M}", me.institution_id)
    return (await _teacher_views(session, [row], {row.section_id: roster}))[0]


@router.post("/teacher/sessions/{session_id}/checkin")
async def open_checkin(
    session_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    """A fresh six-digit code, shown to the teacher once; only its hash is kept."""
    me = await teacher_enrolment(request, ctx)
    row = await _class_session(session, me, session_id)
    if row.status == "cancelled":
        raise Conflict("This class is cancelled.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    row.checkin_code_hash = _code_digest(request, code)
    row.checkin_open_until = datetime.now(UTC) + timedelta(minutes=request.app.state.settings.checkin_window_minutes)
    await session.commit()
    return {"code": code, "openUntil": _iso(row.checkin_open_until)}


# ---- teacher: leave requests ----

async def _students_leave(session: AsyncSession, me: Enrolment, leave_id: uuid.UUID) -> LeaveRequest:
    """The request, locked for this transaction so two decisions can't race."""
    leave = (await session.execute(
        select(LeaveRequest).where(LeaveRequest.id == leave_id).with_for_update())).scalar_one_or_none()
    if leave is None or leave.institution_id != me.institution_id or leave.person_id not in me.student_names:
        raise NotFound("Leave request not found.")
    return leave


@router.get("/teacher/requests/leave")
async def leave_inbox(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
    status: Literal["pending", "approved", "declined"] = "pending",
) -> dict:
    me = await teacher_enrolment(request, ctx)
    if not me.student_names:
        return {"items": []}
    rows = (await session.execute(
        select(LeaveRequest).where(LeaveRequest.institution_id == me.institution_id,
                                   LeaveRequest.person_id.in_(list(me.student_names)), LeaveRequest.status == status)
        .order_by(LeaveRequest.from_date)
    )).scalars().all()
    views = await _leave_views(session, list(rows))
    return {"items": [{**view, "student": {"id": str(row.person_id), "name": me.student_names[row.person_id]}}
                      for row, view in zip(rows, views, strict=True)]}


class DecisionIn(CamelModel):
    approve: bool
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


@router.post("/teacher/requests/leave/{leave_id}/decide")
async def decide_leave(
    leave_id: uuid.UUID,
    body: DecisionIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await teacher_enrolment(request, ctx)
    leave = await _students_leave(session, me, leave_id)
    if leave.status != "pending":
        raise Conflict("This request has already been decided.")
    excused = 0
    if body.approve:
        sections = await _student_sections(request, leave.person_id, leave.institution_id)
        if not sections:  # approving now would excuse nothing, silently; better to say so and keep it pending
            log.warning("leave_roster_missing", extra={"leave": str(leave.id), "student": str(leave.person_id)})
            raise Conflict("Couldn't find this student's classes. Try again in a moment.")
        excused = await apply_leave(session, leave, sections, local_zone(request))
    leave.status = "approved" if body.approve else "declined"
    leave.decided_by, leave.decided_at, leave.decision_note = me.person_id, datetime.now(UTC), body.note
    await session.commit()
    # Leave dates are already the institution's local calendar days.
    await _audit(request, ctx, "leave.decide", "leave_request", leave.id,
                 f"{leave.kind} {leave.from_date} to {leave.to_date}: {leave.status}", me.institution_id)
    view = (await _leave_views(session, [leave]))[0]
    return {**view, "excusedSessions": excused,
            "student": {"id": str(leave.person_id), "name": me.student_names[leave.person_id]}}


async def apply_leave(session: AsyncSession, leave: LeaveRequest, section_ids: frozenset[uuid.UUID],
                      zone: ZoneInfo) -> int:
    """Approved leave excuses (or marks on duty) the student's classes in its date range. Teacher marks stay.
    Returns how many classes it changed."""
    start, end = day_bounds(leave.from_date, leave.to_date, zone)
    rows = await _sessions(session, leave.institution_id, section_ids, ClassSession.status != "cancelled",
                           ClassSession.starts_at >= start, ClassSession.starts_at < end)
    records = await _records(session, leave.person_id, [r.id for r in rows])
    status = "on_duty" if leave.kind == "on_duty" else "excused"
    changed = 0
    for row in rows:
        record = records.get(row.id)
        if record is not None and record.source == "teacher":
            continue
        record = record or AttendanceRecord(institution_id=leave.institution_id, session_id=row.id,
                                            person_id=leave.person_id)
        record.status, record.source, record.marked_at = status, "leave", datetime.now(UTC)
        session.add(record)
        changed += 1
    return changed
