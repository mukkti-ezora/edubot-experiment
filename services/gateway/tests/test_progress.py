"""Progress: grades, what-if maths, CGPA/SGPA, mastery by topic, and the credit tracker (ABC/APAAR, NPTEL)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from services.gateway.tests.conftest import audit_rows
from services.gateway.tests.test_doubts import FETCH, _signed_in, world  # noqa: F401
from services.learning.models import (
    Assessment,
    Assignment,
    Attempt,
    AttemptAnswer,
    CourseResult,
    CreditTransferRequest,
    MoocCourse,
    Programme,
    Question,
    StudentProgramme,
    Submission,
)
from services.learning.progress import (
    CategoryScore,
    MarkedAnswer,
    course_percentage,
    grade_for,
    grade_point_average,
    mastery_level,
    term_order,
)

PROGRESS = "/api/v1/student/progress"
CREDITS = "/api/v1/student/credits"
TEACHER_CREDITS = "/api/v1/teacher/requests/credits"


# ---- pure grade maths ----

@pytest.mark.parametrize("percent,grade,point", [
    (100, "O", 10), (90, "O", 10), (89.99, "A+", 9), (80, "A+", 9), (70, "A", 8), (60, "B+", 7),
    (50, "B", 6), (45, "C", 5), (44.99, "P", 4), (40, "P", 4), (39.99, "F", 0), (0, "F", 0),
])
def test_ugc_ten_point_scale_cut_offs_are_inclusive(percent, grade, point):
    assert grade_for(percent) == (grade, point)


def test_course_percentage_renormalises_ungraded_categories():
    categories = [CategoryScore("Assignments", 40, 18, 20), CategoryScore("Quizzes", 20, 0, 0),
                  CategoryScore("Mid-term", 40, 30, 50)]

    assert course_percentage(categories) == pytest.approx((40 * 0.9 + 40 * 0.6) / 80 * 100)


def test_course_percentage_is_unknown_before_anything_is_graded():
    assert course_percentage([CategoryScore("Assignments", 40, 0, 0)]) is None


def test_gpa_is_credit_weighted_and_counts_failures():
    assert grade_point_average([(4, 10), (2, 0)]) == pytest.approx(6.67)
    assert grade_point_average([]) is None


def test_terms_sort_by_year_then_season():
    terms = ["2026 Autumn", "2025 Autumn", "2026 Spring"]

    assert sorted(terms, key=term_order) == ["2025 Autumn", "2026 Spring", "2026 Autumn"]


def test_terms_without_a_year_sort_naturally():
    assert sorted(["Sem 10", "Sem 2", "Sem 1"], key=term_order) == ["Sem 1", "Sem 2", "Sem 10"]


def _answers(results: list[bool], *, days_ago: float = 0, unassisted: bool = False) -> list[MarkedAnswer]:
    when = datetime.now(UTC) - timedelta(days=days_ago)
    return [MarkedAnswer(uuid.uuid4(), r, when, unassisted) for r in results]


def test_mastery_needs_volume_and_an_unassisted_check():
    practised, too_few, checked = (_answers([True] * 6), _answers([True] * 5, unassisted=True),
                                   _answers([True] * 6, unassisted=True))
    now = datetime.now(UTC)

    assert mastery_level(practised, now)[0] == "proficient"
    assert mastery_level(too_few, now)[0] == "proficient"
    assert mastery_level(checked, now)[0] == "mastered"


@pytest.mark.parametrize("results,level", [
    ([], "not_started"), ([False, False, True], "attempted"), ([True, False], "familiar"),
    ([True, True, True, False], "proficient"),
])
def test_mastery_levels_follow_accuracy(results, level):
    assert mastery_level(_answers(results), datetime.now(UTC))[0] == level


def test_recent_mistakes_pull_mastery_down():
    old_successes = _answers([True] * 8, days_ago=60, unassisted=True)
    recent_mistakes = _answers([False, False, False])

    assert mastery_level(old_successes + recent_mistakes, datetime.now(UTC))[0] == "attempted"


# ---- course grades through the gateway ----

async def _graded_assignment(stack, world, *, points: int, score: int,  # noqa: F811
                             feedback: str | None = None) -> uuid.UUID:
    assignment = uuid.uuid4()
    async with stack.session("learning") as s:
        s.add(Assignment(id=assignment, institution_id=uuid.uuid4(), course_id=world["phy"], title="Lab report",
                         kind="assignment", due_at=datetime.now(UTC), points=points))
        await s.flush()
        s.add(Submission(institution_id=uuid.uuid4(), assignment_id=assignment, person_id=world["sana"],
                         status="graded", score=score, feedback=feedback, graded_at=datetime.now(UTC)))
        await s.commit()
    return assignment


@pytest.mark.asyncio
async def test_the_grade_matches_the_percentage_shown(stack, world):  # noqa: F811
    await _graded_assignment(stack, world, points=10000, score=8996)  # 89.96%, shown as 90.0
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        course = (await sana.get(PROGRESS)).json()["courses"][0]

    assert (course["percent"], course["grade"]) == (90.0, "O")


@pytest.mark.asyncio
async def test_course_grade_comes_from_graded_work(stack, world):  # noqa: F811
    await _graded_assignment(stack, world, points=20, score=18, feedback="Clear method.")
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        overview = (await sana.get(PROGRESS)).json()

    physics = next(c for c in overview["courses"] if c["code"] == "PHY101")
    assert (physics["percent"], physics["grade"], physics["gradePoint"]) == (90.0, "O", 10)
    assert physics["feedbackReady"] == 1 and overview["feedbackReady"] == 1


@pytest.mark.asyncio
async def test_drafts_and_ungraded_work_do_not_count(stack, world):  # noqa: F811
    async with stack.session("learning") as s:
        assignment = uuid.uuid4()
        s.add(Assignment(id=assignment, institution_id=uuid.uuid4(), course_id=world["phy"], title="Draft",
                         kind="assignment", due_at=datetime.now(UTC), points=10))
        await s.flush()
        s.add(Submission(institution_id=uuid.uuid4(), assignment_id=assignment, person_id=world["sana"],
                         status="draft"))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        physics = next(c for c in (await sana.get(PROGRESS)).json()["courses"] if c["code"] == "PHY101")

    assert physics["percent"] is None and physics["gradedItems"] == 0


@pytest.mark.asyncio
async def test_course_detail_gives_what_if_inputs(stack, world):  # noqa: F811
    await _graded_assignment(stack, world, points=20, score=15)
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        detail = (await sana.get(f"{PROGRESS}/courses/{world['phy']}")).json()

    assignments = next(c for c in detail["categories"] if c["name"] == "Assignments")
    assert (assignments["weight"], assignments["earned"], assignments["max"]) == (40, 15, 20)
    assert [i["title"] for i in detail["items"]] == ["Lab report"]
    assert detail["scale"][0] == {"grade": "O", "min": 90, "point": 10}


@pytest.mark.asyncio
async def test_course_detail_of_another_class_is_hidden(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.get(f"{PROGRESS}/courses/{world['chm']}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_record_gives_sgpa_per_term_and_cgpa(stack, world):  # noqa: F811
    ash = await _institution(stack, world)
    async with stack.session("learning") as s:
        s.add_all([
            CourseResult(institution_id=ash, person_id=world["sana"], term="2025 Autumn", code="A", title="A",
                         credits=4, grade="O", grade_point=10),
            CourseResult(institution_id=ash, person_id=world["sana"], term="2026 Spring", code="B", title="B",
                         credits=4, grade="B", grade_point=6),
            CourseResult(institution_id=ash, person_id=world["sana"], term="2026 Spring", code="C", title="C",
                         credits=2, grade="F", grade_point=0),
        ])
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        record = (await sana.get(PROGRESS)).json()["record"]

    assert [(t["term"], t["sgpa"], t["credits"]) for t in record["terms"]] == [
        ("2025 Autumn", 10.0, 4), ("2026 Spring", 4.0, 4)]
    assert record["cgpa"] == 6.4 and record["creditsEarned"] == 8


# ---- mastery through the gateway ----

async def _answered(stack, world, results: list[bool], *, kind: str = "quiz") -> None:  # noqa: F811
    async with stack.session("learning") as s:
        assessment, attempt = uuid.uuid4(), uuid.uuid4()
        s.add(Assessment(id=assessment, institution_id=uuid.uuid4(), course_id=world["phy"], title="Check",
                         kind=kind))
        await s.flush()
        s.add(Attempt(id=attempt, institution_id=uuid.uuid4(), assessment_id=assessment, person_id=world["sana"],
                      status="submitted", submitted_at=datetime.now(UTC)))
        for correct in results:
            question = uuid.uuid4()
            s.add(Question(id=question, institution_id=uuid.uuid4(), course_id=world["phy"],
                           topic_id=world["kinematics"], kind="single", stem="?", answer={"options": ["a"]}))
            await s.flush()
            s.add(AttemptAnswer(attempt_id=attempt, question_id=question, response={"options": ["a"]},
                                is_correct=correct))
        await s.commit()


@pytest.mark.asyncio
async def test_mastery_lists_every_topic_with_its_level(stack, world):  # noqa: F811
    await _answered(stack, world, [True] * 6, kind="mock")
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        topics = (await sana.get("/api/v1/student/mastery")).json()["topics"]

    kinematics = next(t for t in topics if t["title"] == "Kinematics")
    assert (kinematics["level"], kinematics["previousLevel"], kinematics["answered"]) == (
        "mastered", "not_started", 6)
    assert all(t["courseCode"] == "PHY101" for t in topics)  # chemistry isn't her class


# ---- credits ----

async def _institution(stack, world) -> uuid.UUID:  # noqa: F811
    from services.learning.models import Course

    async with stack.session("learning") as s:
        return (await s.execute(select(Course.institution_id).where(Course.id == world["phy"]))).scalar_one()


TERM_CREDITS = 10  # PHY101 this term: a 40% MOOC cap is 4 credits


@pytest.fixture
async def programme(stack, world):  # noqa: F811
    from services.learning.models import Course

    ash = await _institution(stack, world)
    programme_id, mooc, two_credit, one_credit = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with stack.session("learning") as s:
        (await s.get(Course, world["phy"])).credits = TERM_CREDITS
        s.add(Programme(id=programme_id, institution_id=ash, name="B.Sc. Physical Sciences", total_credits=160,
                        requirements=[{"category": "Core", "credits": 96}, {"category": "Skill", "credits": 24}],
                        exit_points=[{"credits": 40, "award": "UG Certificate"},
                                     {"credits": 80, "award": "UG Diploma"}]))
        await s.flush()
        s.add_all([
            StudentProgramme(person_id=world["sana"], institution_id=ash, programme_id=programme_id,
                             admitted_year=2025, advisor_id=world["tara"]),
            CourseResult(institution_id=ash, person_id=world["sana"], term="2025 Autumn", code="X", title="X",
                         credits=40, grade="A", grade_point=8),
            MoocCourse(id=mooc, institution_id=ash, provider="NPTEL", title="Introduction to Machine Learning",
                       weeks=12, credits=3, category="Elective", url="https://onlinecourses.nptel.ac.in/"),
            MoocCourse(id=two_credit, institution_id=ash, provider="NPTEL", title="Data Analytics", weeks=8,
                       credits=2, category="Skill", url="https://onlinecourses.nptel.ac.in/"),
            MoocCourse(id=one_credit, institution_id=ash, provider="NPTEL", title="Ethics", weeks=4,
                       credits=1, category="Value-added", url="https://onlinecourses.nptel.ac.in/"),
        ])
        await s.commit()
    return {"mooc": mooc, "two_credit": two_credit, "one_credit": one_credit, "institution": ash}


@pytest.mark.asyncio
async def test_credits_track_requirements_and_the_next_exit_point(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        summary = (await sana.get(CREDITS)).json()

    assert summary["earned"] == 40 and summary["inProgress"] == TERM_CREDITS
    assert summary["requirements"][0] == {"category": "Core", "required": 96, "earned": 40,
                                          "inProgress": TERM_CREDITS}
    assert summary["exitPoints"][0]["reached"] is True
    assert summary["nextExit"] == {"credits": 80, "award": "UG Diploma", "creditsNeeded": 40}
    assert summary["mooc"]["termCap"] == 4  # 40% of the 10 credits this term
    assert summary["abc"]["status"] == "not_linked"


@pytest.mark.asyncio
async def test_credits_need_a_programme(stack, world):  # noqa: F811
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        response = await sam.get(CREDITS)

    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("apaar_id,status_code", [
    ("1234 5678 9012", 200), ("12345678901", 422), ("1234567890123", 422), ("12345678901a", 422),
    ("\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u0660\u0661\u0662", 422),  # Arabic-Indic digits
])
async def test_apaar_id_is_exactly_twelve_digits(stack, world, programme, apaar_id, status_code):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.put(f"{CREDITS}/apaar", json={"apaarId": apaar_id}, headers=FETCH)

    assert response.status_code == status_code


@pytest.mark.asyncio
async def test_saved_apaar_id_is_masked_and_awaits_abc_sync(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        saved = (await sana.put(f"{CREDITS}/apaar", json={"apaarId": "123456789012"}, headers=FETCH)).json()

    assert saved["apaarId"] == "•••• •••• 9012" and saved["status"] == "pending"
    assert "Academic Bank of Credits" in saved["note"]


async def _request_transfer(client, programme, score: float = 82, course: str = "mooc"):
    return await client.post(f"{CREDITS}/transfers", json={"moocCourseId": str(programme[course]),
                                                           "scorePercent": score}, headers=FETCH)


@pytest.mark.asyncio
async def test_a_transfer_request_appears_in_the_catalogue_and_tracker(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        created = await _request_transfer(sana, programme)
        catalogue = (await sana.get(f"{CREDITS}/moocs")).json()["courses"]
        summary = (await sana.get(CREDITS)).json()

    assert created.status_code == 201
    assert next(c for c in catalogue if c["id"] == str(programme["mooc"]))["requestStatus"] == "pending"
    assert summary["transfers"][0]["course"]["title"] == "Introduction to Machine Learning"


@pytest.mark.asyncio
async def test_a_course_can_only_be_claimed_once(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        await _request_transfer(sana, programme)
        again = await _request_transfer(sana, programme)

    assert again.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("score,status_code", [(39.9, 422), (40, 201)])
async def test_transfer_needs_a_passing_score(stack, world, programme, score, status_code):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await _request_transfer(sana, programme, score)

    assert response.status_code == status_code


@pytest.mark.asyncio
async def test_advisor_approval_adds_the_course_to_the_record(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        transfer = (await _request_transfer(sana, programme, 82)).json()
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            waiting = (await tara.get(TEACHER_CREDITS)).json()
            decided = await tara.post(f"{TEACHER_CREDITS}/{transfer['id']}/decide",
                                      json={"approve": True, "note": "Certificate verified."}, headers=FETCH)
        summary = (await sana.get(CREDITS)).json()

    assert waiting["pending"] == 1 and waiting["items"][0]["student"]["name"] == "Sana Okafor"
    assert decided.json()["status"] == "approved"
    assert summary["earned"] == 43  # 40 + 3 NPTEL credits
    assert ("credit_transfer.approve", "success", "tara@ashf.example.edu") in await audit_rows(stack)
    async with stack.session("learning") as s:
        result = (await s.execute(select(CourseResult).where(CourseResult.source == "nptel"))).scalar_one()
    assert (result.grade, result.grade_point) == ("A+", 9)


@pytest.mark.asyncio
async def test_only_the_advisor_can_decide(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        transfer = (await _request_transfer(sana, programme)).json()
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        listing = (await omar.get(TEACHER_CREDITS)).json()
        decided = await omar.post(f"{TEACHER_CREDITS}/{transfer['id']}/decide", json={"approve": True},
                                  headers=FETCH)

    assert listing["items"] == []
    assert decided.status_code == 404


@pytest.mark.asyncio
async def test_a_decided_request_cannot_be_decided_again(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        transfer = (await _request_transfer(sana, programme)).json()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.post(f"{TEACHER_CREDITS}/{transfer['id']}/decide", json={"approve": False}, headers=FETCH)
        again = await tara.post(f"{TEACHER_CREDITS}/{transfer['id']}/decide", json={"approve": True},
                                headers=FETCH)

    assert again.status_code == 409
    async with stack.session("learning") as s:
        assert (await s.execute(select(CreditTransferRequest.status))).scalar_one() == "declined"


# ---- MOOC credit cap (UGC: up to 40% of a term's credits) ----

@pytest.mark.asyncio
async def test_pending_requests_count_toward_the_term_cap(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        first = await _request_transfer(sana, programme, course="mooc")  # 3 of 4
        over = await _request_transfer(sana, programme, course="two_credit")  # 3 + 2 = 5
        at_cap = await _request_transfer(sana, programme, course="one_credit")  # 3 + 1 = 4
        summary = (await sana.get(CREDITS)).json()

    assert first.status_code == 201
    assert over.status_code == 409 and "cap" in over.json()["message"].lower()
    assert at_cap.status_code == 201
    assert summary["mooc"]["usedThisTerm"] == 4


@pytest.mark.asyncio
async def test_approval_refuses_a_transfer_that_would_pass_the_cap(stack, world, programme):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        transfer = (await _request_transfer(sana, programme, course="mooc")).json()  # 3 of 4
    async with stack.session("learning") as s:
        s.add(CourseResult(institution_id=programme["institution"], person_id=world["sana"], term="2026 Autumn",
                           code="NPTEL-X", title="Earlier MOOC", credits=2, grade="A", grade_point=8, source="nptel"))
        await s.commit()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        decided = await tara.post(f"{TEACHER_CREDITS}/{transfer['id']}/decide", json={"approve": True},
                                  headers=FETCH)

    assert decided.status_code == 409


@pytest.mark.asyncio
async def test_approved_credit_is_recorded_in_the_students_own_term(stack, world, programme):  # noqa: F811
    from services.learning.models import Course

    async with stack.session("learning") as s:  # a later term elsewhere in the institution
        s.add(Course(institution_id=programme["institution"], section_id=uuid.uuid4(), code="NEW200",
                     title="Next year's course", term="2027 Spring", subject="physics"))
        await s.commit()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        transfer = (await _request_transfer(sana, programme, course="one_credit")).json()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.post(f"{TEACHER_CREDITS}/{transfer['id']}/decide", json={"approve": True}, headers=FETCH)

    async with stack.session("learning") as s:
        result = (await s.execute(select(CourseResult).where(CourseResult.source == "nptel"))).scalar_one()
    assert result.term == "2026 Autumn"
