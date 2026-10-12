"""Student slice 1: Today, Learn, lessons, the learning trail and the AI tutor (with a fake provider)."""

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from services.gateway.tests.conftest import login
from services.gateway.tests.test_role_dashboards import PASSWORD
from services.gateway.tests.test_roster import _person, _section
from services.learning.models import (
    Assignment,
    ClassSession,
    Course,
    LearningEvent,
    Lesson,
    Module,
    Submission,
    TutorMessage,
)
from services.learning.providers.base import ChatTurn, ProviderUnavailable
from services.users.models import ClassSection

FETCH = {"X-Requested-With": "fetch"}


class FakeTutor:
    def __init__(self, name: str, reply: str = "What do you already know about forces?") -> None:
        self.name = name
        self.model = f"fake-{name}"
        self.reply = reply
        self.calls: list[dict] = []

    async def stream(self, *, system: list[str], history: list[ChatTurn], max_tokens: int) -> AsyncIterator[str]:
        self.calls.append({"system": system, "history": history})
        for word in self.reply.split(" "):
            yield word + " "


class DownTutor(FakeTutor):
    async def stream(self, *, system, history, max_tokens):  # noqa: ANN001, ANN202
        raise ProviderUnavailable("Claude is not configured for this deployment.", reason="missing_credentials")
        yield ""  # pragma: no cover


def _sse(body: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in body.splitlines() if line.startswith("data: ")]


async def _section_id(stack, code: str) -> uuid.UUID:
    async with stack.session("users") as s:
        return (await s.execute(select(ClassSection.id).where(ClassSection.code == code))).scalar_one()


@pytest.fixture(autouse=True)
def fresh_tutor_budget(stack):
    stack.apps["learning"].state.tutor_limiter.reset()


@pytest.fixture
async def course_world(stack, seeded):
    ash, hil = seeded["ashford"], seeded["hillview"]
    sana = await _person(stack, ash, "student", "Sana", "sana@ashf.example.edu", account=True)
    await _person(stack, ash, "teacher", "Tara", "tara@ashf.example.edu", account=True)
    teacher = (await _person(stack, ash, "teacher", "Tom", "tom@ashf.example.edu"))
    await _section(stack, ash, "PHY101-A", [(teacher, "teacher"), (sana, "student")])
    await _section(stack, ash, "CHM100-A", [(teacher, "teacher")])
    phy_section, chm_section = await _section_id(stack, "PHY101-A"), await _section_id(stack, "CHM100-A")

    now = datetime.now(UTC)
    phy, chm, other = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    mod = uuid.uuid4()
    l1, l2, chm_lesson = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with stack.session("learning") as s:
        s.add_all([
            Course(id=phy, institution_id=ash, section_id=phy_section, code="PHY101", title="Physics 101",
                   term="2026 Autumn", subject="physics"),
            Course(id=chm, institution_id=ash, section_id=chm_section, code="CHM100", title="Chemistry",
                   term="2026 Autumn", subject="chemistry"),
            Course(id=other, institution_id=hil, section_id=uuid.uuid4(), code="BIO100", title="Biology",
                   term="2026 Autumn", subject="biology"),
        ])
        await s.flush()
        s.add(Module(id=mod, institution_id=ash, course_id=phy, position=1, title="Motion"))
        chm_mod = uuid.uuid4()
        s.add(Module(id=chm_mod, institution_id=ash, course_id=chm, position=1, title="Atoms"))
        await s.flush()
        s.add_all([
            Lesson(id=l1, institution_id=ash, course_id=phy, module_id=mod, position=1, title="Velocity",
                   body="Velocity is displacement per unit time.", minutes=8,
                   video={"url": "https://www.youtube-nocookie.com/embed/x", "title": "Velocity", "source": "Demo",
                          "durationSeconds": 300},
                   animation={"kind": "projectile", "params": {}, "caption": "Launch", "alt": "A ball arcs."}),
            Lesson(id=l2, institution_id=ash, course_id=phy, module_id=mod, position=2, title="Acceleration",
                   body="Acceleration is the rate of change of velocity.", minutes=9),
            Lesson(id=chm_lesson, institution_id=ash, course_id=chm, module_id=chm_mod, position=1,
                   title="Protons", body="Protons are positive."),
        ])
        a_overdue, a_soon, a_far, a_done = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        s.add_all([
            Assignment(id=a_overdue, institution_id=ash, course_id=phy, title="Lab 1", kind="lab",
                       due_at=now - timedelta(days=1)),
            Assignment(id=a_soon, institution_id=ash, course_id=phy, title="Problem set 2", kind="assignment",
                       due_at=now + timedelta(days=3)),
            Assignment(id=a_far, institution_id=ash, course_id=phy, title="Midterm", kind="quiz",
                       due_at=now + timedelta(days=20)),
            Assignment(id=a_done, institution_id=ash, course_id=phy, title="Reading quiz", kind="quiz",
                       due_at=now + timedelta(days=2)),
            Assignment(institution_id=ash, course_id=chm, title="Not my course", kind="assignment",
                       due_at=now + timedelta(days=1)),
        ])
        await s.flush()
        s.add(Submission(institution_id=ash, assignment_id=a_done, person_id=sana, status="submitted"))
        await s.commit()
    return {"sana": sana, "phy": phy, "chm": chm, "l1": l1, "l2": l2, "chm_lesson": chm_lesson}


