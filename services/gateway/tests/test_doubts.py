"""Doubts (a student asks the teacher of their class) and topic pages, end to end through the gateway."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from services.gateway.tests.conftest import audit_rows, login
from services.gateway.tests.test_role_dashboards import PASSWORD
from services.gateway.tests.test_roster import _person, _section
from services.gateway.tests.test_student_learning import DownTutor, FakeTutor
from services.learning.models import Course, Doubt, LearningEvent, Lesson, Module, Topic, TutorMessage
from services.users.models import ClassSection

FETCH = {"X-Requested-With": "fetch"}
DOUBTS = "/api/v1/student/doubts"
INBOX = "/api/v1/teacher/doubts"


async def _section_id(stack, code: str) -> uuid.UUID:
    async with stack.session("users") as s:
        return (await s.execute(select(ClassSection.id).where(ClassSection.code == code))).scalar_one()


@pytest.fixture
async def world(stack, seeded):
    ash = seeded["ashford"]
    tara = await _person(stack, ash, "teacher", "Tara", "tara@ashf.example.edu", account=True)
    omar = await _person(stack, ash, "teacher", "Omar", "omar@ashf.example.edu", account=True)
    sana = await _person(stack, ash, "student", "Sana", "sana@ashf.example.edu", account=True)
    sam = await _person(stack, ash, "student", "Sam", "sam@ashf.example.edu", account=True)
    await _section(stack, ash, "PHY101-A", [(tara, "teacher"), (sana, "student"), (sam, "student")])
    await _section(stack, ash, "CHM100-A", [(omar, "teacher")])
    phy_section, chm_section = await _section_id(stack, "PHY101-A"), await _section_id(stack, "CHM100-A")

    phy, chm, module, chm_module = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    kinematics, other_topic = uuid.uuid4(), uuid.uuid4()
    velocity, acceleration, protons = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with stack.session("learning") as s:
        s.add_all([
            Course(id=phy, institution_id=ash, section_id=phy_section, code="PHY101", title="Physics 101",
                   term="2026 Autumn", subject="physics"),
            Course(id=chm, institution_id=ash, section_id=chm_section, code="CHM100", title="Chemistry",
                   term="2026 Autumn", subject="chemistry"),
        ])
        await s.flush()
        s.add_all([
            Module(id=module, institution_id=ash, course_id=phy, position=1, title="Motion"),
            Module(id=chm_module, institution_id=ash, course_id=chm, position=1, title="Atoms"),
            Topic(id=kinematics, institution_id=ash, course_id=phy, position=1, title="Kinematics",
                  summary="Describing motion."),
            Topic(id=other_topic, institution_id=ash, course_id=chm, position=1, title="Atomic structure"),
        ])
        await s.flush()
        s.add_all([
            Lesson(id=velocity, institution_id=ash, course_id=phy, module_id=module, topic_id=kinematics,
                   position=1, title="Velocity", body="Velocity is displacement per unit time.", minutes=8),
            Lesson(id=acceleration, institution_id=ash, course_id=phy, module_id=module, topic_id=kinematics,
                   position=2, title="Acceleration", body="Acceleration is change in velocity.", minutes=9),
            Lesson(id=protons, institution_id=ash, course_id=chm, module_id=chm_module, topic_id=other_topic,
                   position=1, title="Protons", body="Protons are positive."),
        ])
        await s.commit()
    stack.apps["learning"].state.draft_limiter.reset()
    return {"tara": tara, "omar": omar, "sana": sana, "sam": sam, "phy": phy, "chm": chm,
            "kinematics": kinematics, "other_topic": other_topic, "velocity": velocity,
            "acceleration": acceleration, "protons": protons}


@asynccontextmanager
async def _signed_in(stack, email: str) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=stack.gateway), base_url="http://gateway") as client:
        await login(client, email, PASSWORD)
        yield client


async def _ask(client, world, **overrides) -> dict:
    body = {"lessonId": str(world["velocity"]), "title": "Why is velocity a vector?",
            "body": "The lesson says direction matters but speed does not have one.", **overrides}
    response = await client.post(DOUBTS, json=body, headers=FETCH)
    assert response.status_code == 201, response.text
    return response.json()


# ---- asking ----

@pytest.mark.asyncio
async def test_asking_from_a_lesson_routes_to_that_course_and_topic(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)

    assert doubt["status"] == "open"
    assert doubt["courseCode"] == "PHY101"
    assert doubt["topic"] == {"id": str(world["kinematics"]), "title": "Kinematics"}
    assert doubt["lesson"] == {"id": str(world["velocity"]), "title": "Velocity"}
    assert [m["authorRole"] for m in doubt["messages"]] == ["student"]


@pytest.mark.asyncio
async def test_new_doubt_promises_a_reply_within_the_target(stack, world):
    before = datetime.now(UTC)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)

    due = datetime.fromisoformat(doubt["replyDueAt"])
    assert timedelta(hours=47) < due - before < timedelta(hours=49)


@pytest.mark.asyncio
async def test_asking_is_recorded_on_the_learning_trail(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _ask(sana, world)

    async with stack.session("learning") as s:
        kinds = [e.kind for e in (await s.execute(select(LearningEvent))).scalars()]
    assert "doubt_asked" in kinds


@pytest.mark.asyncio
async def test_cannot_ask_about_a_lesson_outside_your_classes(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"lessonId": str(world["protons"]), "title": "Protons?",
                                                 "body": "Why positive?"}, headers=FETCH)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_doubt_needs_a_lesson_or_a_course(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"title": "Help", "body": "Stuck"}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("title", "x" * 160), ("body", "x" * 4000), ("videoSeconds", 0)])
async def test_fields_at_their_limits_are_accepted(stack, world, field, value):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"courseId": str(world["phy"]), "title": "Help",
                                                 "body": "Stuck", field: value}, headers=FETCH)

    assert response.status_code == 201


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("title", "   "), ("body", ""), ("title", "x" * 161),
                                         ("body", "x" * 4001), ("videoSeconds", -1)])
async def test_title_and_body_are_validated(stack, world, field, value):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"courseId": str(world["phy"]), "title": "Help",
                                                 "body": "Stuck", field: value}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_escalating_from_someone_elses_tutor_chat_is_refused(stack, world):
    theirs = uuid.uuid4()
    async with stack.session("learning") as s:
        s.add(TutorMessage(conversation_id=theirs, institution_id=uuid.uuid4(), person_id=world["sam"],
                           role="user", content="private"))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"courseId": str(world["phy"]), "title": "Help", "body": "Stuck",
                                                 "conversationId": str(theirs)}, headers=FETCH)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_students_have_a_daily_doubt_limit(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        statuses = [
            (await sana.post(DOUBTS, json={"courseId": str(world["phy"]), "title": f"Q{i}", "body": "Stuck"},
                             headers=FETCH)).status_code
            for i in range(11)
        ]

    assert statuses[:10] == [201] * 10
    assert statuses[10] == 429


@pytest.mark.asyncio
async def test_asking_about_a_topic_appears_on_that_topic_page(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world, lessonId=None, courseId=str(world["phy"]), topicId=str(world["kinematics"]))
        topic = (await sana.get(f"/api/v1/student/topics/{world['kinematics']}")).json()

    assert doubt["topic"]["title"] == "Kinematics" and doubt["lesson"] is None
    assert [d["id"] for d in topic["doubts"]] == [doubt["id"]]


@pytest.mark.asyncio
async def test_topic_must_belong_to_the_course(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"courseId": str(world["phy"]), "topicId": str(world["other_topic"]),
                                                 "title": "Help", "body": "Stuck"}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_lesson_and_course_must_agree(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"lessonId": str(world["velocity"]), "courseId": str(world["chm"]),
                                                 "title": "Help", "body": "Stuck"}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_escalating_a_chat_from_another_course_is_refused(stack, world):
    chat = uuid.uuid4()
    async with stack.session("learning") as s:
        s.add(TutorMessage(conversation_id=chat, institution_id=uuid.uuid4(), person_id=world["sana"],
                           lesson_id=world["protons"], role="user", content="About protons"))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"lessonId": str(world["velocity"]), "title": "Help", "body": "Stuck",
                                                 "conversationId": str(chat)}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_malformed_json_is_a_validation_error(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, content=b"{not json", headers={**FETCH, "content-type": "application/json"})

    assert response.status_code == 422


# ---- a student's own doubts ----

@pytest.mark.asyncio
async def test_students_only_see_their_own_doubts(stack, world):
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        sams = await _ask(sam, world, title="Sam's question")
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _ask(sana, world)
        listing = (await sana.get(DOUBTS)).json()
        peek = await sana.get(f"{DOUBTS}/{sams['id']}")

    assert [d["title"] for d in listing["items"]] == ["Why is velocity a vector?"]
    assert listing["counts"] == {"open": 1, "answered": 0, "resolved": 0}
    assert listing["replyTargetHours"] == 48
    assert peek.status_code == 404


@pytest.mark.asyncio
async def test_following_up_on_an_answer_reopens_the_doubt(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            await tara.post(f"{INBOX}/{doubt['id']}/messages", json={"body": "Speed has no direction."},
                            headers=FETCH)

        followed = await sana.post(f"{DOUBTS}/{doubt['id']}/messages", json={"body": "Still confused."},
                                   headers=FETCH)

    assert followed.status_code == 200
    assert followed.json()["status"] == "open"
    assert [m["authorRole"] for m in followed.json()["messages"]] == ["student", "teacher", "student"]


@pytest.mark.asyncio
async def test_following_up_while_waiting_keeps_the_original_reply_target(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)

        followed = (await sana.post(f"{DOUBTS}/{doubt['id']}/messages", json={"body": "Any news?"},
                                    headers=FETCH)).json()

    assert followed["replyDueAt"] == doubt["replyDueAt"]


@pytest.mark.asyncio
async def test_following_up_on_a_resolved_doubt_reopens_it_on_the_trail(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
        await sana.post(f"{DOUBTS}/{doubt['id']}/resolve", headers=FETCH)

        reopened = (await sana.post(f"{DOUBTS}/{doubt['id']}/messages", json={"body": "Actually, one more thing."},
                                    headers=FETCH)).json()

    async with stack.session("learning") as s:
        kinds = [e.kind for e in (await s.execute(select(LearningEvent))).scalars()]
    assert reopened["status"] == "open" and reopened["resolvedAt"] is None
    assert "doubt_reopened" in kinds


@pytest.mark.asyncio
async def test_a_doubt_holds_a_bounded_number_of_messages(stack, world):
    stack.apps["learning"].state.settings.doubt_messages_max = 3
    try:
        async with _signed_in(stack, "sana@ashf.example.edu") as sana:
            doubt = await _ask(sana, world)
            statuses = [(await sana.post(f"{DOUBTS}/{doubt['id']}/messages", json={"body": f"m{i}"},
                                         headers=FETCH)).status_code for i in range(3)]
    finally:
        stack.apps["learning"].state.settings.doubt_messages_max = 50

    assert statuses == [200, 200, 409]


@pytest.mark.asyncio
async def test_students_cannot_touch_another_students_doubt(stack, world):
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        sams = await _ask(sam, world)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        follow = await sana.post(f"{DOUBTS}/{sams['id']}/messages", json={"body": "hi"}, headers=FETCH)
        close = await sana.post(f"{DOUBTS}/{sams['id']}/resolve", headers=FETCH)

    assert (follow.status_code, close.status_code) == (404, 404)


@pytest.mark.asyncio
async def test_resolving_closes_the_doubt(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)

        resolved = await sana.post(f"{DOUBTS}/{doubt['id']}/resolve", headers=FETCH)

    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolvedAt"]


# ---- teacher inbox ----

@pytest.mark.asyncio
async def test_teacher_inbox_holds_doubts_from_their_classes_with_student_names(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _ask(sana, world)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        inbox = (await tara.get(INBOX)).json()
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        other = (await omar.get(INBOX)).json()

    assert [(d["title"], d["student"]["name"]) for d in inbox["items"]] == [("Why is velocity a vector?", "Sana Okafor")]
    assert other["items"] == []


@pytest.mark.asyncio
async def test_teacher_cannot_open_a_doubt_from_another_class(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        view = await omar.get(f"{INBOX}/{doubt['id']}")
        reply = await omar.post(f"{INBOX}/{doubt['id']}/messages", json={"body": "hi"}, headers=FETCH)
        draft = await omar.post(f"{INBOX}/{doubt['id']}/draft", headers=FETCH)

    assert (view.status_code, reply.status_code, draft.status_code) == (404, 404, 404)


@pytest.mark.asyncio
async def test_teacher_cannot_reply_to_a_resolved_doubt(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
        await sana.post(f"{DOUBTS}/{doubt['id']}/resolve", headers=FETCH)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        reply = await tara.post(f"{INBOX}/{doubt['id']}/messages", json={"body": "Late answer"}, headers=FETCH)

    assert reply.status_code == 409


@pytest.mark.asyncio
async def test_inbox_filters_by_status(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        answered = await _ask(sana, world, title="Answered one")
        await _ask(sana, world, title="Waiting one")
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.post(f"{INBOX}/{answered['id']}/messages", json={"body": "Done."}, headers=FETCH)
        only_answered = (await tara.get(INBOX, params={"status": "answered"})).json()
        everything = (await tara.get(INBOX)).json()

    assert [d["title"] for d in only_answered["items"]] == ["Answered one"]
    assert [d["status"] for d in everything["items"]] == ["open", "answered"]  # waiting first


@pytest.mark.asyncio
async def test_teacher_reply_answers_the_doubt_and_is_audited(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            answered = (await tara.post(f"{INBOX}/{doubt['id']}/messages", json={"body": "Direction matters."},
                                        headers=FETCH)).json()
        seen_by_student = (await sana.get(f"{DOUBTS}/{doubt['id']}")).json()

    assert answered["status"] == "answered"
    assert seen_by_student["messages"][-1]["authorName"] == "Tara Okafor"
    assert ("doubt.answer", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_overdue_doubts_are_surfaced_first(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        late = await _ask(sana, world, title="Late one")
        await _ask(sana, world, title="Fresh one")
    async with stack.session("learning") as s:
        row = await s.get(Doubt, uuid.UUID(late["id"]))
        row.reply_due_at = datetime.now(UTC) - timedelta(hours=1)
        await s.commit()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        inbox = (await tara.get(INBOX)).json()
        overdue = (await tara.get(INBOX, params={"status": "overdue"})).json()

    assert inbox["items"][0]["title"] == "Late one" and inbox["items"][0]["overdue"] is True
    assert [d["title"] for d in overdue["items"]] == ["Late one"]
    assert inbox["counts"]["overdue"] == 1


@pytest.mark.asyncio
async def test_teacher_sees_the_tutor_chat_the_doubt_came_from(stack, world):
    conversation = uuid.uuid4()
    async with stack.session("learning") as s:
        s.add(TutorMessage(conversation_id=conversation, institution_id=uuid.uuid4(), person_id=world["sana"],
                           role="user", content="Is speed a vector?"))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world, conversationId=str(conversation))
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        detail = (await tara.get(f"{INBOX}/{doubt['id']}")).json()

    assert [t["content"] for t in detail["tutorTranscript"]] == ["Is speed a vector?"]
    assert ("doubt.transcript_view", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_ai_draft_is_grounded_in_the_lesson_and_the_question(stack, world):
    fake = FakeTutor("anthropic", reply="Think about which way the car is going.")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        draft = await tara.post(f"{INBOX}/{doubt['id']}/draft", headers=FETCH)

    assert draft.json() == {"draft": "Think about which way the car is going."}
    prompt = "\n".join(fake.calls[0]["system"]) + fake.calls[0]["history"][-1].content
    assert "Velocity is displacement per unit time." in prompt
    assert "The lesson says direction matters" in prompt


@pytest.mark.asyncio
async def test_ai_drafts_are_rate_limited_and_audited(stack, world):
    fake = FakeTutor("anthropic", reply="A draft.")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        statuses = [(await tara.post(f"{INBOX}/{doubt['id']}/draft", headers=FETCH)).status_code for _ in range(6)]

    assert statuses == [200] * 5 + [429]
    assert ("doubt.draft", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_ai_draft_reports_when_no_model_is_available(stack, world):
    stack.apps["learning"].state.tutor_providers = {"anthropic": DownTutor("anthropic"), "openai": DownTutor("openai")}
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        draft = await tara.post(f"{INBOX}/{doubt['id']}/draft", headers=FETCH)

    assert draft.status_code == 503
    assert draft.json()["code"] == "AI_UNAVAILABLE"


@pytest.mark.asyncio
async def test_insights_report_response_time_and_most_asked_topics(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
        await _ask(sana, world, title="Another one")
    async with stack.session("learning") as s:
        row = await s.get(Doubt, uuid.UUID(doubt["id"]))
        row.created_at = datetime.now(UTC) - timedelta(hours=6)
        await s.commit()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.post(f"{INBOX}/{doubt['id']}/messages", json={"body": "Here you go."}, headers=FETCH)
        insights = (await tara.get(INBOX)).json()["insights"]

    assert 5.9 < insights["avgFirstResponseHours"] < 6.1
    assert insights["topTopics"] == [{"id": str(world["kinematics"]), "title": "Kinematics", "count": 2}]


@pytest.mark.asyncio
async def test_doubt_routes_are_role_scoped(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        student_on_inbox = await sana.get(INBOX)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        teacher_on_doubts = await tara.get(DOUBTS)

    assert student_on_inbox.status_code == 403
    assert teacher_on_doubts.status_code == 403


# ---- topics ----

@pytest.mark.asyncio
async def test_topic_page_gathers_lessons_progress_and_my_doubts(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await sana.post(f"/api/v1/student/lessons/{world['velocity']}/complete", headers=FETCH)
        await _ask(sana, world)
        topic = (await sana.get(f"/api/v1/student/topics/{world['kinematics']}")).json()

    assert topic["title"] == "Kinematics"
    assert [lesson["title"] for lesson in topic["lessons"]] == ["Velocity", "Acceleration"]
    assert topic["progress"] == {"completed": 1, "total": 2}
    assert [d["title"] for d in topic["doubts"]] == ["Why is velocity a vector?"]


@pytest.mark.asyncio
async def test_topic_from_another_class_is_hidden(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.get(f"/api/v1/student/topics/{world['other_topic']}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_course_and_lesson_carry_their_topics(stack, world):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        course = (await sana.get(f"/api/v1/student/courses/{world['phy']}")).json()
        lesson = (await sana.get(f"/api/v1/student/lessons/{world['velocity']}")).json()

    assert course["topics"] == [{"id": str(world["kinematics"]), "title": "Kinematics", "summary": "Describing motion.",
                                 "lessonsTotal": 2, "lessonsCompleted": 0}]
    assert lesson["topic"] == {"id": str(world["kinematics"]), "title": "Kinematics"}
