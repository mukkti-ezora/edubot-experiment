"""Practice: quizzes, mock tests, attempts with analytics, improvement sets, AI practice and the review deck."""

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from services.gateway.tests.test_doubts import FETCH, _signed_in, world  # noqa: F401
from services.gateway.tests.test_roster import _person
from services.gateway.tests.test_student_learning import DownTutor, FakeTutor
from services.learning.models import (
    Assessment,
    AssessmentItem,
    Attempt,
    Flashcard,
    LearningEvent,
    Question,
    Topic,
)
from services.learning.practice_ai import validate_generated_question
from services.learning.practice_review import ReviewState, schedule_review
from services.learning.practice_scoring import rank_among
from services.users.models import ClassMember, ClassSection

HUB = "/api/v1/student/practice"
TUTOR = "/api/v1/student/tutor/messages"


def _choice(qid_options: list[str]) -> list[dict]:
    return [{"id": o, "text": f"Option {o}"} for o in qid_options]


@pytest.fixture
async def bank(stack, world):  # noqa: F811
    """PHY101 bank across two topics, a quiz, a negative-marked mock test, an exam check, and flashcards."""
    ash = (await _course(stack, world["phy"])).institution_id
    sol = await _person(stack, ash, "student", "Sol", "sol@ashf.example.edu", account=True)
    async with stack.session("users") as s:
        section = (await s.execute(select(ClassSection).where(ClassSection.code == "PHY101-A"))).scalar_one()
        s.add(ClassMember(section_id=section.id, institution_id=ash, person_id=sol, role="student"))
        await s.commit()

    forces = uuid.uuid4()
    q = {name: uuid.uuid4() for name in ("single", "multiple", "numeric", "true_false", "forces", "spare")}
    now = datetime.now(UTC)
    quiz, mock, upcoming, closed, check = (uuid.uuid4() for _ in range(5))
    async with stack.session("learning") as s:
        s.add(Topic(id=forces, institution_id=ash, course_id=world["phy"], position=2, title="Forces"))
        await s.flush()
        kin = world["kinematics"]
        s.add_all([
            Question(id=q["single"], institution_id=ash, course_id=world["phy"], topic_id=kin, kind="single",
                     stem="Velocity is a...", options=_choice(["a", "b", "c"]), answer={"options": ["a"]},
                     explanation="It has direction."),
            Question(id=q["multiple"], institution_id=ash, course_id=world["phy"], topic_id=kin, kind="multiple",
                     stem="Which are vectors?", options=_choice(["a", "b", "c"]), answer={"options": ["a", "c"]},
                     explanation="Displacement and velocity."),
            Question(id=q["numeric"], institution_id=ash, course_id=world["phy"], topic_id=kin, kind="numeric",
                     stem="g in m/s^2?", answer={"value": 9.8, "tolerance": 0.1}, explanation="About 9.8."),
            Question(id=q["true_false"], institution_id=ash, course_id=world["phy"], topic_id=kin,
                     kind="true_false", stem="Speed can be negative.",
                     options=[{"id": "true", "text": "True"}, {"id": "false", "text": "False"}],
                     answer={"options": ["false"]}, explanation="Speed is a magnitude."),
            Question(id=q["forces"], institution_id=ash, course_id=world["phy"], topic_id=forces, kind="single",
                     stem="F = ?", options=_choice(["a", "b"]), answer={"options": ["b"]}, explanation="F = ma.",
                     source="pyq", source_label="University exam, Dec 2025"),
            Question(id=q["spare"], institution_id=ash, course_id=world["phy"], topic_id=kin, kind="single",
                     stem="Spare question", options=_choice(["a", "b"]), answer={"options": ["a"]},
                     explanation="Spare."),
        ])
        s.add_all([
            Assessment(id=quiz, institution_id=ash, course_id=world["phy"], title="Quiz 1", kind="quiz",
                       counts_toward_grade=True, max_attempts=2),
            Assessment(id=mock, institution_id=ash, course_id=world["phy"], title="Mock test 1", kind="mock",
                       duration_minutes=30, marks_correct=4, marks_wrong=-1, tutor_allowed=False,
                       opens_at=now - timedelta(hours=1), closes_at=now + timedelta(days=1)),
            Assessment(id=upcoming, institution_id=ash, course_id=world["phy"], title="Later", kind="quiz",
                       opens_at=now + timedelta(days=2)),
            Assessment(id=closed, institution_id=ash, course_id=world["phy"], title="Gone", kind="quiz",
                       opens_at=now - timedelta(days=5), closes_at=now - timedelta(days=1)),
            Assessment(id=check, institution_id=ash, course_id=world["phy"], title="Check", kind="exam_check",
                       tutor_allowed=False),
        ])
        await s.flush()
        quiz_items = ["single", "multiple", "numeric", "true_false"]
        for pos, name in enumerate(quiz_items, start=1):
            s.add(AssessmentItem(assessment_id=quiz, question_id=q[name], position=pos))
        for pos, (name, section_title) in enumerate(
                [("single", "Kinematics"), ("multiple", "Kinematics"), ("numeric", "Kinematics"),
                 ("forces", "Forces")], start=1):
            s.add(AssessmentItem(assessment_id=mock, question_id=q[name], section=section_title, position=pos))
        for target in (upcoming, closed, check):
            s.add(AssessmentItem(assessment_id=target, question_id=q["single"], position=1))
        s.add_all([
            Flashcard(institution_id=ash, course_id=world["phy"], topic_id=kin, front="Velocity?",
                      back="Displacement per unit time."),
            Flashcard(institution_id=ash, course_id=world["phy"], topic_id=kin, front="Speed?",
                      back="Distance per unit time."),
        ])
        await s.commit()
    return {**world, "sol": sol, "forces": forces, "q": q, "quiz": quiz, "mock": mock, "upcoming": upcoming,
            "closed": closed, "check": check}