async def _as_sana(client) -> None:
    await login(client, "sana@ashf.example.edu", PASSWORD)


@pytest.mark.asyncio
async def test_today_lists_work_due_within_a_week_overdue_first(client, course_world):
    await _as_sana(client)

    today = (await client.get("/api/v1/student/today")).json()

    assert [d["title"] for d in today["due"]] == ["Lab 1", "Reading quiz", "Problem set 2"]
    assert [d["status"] for d in today["due"]] == ["overdue", "submitted", "pending"]
    assert today["continue"] is None


@pytest.mark.asyncio
async def test_a_saved_draft_is_not_handed_in(stack, client, course_world):
    async with stack.session("learning") as s:
        lab = (await s.execute(select(Assignment).where(Assignment.title == "Lab 1"))).scalar_one()
        s.add(Submission(institution_id=lab.institution_id, assignment_id=lab.id, person_id=course_world["sana"],
                         status="draft", submitted_at=None))
        await s.commit()
    await _as_sana(client)

    today = (await client.get("/api/v1/student/today")).json()

    lab_row = next(d for d in today["due"] if d["title"] == "Lab 1")
    assert lab_row["status"] == "overdue" and lab_row["hasDraft"] is True


@pytest.mark.asyncio
async def test_today_shows_todays_classes_and_attendance_warnings(stack, client, course_world):
    now = datetime.now(UTC)
    async with stack.session("learning") as s:
        course = await s.get(Course, course_world["phy"])
        s.add(ClassSession(institution_id=course.institution_id, section_id=course.section_id, course_id=course.id,
                           starts_at=now + timedelta(minutes=30), ends_at=now + timedelta(minutes=90),
                           room="L-101", status="scheduled"))
        s.add_all([ClassSession(institution_id=course.institution_id, section_id=course.section_id,
                                course_id=course.id, starts_at=now - timedelta(days=d),
                                ends_at=now - timedelta(days=d) + timedelta(hours=1), status="held")
                   for d in (2, 3, 4)])  # held, no records: absent, so far below 75%
        await s.commit()
    await _as_sana(client)

    today = (await client.get("/api/v1/student/today")).json()

    assert [c["room"] for c in today["classes"]] == ["L-101"]
    assert today["attendanceAlerts"][0]["courseCode"] == "PHY101"

    await _as_sana(client)

    courses = (await client.get("/api/v1/student/courses")).json()["courses"]

    assert [c["code"] for c in courses] == ["PHY101"]
    assert courses[0]["lessonsTotal"] == 2 and courses[0]["lessonsCompleted"] == 0


@pytest.mark.asyncio
async def test_opening_a_lesson_tracks_progress_and_the_trail(stack, client, course_world):
    await _as_sana(client)

    lesson = (await client.get(f"/api/v1/student/lessons/{course_world['l1']}")).json()
    today = (await client.get("/api/v1/student/today")).json()

    assert lesson["title"] == "Velocity" and lesson["video"] and lesson["animation"]["kind"] == "projectile"
    assert lesson["next"]["title"] == "Acceleration" and lesson["previous"] is None
    assert today["continue"]["lessonId"] == str(course_world["l1"])
    async with stack.session("learning") as s:
        events = (await s.execute(select(LearningEvent))).scalars().all()
    assert [e.kind for e in events] == ["lesson_opened"]
    assert events[0].session_id is not None


@pytest.mark.asyncio
async def test_completing_a_lesson_moves_course_progress(client, course_world):
    await _as_sana(client)
    await client.get(f"/api/v1/student/lessons/{course_world['l1']}")

    done = await client.post(f"/api/v1/student/lessons/{course_world['l1']}/complete", headers=FETCH)
    courses = (await client.get("/api/v1/student/courses")).json()["courses"]

    assert done.status_code == 200, done.text
    assert courses[0]["lessonsCompleted"] == 1


