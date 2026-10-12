"""Demo data for coursework (Ashford): instructions and rubrics on the seeded assignments, a draft, graded work
with rubric feedback, and an extension request waiting for the teacher. Runs after the learning seed."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

INGRID = "ingrid.abiodun@ashf.example.edu"
KWAME = "kwame.abiodun@ashf.example.edu"
LEILA = "leila.abiodun@ashf.example.edu"
MEI = "mei.amato@ashf.example.edu"

LAB_RUBRIC = [
    {"criterion": "Method", "description": "Setup, measurements and repeats are described clearly.", "points": 8},
    {"criterion": "Analysis", "description": "g is calculated with units and an uncertainty.", "points": 8},
    {"criterion": "Conclusion", "description": "Compares the result with 9.8 m/s² and explains the gap.", "points": 4},
]
PROBLEM_RUBRIC = [
    {"criterion": "Working", "description": "Each step is shown and justified.", "points": 10},
    {"criterion": "Answers", "description": "Final answers are correct, with units.", "points": 5},
]

# (course, title) -> instructions, rubric, accepted submission types, grade category
DETAILS = {
    ("PHY101", "Lab 1: Measuring g with a pendulum"): (
        "Time 20 swings of a pendulum at four lengths. Plot T² against L and use the slope to find g.\n\n"
        "- Repeat each timing three times\n- Include a photo or scan of your data table\n- Up to 2 pages",
        LAB_RUBRIC, ["text", "file"], "Labs"),
    ("PHY101", "Problem set 2: Kinematics"): (
        "Answer questions 1 to 6 from the Kinematics lesson. Show every step: list what you know, choose an "
        "equation, then substitute.", PROBLEM_RUBRIC, ["text", "file", "link"], "Assignments"),
    ("MTH201", "Problem set 3: Integration by parts"): (
        "Five integrals by parts. For each, say why you chose your `u` and `dv`.", PROBLEM_RUBRIC,
        ["text", "file"], "Assignments"),
    ("CS110", "Exercise: FizzBuzz"): (
        "Print the numbers 1 to 100, but print `Fizz` for multiples of 3, `Buzz` for multiples of 5 and "
        "`FizzBuzz` for both. Paste your code and its output.", [], ["text", "link"], "Assignments"),
    ("CS110", "Project 1: Grade calculator"): (
        "Write a program that reads marks and prints the grade on the 10-point scale. Link your repository.",
        [], ["link", "text"], "Projects"),
}


async def seed(session, by_email: dict[str, dict], ashford) -> None:  # noqa: ANN001
    from scripts.seed import ANCHOR, uid
    from services.learning.models import Assignment, ExtensionRequest, Submission

    for (code, title), (instructions, rubric, types, category) in DETAILS.items():
        assignment = await session.get(Assignment, uid(f"assignment:{code}:{title}"))
        assignment.instructions, assignment.rubric = instructions, rubric
        assignment.submission_types, assignment.grade_category = types, category
    await session.flush()

    def existing(code: str, title: str, email: str):  # noqa: ANN202
        return select(Submission).where(Submission.assignment_id == uid(f"assignment:{code}:{title}"),
                                        Submission.person_id == by_email[email]["id"])

    newtons = (await session.execute(existing("PHY101", "Quiz: Newton's laws", INGRID))).scalar_one()
    newtons.status, newtons.score, newtons.revision = "graded", 8, 1
    newtons.text = "1. Inertia. 2. F = ma, so a = 12 / 3 = 4 m/s². 3. Equal and opposite forces on different bodies."
    newtons.feedback = "Clear answers. In question 3, name the two bodies the forces act on."
    newtons.graded_at, newtons.graded_by = ANCHOR - timedelta(days=1), by_email[LEILA]["id"]

    fizzbuzz = (await session.execute(existing("CS110", "Exercise: FizzBuzz", KWAME))).scalar_one()
    fizzbuzz.status, fizzbuzz.score, fizzbuzz.revision = "graded", 9, 1
    fizzbuzz.text = "for n in range(1, 101):\n    print('FizzBuzz' if n % 15 == 0 else 'Fizz' if n % 3 == 0 ..."
    fizzbuzz.feedback = "Works. Try writing it without the nested conditional expression so it reads more easily."
    fizzbuzz.graded_at, fizzbuzz.graded_by = ANCHOR - timedelta(hours=20), by_email[MEI]["id"]

    session.add(Submission(
        institution_id=ashford, assignment_id=uid("assignment:PHY101:Problem set 2: Kinematics"),
        person_id=by_email[INGRID]["id"], status="draft", submitted_at=None, revision=0, late_minutes=0,
        rubric_scores=[], text="Q1. u = 0, a = 2 m/s², t = 5 s, so v = u + at = 10 m/s.\n\nQ2.",
        updated_at=ANCHOR - timedelta(hours=3),
    ))
    session.add(Submission(  # handed in, waiting for Leila, so the grading queue has real work in it
        institution_id=ashford, assignment_id=uid("assignment:MTH201:Problem set 3: Integration by parts"),
        person_id=by_email[KWAME]["id"], status="submitted", submitted_at=ANCHOR - timedelta(hours=6), revision=1,
        late_minutes=0, rubric_scores=[], updated_at=ANCHOR - timedelta(hours=6),
        text="1. Let u = x, dv = e^x dx, so du = dx and v = e^x. The integral is x e^x - e^x + C.\n\n"
             "2. Let u = ln x, dv = x dx: (x^2 / 2) ln x - x^2 / 4 + C.\n\n3. I wasn't sure how to start this one.",
    ))
    lab = uid("assignment:PHY101:Lab 1: Measuring g with a pendulum")
    session.add(ExtensionRequest(
        institution_id=ashford, assignment_id=lab, person_id=by_email[INGRID]["id"],
        requested_until=ANCHOR + timedelta(days=2), status="pending", created_at=ANCHOR - timedelta(hours=5),
        reason="I was at the inter-college athletics meet on the lab day and missed the measurements. "
               "I can redo them in Thursday's open lab.",
    ))
    await session.flush()