async def _course(stack, course_id):
    from services.learning.models import Course

    async with stack.session("learning") as s:
        return await s.get(Course, course_id)


async def _start(client, assessment_id) -> dict:
    response = await client.post(f"/api/v1/student/assessments/{assessment_id}/attempts", headers=FETCH)
    assert response.status_code in (200, 201), response.text
    return response.json()


async def _answer(client, attempt_id, question_id, response, **extra):
    return await client.put(f"/api/v1/student/attempts/{attempt_id}/answers/{question_id}",
                            json={"response": response, **extra}, headers=FETCH)


async def _submit(client, attempt_id) -> dict:
    response = await client.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=FETCH)
    assert response.status_code == 200, response.text
    return response.json()


def _no_key(payload) -> bool:
    text = json.dumps(payload)
    return '"answer"' not in text and '"explanation"' not in text and '"correctAnswer"' not in text


# ---- hub ----

@pytest.mark.asyncio
async def test_hub_lists_my_courses_tests_without_answer_keys(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        hub = (await sana.get(HUB)).json()

    by_title = {a["title"]: a for a in hub["assessments"]}
    assert {"Quiz 1", "Mock test 1", "Later", "Gone", "Check"} <= set(by_title)
    assert by_title["Later"]["status"] == "upcoming" and by_title["Gone"]["status"] == "closed"
    assert by_title["Mock test 1"]["marking"] == {"correct": 4.0, "wrong": -1.0}
    assert hub["review"]["total"] == 2
    assert _no_key(hub)


# ---- attempts ----

@pytest.mark.asyncio
async def test_starting_an_attempt_hides_the_answer_key(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["quiz"])

    assert attempt["status"] == "in_progress"
    assert sum(len(s["questions"]) for s in attempt["sections"]) == 4
    assert _no_key(attempt)


@pytest.mark.asyncio
async def test_starting_again_resumes_the_attempt_in_progress(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        first = await _start(sana, bank["quiz"])
        again = await _start(sana, bank["quiz"])

    assert again["id"] == first["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("which", ["upcoming", "closed"])
async def test_tests_outside_their_window_cannot_be_started(stack, bank, which):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"/api/v1/student/assessments/{bank[which]}/attempts", headers=FETCH)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_attempt_limit_is_enforced(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        for _ in range(2):
            await _submit(sana, (await _start(sana, bank["quiz"]))["id"])
        third = await sana.post(f"/api/v1/student/assessments/{bank['quiz']}/attempts", headers=FETCH)

    assert third.status_code == 409


@pytest.mark.asyncio
async def test_answers_autosave_and_count_changes(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["quiz"])
        await _answer(sana, attempt["id"], bank["q"]["single"], {"options": ["b"]})
        await _answer(sana, attempt["id"], bank["q"]["single"], {"options": ["a"]}, markedForReview=True)
        resumed = await _start(sana, bank["quiz"])

    saved = next(q for s in resumed["sections"] for q in s["questions"] if q["id"] == str(bank["q"]["single"]))
    assert saved["response"] == {"options": ["a"]} and saved["markedForReview"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("question,response", [
    ("single", {"options": ["z"]}),  # not an option
    ("single", {"options": ["a", "b"]}),  # single takes one
    ("multiple", {"options": []}),
    ("numeric", {"value": "fast"}),
])
async def test_malformed_responses_are_refused(stack, bank, question, response):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["quiz"])
        saved = await _answer(sana, attempt["id"], bank["q"][question], response)

    assert saved.status_code == 422


@pytest.mark.asyncio
async def test_mock_scores_with_negative_marking(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["mock"])
        await _answer(sana, attempt["id"], bank["q"]["single"], {"options": ["a"]})  # +4
        await _answer(sana, attempt["id"], bank["q"]["multiple"], {"options": ["a"]})  # partial is wrong: -1
        await _answer(sana, attempt["id"], bank["q"]["numeric"], {"value": 9.85})  # within tolerance: +4
        result = await _submit(sana, attempt["id"])  # forces skipped: 0

    assert (result["score"], result["maxScore"]) == (7.0, 16.0)
    assert (result["correct"], result["wrong"], result["skipped"]) == (2, 1, 1)


@pytest.mark.asyncio
async def test_time_up_submits_the_attempt_and_refuses_late_answers(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["mock"])
        async with stack.session("learning") as s:
            row = await s.get(Attempt, uuid.UUID(attempt["id"]))
            row.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
            await s.commit()
        late = await _answer(sana, attempt["id"], bank["q"]["single"], {"options": ["a"]})
        result = (await sana.get(f"/api/v1/student/attempts/{attempt['id']}")).json()

    assert late.status_code == 409
    assert result["status"] == "submitted"


@pytest.mark.asyncio
async def test_other_students_cannot_open_your_attempt(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["quiz"])
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        peek = await sam.get(f"/api/v1/student/attempts/{attempt['id']}")

    assert peek.status_code == 404


# ---- results and analytics ----

async def _sit_mock(stack, email: str, bank, *, right: int) -> dict:
    order = ["single", "multiple", "numeric", "forces"]
    correct = {"single": {"options": ["a"]}, "multiple": {"options": ["a", "c"]}, "numeric": {"value": 9.8},
               "forces": {"options": ["b"]}}
    wrong = {"single": {"options": ["b"]}, "multiple": {"options": ["b"]}, "numeric": {"value": 1},
             "forces": {"options": ["a"]}}
    async with _signed_in(stack, email) as client:
        attempt = await _start(client, bank["mock"])
        for i, name in enumerate(order):
            await _answer(client, attempt["id"], bank["q"][name], correct[name] if i < right else wrong[name],
                          timeSeconds=20 + i * 10)
        return await _submit(client, attempt["id"])


@pytest.mark.asyncio
async def test_rank_and_percentile_need_three_students(stack, bank):
    await _sit_mock(stack, "sam@ashf.example.edu", bank, right=4)
    two = await _sit_mock(stack, "sana@ashf.example.edu", bank, right=2)
    assert two["rank"] is None

    await _sit_mock(stack, "sol@ashf.example.edu", bank, right=1)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        result = (await sana.get(f"/api/v1/student/attempts/{two['id']}")).json()

    assert result["rank"] == {"position": 2, "of": 3, "tiedWith": 0, "percentile": 50.0}


@pytest.mark.asyncio
async def test_mock_review_waits_for_the_window_to_close(stack, bank):
    result = await _sit_mock(stack, "sana@ashf.example.edu", bank, right=2)

    assert result["reviewAvailable"] is False and result["questions"] == []
    assert _no_key(result)


@pytest.mark.asyncio
async def test_quiz_answers_stay_hidden_while_attempts_remain(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        first = await _submit(sana, (await _start(sana, bank["quiz"]))["id"])

    assert first["reviewAvailable"] is False and first["questions"] == []
    assert _no_key(first)


@pytest.mark.asyncio
async def test_quiz_review_shows_answers_and_explanations_once_attempts_are_used(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _submit(sana, (await _start(sana, bank["quiz"]))["id"])
        attempt = await _start(sana, bank["quiz"])
        await _answer(sana, attempt["id"], bank["q"]["true_false"], {"options": ["true"]})
        result = await _submit(sana, attempt["id"])

    reviewed = next(q for q in result["questions"] if q["id"] == str(bank["q"]["true_false"]))
    assert reviewed["correctAnswer"] == {"options": ["false"]} and reviewed["isCorrect"] is False
    assert reviewed["explanation"] == "Speed is a magnitude."


@pytest.mark.asyncio
async def test_analytics_break_down_topics_speed_and_behaviour(stack, bank):
    result = await _sit_mock(stack, "sana@ashf.example.edu", bank, right=3)

    topics = {t["title"]: t for t in result["topics"]}
    assert (topics["Kinematics"]["correct"], topics["Kinematics"]["attempted"]) == (3, 3)
    assert (topics["Forces"]["correct"], topics["Forces"]["attempted"]) == (0, 1)
    assert sum(result["speed"]["quadrants"].values()) == 4
    assert {s["title"] for s in result["sections"]} == {"Kinematics", "Forces"}


# ---- improvement sets ----

async def _close(stack, assessment_id) -> None:
    async with stack.session("learning") as s:
        (await s.get(Assessment, assessment_id)).closes_at = datetime.now(UTC) - timedelta(minutes=1)
        await s.commit()


@pytest.mark.asyncio
async def test_improvement_set_from_an_open_mock_is_refused(stack, bank):
    result = await _sit_mock(stack, "sana@ashf.example.edu", bank, right=1)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        made = await sana.post(f"/api/v1/student/attempts/{result['id']}/improvement-set", headers=FETCH)

    assert made.status_code == 409
    assert made.json()["details"]["reviewAvailableAt"]


@pytest.mark.asyncio
async def test_improvement_set_targets_mistakes_and_stays_private(stack, bank):
    result = await _sit_mock(stack, "sana@ashf.example.edu", bank, right=1)
    await _close(stack, bank["mock"])
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        made = await sana.post(f"/api/v1/student/attempts/{result['id']}/improvement-set", headers=FETCH)
        hub = (await sana.get(HUB)).json()
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        peek = await sam.get(f"/api/v1/student/assessments/{made.json()['id']}")

    assert made.status_code == 201
    async with stack.session("learning") as s:
        items = set((await s.execute(select(AssessmentItem.question_id).where(
            AssessmentItem.assessment_id == uuid.UUID(made.json()["id"])))).scalars())
    assert {bank["q"]["multiple"], bank["q"]["numeric"], bank["q"]["forces"]} <= items
    assert bank["q"]["spare"] in items  # topped up from the same topic
    assert bank["q"]["true_false"] not in items  # still in a running quiz, so never handed out
    assert [s["id"] for s in hub["improvementSets"]] == [made.json()["id"]]
    assert peek.status_code == 404


# ---- races and boundaries ----

@pytest.mark.asyncio
async def test_two_tabs_starting_at_once_share_one_attempt(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as tab_one, \
            _signed_in(stack, "sana@ashf.example.edu") as tab_two:
        one, two = await asyncio.gather(
            tab_one.post(f"/api/v1/student/assessments/{bank['quiz']}/attempts", headers=FETCH),
            tab_two.post(f"/api/v1/student/assessments/{bank['quiz']}/attempts", headers=FETCH))

    assert {one.status_code, two.status_code} <= {200, 201}
    assert one.json()["id"] == two.json()["id"]
    async with stack.session("learning") as s:
        attempts = (await s.execute(select(Attempt).where(Attempt.assessment_id == bank["quiz"]))).scalars().all()
    assert len(attempts) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("value,score", [(9.9, 4.0), (9.7, 4.0), (9.91, -1.0)])
async def test_numeric_tolerance_is_inclusive_at_the_edge(stack, bank, value, score):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["mock"])
        await _answer(sana, attempt["id"], bank["q"]["numeric"], {"value": value})
        result = await _submit(sana, attempt["id"])

    assert result["score"] == score


@pytest.mark.asyncio
@pytest.mark.parametrize("response", [
    {"value": 1e10},  # beyond the numeric bound
    {"value": 10 ** 400},  # would overflow a float
    {"value": 5, "note": "extra keys are not stored"},
    {"options": [["a"]]},  # nested, not an option id
    {"options": ["a"] * 11},
])
async def test_out_of_shape_responses_are_refused(stack, bank, response):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["quiz"])
        question = bank["q"]["numeric"] if "value" in response else bank["q"]["multiple"]
        saved = await _answer(sana, attempt["id"], question, response)

    assert saved.status_code == 422


# ---- AI practice ----

AI_QUESTIONS = json.dumps({"questions": [
    {"kind": "single", "stem": "What is velocity?", "options": [{"id": "a", "text": "Speed with direction"},
     {"id": "b", "text": "Distance"}], "answer": {"options": ["a"]}, "explanation": "Vectors.", "difficulty": 1},
    {"kind": "numeric", "stem": "2 + 2?", "answer": {"value": 4}, "explanation": "Sum."},
    {"kind": "single", "stem": "Broken", "options": [{"id": "a", "text": "Only"}], "answer": {"options": ["z"]},
     "explanation": "Invalid."},
]})


def _ai(stack, reply: str) -> FakeTutor:
    fake = FakeTutor("anthropic", reply=reply)
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}
    return fake


@pytest.mark.asyncio
async def test_ai_practice_keeps_only_valid_questions(stack, bank):
    fake = _ai(stack, "Here you go: " + AI_QUESTIONS)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        made = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/ai-practice", headers=FETCH)

    assert made.status_code == 201, made.text
    assert made.json()["questionCount"] == 2
    assert "Velocity is displacement per unit time." in "\n".join(fake.calls[0]["system"]) + str(
        fake.calls[0]["history"])
    async with stack.session("learning") as s:
        owners = set((await s.execute(select(Question.owner_id).where(Question.source == "ai"))).scalars())
    assert owners == {bank["sana"]}


@pytest.mark.asyncio
@pytest.mark.parametrize("tutor", ["garbage", "down"])
async def test_ai_practice_reports_unavailable(stack, bank, tutor):
    if tutor == "down":
        stack.apps["learning"].state.tutor_providers = {"anthropic": DownTutor("anthropic"),
                                                        "openai": DownTutor("openai")}
    else:
        _ai(stack, "not json at all")
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/ai-practice", headers=FETCH)

    assert response.status_code == 503
    assert response.json()["code"] == "AI_UNAVAILABLE"


@pytest.mark.asyncio
async def test_ai_practice_has_a_daily_cap(stack, bank):
    _ai(stack, AI_QUESTIONS)
    stack.apps["learning"].state.settings.ai_practice_per_day = 1
    try:
        async with _signed_in(stack, "sana@ashf.example.edu") as sana:
            first = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/ai-practice", headers=FETCH)
            second = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/ai-practice", headers=FETCH)
    finally:
        stack.apps["learning"].state.settings.ai_practice_per_day = 20

    assert (first.status_code, second.status_code) == (201, 429)


@pytest.mark.asyncio
async def test_failed_ai_calls_still_use_the_daily_allowance(stack, bank):
    stack.apps["learning"].state.tutor_providers = {"anthropic": DownTutor("anthropic"), "openai": DownTutor("openai")}
    stack.apps["learning"].state.settings.ai_practice_per_day = 1
    try:
        async with _signed_in(stack, "sana@ashf.example.edu") as sana:
            first = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/ai-practice", headers=FETCH)
            second = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/ai-practice", headers=FETCH)
    finally:
        stack.apps["learning"].state.settings.ai_practice_per_day = 20

    assert (first.status_code, second.status_code) == (503, 429)


@pytest.mark.asyncio
async def test_ai_practice_needs_lessons_to_ground_it(stack, bank):
    fake = _ai(stack, AI_QUESTIONS)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"/api/v1/student/topics/{bank['forces']}/ai-practice", headers=FETCH)

    assert response.status_code == 409
    assert fake.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["topics/{kinematics}/ai-practice", "lessons/{velocity}/flashcards"])
async def test_ai_helpers_are_locked_during_an_unassisted_check(stack, bank, path):
    fake = _ai(stack, AI_QUESTIONS)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _start(sana, bank["check"])
        response = await sana.post("/api/v1/student/" + path.format(**bank), headers=FETCH)

    assert response.status_code == 409 and response.json()["code"] == "TUTOR_LOCKED"
    assert fake.calls == []


@pytest.mark.parametrize("raw", [
    {"kind": "single", "stem": "Q", "options": [{"id": 1, "text": "x"}, {"id": "b", "text": "y"}],
     "answer": {"options": ["b"]}, "explanation": "E"},  # option id is not a string
    {"kind": "multiple", "stem": "Q", "options": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}],
     "answer": {"options": [["a"]]}, "explanation": "E"},  # nested answer
    {"kind": "numeric", "stem": "Q", "answer": {"value": 10, "tolerance": 5}, "explanation": "E"},  # loose
    {"kind": "numeric", "stem": "Q", "answer": {"value": 1e12}, "explanation": "E"},  # out of bounds
])
def test_generated_questions_with_bad_shapes_are_dropped(raw):
    assert validate_generated_question(raw) is None