@pytest.mark.asyncio
async def test_lessons_outside_the_students_classes_are_not_found(client, course_world):
    await _as_sana(client)

    response = await client.get(f"/api/v1/student/lessons/{course_world['chm_lesson']}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_only_students_reach_student_learning(client, course_world):
    await login(client, "tara@ashf.example.edu", PASSWORD)

    response = await client.get("/api/v1/student/today")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_tutor_streams_a_grounded_reply_and_logs_both_turns(stack, client, course_world):
    fake = FakeTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": FakeTutor("openai")}
    await _as_sana(client)

    response = await client.post(
        "/api/v1/student/tutor/messages",
        json={"message": "Explain velocity", "lessonId": str(course_world["l1"])},
        headers=FETCH,
    )

    events = _sse(response.text)
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "".join(e["text"] for e in events if e["type"] == "delta").strip() == fake.reply
    assert events[-1]["type"] == "done" and events[-1]["conversationId"]
    assert "Velocity is displacement per unit time." in "\n".join(fake.calls[0]["system"])
    async with stack.session("learning") as s:
        turns = (await s.execute(select(TutorMessage).order_by(TutorMessage.created_at))).scalars().all()
        kinds = {e.kind for e in (await s.execute(select(LearningEvent))).scalars()}
    assert [t.role for t in turns] == ["user", "assistant"]
    assert turns[1].provider == "anthropic" and turns[1].session_id is not None
    assert {"tutor_question", "tutor_answer"} <= kinds


@pytest.mark.asyncio
async def test_tutor_follow_up_carries_the_conversation(stack, client, course_world):
    fake = FakeTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": FakeTutor("openai")}
    await _as_sana(client)
    first = _sse((await client.post("/api/v1/student/tutor/messages", json={"message": "Hi"}, headers=FETCH)).text)

    await client.post(
        "/api/v1/student/tutor/messages",
        json={"message": "And acceleration?", "conversationId": first[-1]["conversationId"]},
        headers=FETCH,
    )

    assert [t.content for t in fake.calls[1]["history"]][-3:] == ["Hi", fake.reply, "And acceleration?"]


@pytest.mark.asyncio
async def test_tutor_flags_distress_for_adult_follow_up(stack, client, course_world):
    stack.apps["learning"].state.tutor_providers = {"anthropic": FakeTutor("anthropic"), "openai": FakeTutor("openai")}
    await _as_sana(client)

    await client.post("/api/v1/student/tutor/messages", json={"message": "I want to hurt myself"}, headers=FETCH)

    async with stack.session("learning") as s:
        flagged = (await s.execute(select(LearningEvent).where(LearningEvent.kind == "tutor_flagged"))).scalars().all()
    assert len(flagged) == 1


@pytest.mark.asyncio
async def test_unconfigured_tutor_says_so_instead_of_failing(stack, client, course_world):
    stack.apps["learning"].state.tutor_providers = {"anthropic": DownTutor("anthropic"), "openai": DownTutor("openai")}
    await _as_sana(client)

    response = await client.post("/api/v1/student/tutor/messages", json={"message": "Hi"}, headers=FETCH)

    events = _sse(response.text)
    assert events[-1] == {"type": "error", "code": "TUTOR_UNAVAILABLE",
                          "message": "The tutor isn't available right now. Try again in a few minutes, or ask your teacher."}
    async with stack.session("learning") as s:
        kinds = [e.kind for e in (await s.execute(select(LearningEvent))).scalars()]
    assert "tutor_unavailable" in kinds  # recorded on the trail, so it is visible rather than silent


class BrokenTutor(FakeTutor):
    async def stream(self, *, system, history, max_tokens):  # noqa: ANN001, ANN202
        self.calls.append({"system": system, "history": history})
        yield "Start with the "
        raise RuntimeError("provider dropped the stream")


@pytest.mark.asyncio
async def test_cut_off_reply_is_kept_and_reported_without_done(stack, client, course_world):
    broken = BrokenTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": broken, "openai": broken}
    await _as_sana(client)

    events = _sse((await client.post("/api/v1/student/tutor/messages", json={"message": "Hi"}, headers=FETCH)).text)

    assert [e["type"] for e in events] == ["delta", "error"]
    assert events[-1]["code"] == "TUTOR_FAILED"
    async with stack.session("learning") as s:
        answer = (await s.execute(select(TutorMessage).where(TutorMessage.role == "assistant"))).scalar_one()
        event = (await s.execute(select(LearningEvent).where(LearningEvent.kind == "tutor_answer"))).scalar_one()
    assert answer.content == "Start with the"
    assert event.detail["truncated"] == "failed"


@pytest.mark.asyncio
async def test_empty_reply_is_an_error_not_a_saved_answer(stack, client, course_world):
    silent = FakeTutor("anthropic", reply="")
    stack.apps["learning"].state.tutor_providers = {"anthropic": silent, "openai": silent}
    await _as_sana(client)

    events = _sse((await client.post("/api/v1/student/tutor/messages", json={"message": "Hi"}, headers=FETCH)).text)

    assert events[-1]["type"] == "error"
    async with stack.session("learning") as s:
        assert (await s.execute(select(TutorMessage).where(TutorMessage.role == "assistant"))).first() is None


@pytest.mark.asyncio
async def test_unanswered_question_is_merged_so_turns_still_alternate(stack, client, course_world):
    down = DownTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": down, "openai": down}
    await _as_sana(client)
    await client.post("/api/v1/student/tutor/messages", json={"message": "Hi"}, headers=FETCH)
    async with stack.session("learning") as s:
        conversation = (await s.execute(select(TutorMessage.conversation_id))).scalar_one()
    fake = FakeTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}

    await client.post("/api/v1/student/tutor/messages",
                      json={"message": "Still there?", "conversationId": str(conversation)}, headers=FETCH)

    history = fake.calls[0]["history"]
    assert [t.role for t in history] == ["user"]
    assert history[0].content == "Hi\n\nStill there?"