@pytest.mark.asyncio
async def test_ai_practice_is_only_for_your_own_topics(stack, bank):
    _ai(stack, AI_QUESTIONS)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"/api/v1/student/topics/{bank['other_topic']}/ai-practice", headers=FETCH)

    assert response.status_code == 404


# ---- practice from the question bank ----

@pytest.mark.asyncio
async def test_bank_practice_uses_safe_bank_questions_only(stack, bank):
    async with stack.session("learning") as s:
        s.add(Question(institution_id=(await s.get(Assessment, bank["quiz"])).institution_id,
                       course_id=bank["phy"], topic_id=bank["kinematics"], kind="single", stem="Sam's AI question",
                       options=_choice(["a", "b"]), answer={"options": ["a"]}, explanation="AI.", source="ai",
                       owner_id=bank["sam"]))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        made = await sana.post(f"/api/v1/student/topics/{bank['kinematics']}/bank-practice", headers=FETCH)

    assert made.status_code == 201, made.text
    assert made.json()["personal"] is True
    async with stack.session("learning") as s:
        items = set((await s.execute(select(AssessmentItem.question_id).where(
            AssessmentItem.assessment_id == uuid.UUID(made.json()["id"])))).scalars())
    assert items == {bank["q"]["spare"]}  # running-test questions and others' AI questions are left out


@pytest.mark.asyncio
async def test_bank_practice_needs_questions_to_draw_on(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"/api/v1/student/topics/{bank['forces']}/bank-practice", headers=FETCH)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_bank_practice_is_only_for_your_own_topics(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(f"/api/v1/student/topics/{bank['other_topic']}/bank-practice", headers=FETCH)

    assert response.status_code == 404


# ---- tutor lock ----

@pytest.mark.asyncio
async def test_tutor_is_locked_during_an_unassisted_check(stack, bank):
    _ai(stack, "A hint.")
    stack.apps["learning"].state.tutor_limiter.reset()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        attempt = await _start(sana, bank["check"])
        locked = await sana.post(TUTOR, json={"message": "help"}, headers=FETCH)
        await _submit(sana, attempt["id"])
        unlocked = await sana.post(TUTOR, json={"message": "help"}, headers=FETCH)

    assert locked.status_code == 409 and locked.json()["code"] == "TUTOR_LOCKED"
    assert unlocked.status_code == 200


# ---- review deck ----

@pytest.mark.asyncio
async def test_review_deck_offers_new_cards_and_schedules_ratings(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        due = (await sana.get("/api/v1/student/review/due")).json()
        card = due["cards"][0]
        rated = (await sana.post(f"/api/v1/student/review/{card['id']}", json={"rating": "good"},
                                 headers=FETCH)).json()
        after = (await sana.get("/api/v1/student/review/due")).json()

    assert card["isNew"] is True and len(due["cards"]) == 2
    assert 0.9 < rated["intervalDays"] < 1.1
    assert card["id"] not in [c["id"] for c in after["cards"]]


@pytest.mark.asyncio
async def test_review_rating_is_validated(stack, bank):
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        card = (await sana.get("/api/v1/student/review/due")).json()["cards"][0]
        response = await sana.post(f"/api/v1/student/review/{card['id']}", json={"rating": "meh"}, headers=FETCH)

    assert response.status_code == 422


NOW = datetime(2026, 10, 12, 9, tzinfo=UTC)


@pytest.mark.parametrize("rating,reps,interval,expected_days", [
    ("good", 0, 0.0, 1.0),
    ("good", 1, 1.0, 3.0),
    ("good", 2, 3.0, 7.5),
    ("easy", 0, 0.0, 4.0),
    ("hard", 0, 0.0, 1.0),
])
def test_schedule_review_intervals(rating, reps, interval, expected_days):
    state = schedule_review(ReviewState(interval_days=interval, ease=2.5, reps=reps, lapses=0), rating, NOW)

    assert state.interval_days == pytest.approx(expected_days)
    assert state.due_at == NOW + timedelta(days=expected_days)


def test_forgetting_a_card_resets_it_and_lowers_ease():
    state = schedule_review(ReviewState(interval_days=10.0, ease=2.5, reps=4, lapses=0), "again", NOW)

    assert (state.reps, state.lapses, state.interval_days) == (0, 1, 0.0)
    assert state.ease == pytest.approx(2.3)
    assert state.due_at == NOW + timedelta(minutes=10)


def test_ease_never_drops_below_the_floor():
    state = schedule_review(ReviewState(interval_days=1.0, ease=1.3, reps=1, lapses=3), "again", NOW)

    assert state.ease == pytest.approx(1.3)


@pytest.mark.asyncio
async def test_ai_flashcards_from_a_lesson_belong_to_the_student(stack, bank):
    _ai(stack, json.dumps({"cards": [{"front": "Velocity", "back": "Rate of displacement."},
                                     {"front": "", "back": "Invalid, empty front."}]}))
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        made = await sana.post(f"/api/v1/student/lessons/{bank['velocity']}/flashcards", headers=FETCH)
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        sams_deck = (await sam.get("/api/v1/student/review/due")).json()

    assert made.status_code == 201 and [c["front"] for c in made.json()["cards"]] == ["Velocity"]
    assert "Velocity" not in [c["front"] for c in sams_deck["cards"]]
    async with stack.session("learning") as s:
        kinds = [e.kind for e in (await s.execute(select(LearningEvent))).scalars()]
    assert "ai_flashcards_generated" in kinds


# ---- teacher ----

@pytest.mark.asyncio
async def test_teacher_sees_ranked_results_and_weak_topics(stack, bank):
    await _sit_mock(stack, "sam@ashf.example.edu", bank, right=4)
    await _sit_mock(stack, "sana@ashf.example.edu", bank, right=3)
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        listing = (await tara.get("/api/v1/teacher/assessments")).json()
        results = (await tara.get(f"/api/v1/teacher/assessments/{bank['mock']}/results")).json()
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        other = await omar.get(f"/api/v1/teacher/assessments/{bank['mock']}/results")

    mock = next(a for a in listing["assessments"] if a["id"] == str(bank["mock"]))
    assert mock["attempts"] == 2
    assert [(r["rank"], r["name"]) for r in results["students"]] == [(1, "Sam Okafor"), (2, "Sana Okafor")]
    assert results["weakTopics"][0]["title"] == "Forces"
    assert other.status_code == 404


@pytest.mark.parametrize("others,mine,expected", [
    ([22, 21, 17, 17, 17], 17, {"position": 3, "of": 6, "tiedWith": 3, "percentile": 30.0}),  # ties count half
    ([10, 5], 20, {"position": 1, "of": 3, "tiedWith": 0, "percentile": 100.0}),
    ([10, 5], 1, {"position": 3, "of": 3, "tiedWith": 0, "percentile": 0.0}),
])
def test_rank_shares_positions_and_halves_ties(others, mine, expected):
    assert rank_among(others, mine) == expected