@pytest.mark.asyncio
async def test_tutor_is_rate_limited_per_student(stack, client, course_world):
    fake = FakeTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}
    stack.apps["learning"].state.tutor_limiter.reset()
    await _as_sana(client)

    statuses = [
        (await client.post("/api/v1/student/tutor/messages", json={"message": f"q{i}"}, headers=FETCH)).status_code
        for i in range(9)
    ]
    stack.apps["learning"].state.tutor_limiter.reset()

    assert statuses[:8] == [200] * 8
    assert statuses[8] == 429


@pytest.mark.asyncio
async def test_tutor_refuses_other_courses_and_conversations(stack, client, course_world):
    fake = FakeTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}
    stack.apps["learning"].state.tutor_limiter.reset()
    theirs = uuid.uuid4()
    async with stack.session("learning") as s:
        s.add(TutorMessage(conversation_id=theirs, institution_id=uuid.uuid4(), person_id=uuid.uuid4(),
                           role="user", content="private"))
        await s.commit()
    await _as_sana(client)

    foreign_lesson = await client.post("/api/v1/student/tutor/messages",
                                       json={"message": "Hi", "lessonId": str(course_world["chm_lesson"])},
                                       headers=FETCH)
    foreign_chat = await client.post("/api/v1/student/tutor/messages",
                                     json={"message": "Hi", "conversationId": str(theirs)}, headers=FETCH)
    blank = await client.post("/api/v1/student/tutor/messages", json={"message": "   "}, headers=FETCH)

    assert foreign_lesson.status_code == 404
    assert foreign_chat.status_code == 404
    assert blank.status_code == 422
    assert fake.calls == []


@pytest.mark.asyncio
async def test_format_must_exist_on_the_lesson(client, course_world):
    await _as_sana(client)

    bogus = await client.post(f"/api/v1/student/lessons/{course_world['l1']}/format", json={"format": "hologram"},
                              headers=FETCH)

    assert bogus.status_code == 422


@pytest.mark.asyncio
async def test_learning_trail_rotates_after_60_days(stack, course_world):
    import httpx

    from services.gateway.tests.conftest import INTERNAL

    old, recent = datetime.now(UTC) - timedelta(days=61), datetime.now(UTC) - timedelta(days=5)
    async with stack.session("learning") as s:
        for when in (old, recent):
            s.add(LearningEvent(institution_id=uuid.uuid4(), person_id=course_world["sana"], kind="lesson_opened",
                                occurred_at=when))
            s.add(TutorMessage(conversation_id=uuid.uuid4(), institution_id=uuid.uuid4(),
                               person_id=course_world["sana"], role="user", content="hi", created_at=when))
        await s.commit()
    transport = httpx.ASGITransport(app=stack.apps["learning"])
    async with httpx.AsyncClient(transport=transport, base_url="http://learning",
                                 headers={"X-Edubot-Internal-Token": INTERNAL}) as learning:
        result = (await learning.post("/internal/maintenance/purge-trail")).json()

    assert result == {"purged": 2, "retentionDays": 60}
