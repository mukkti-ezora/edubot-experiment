"""Demo data for the practice area (Ashford): question banks, quizzes, a mock test, past papers, unassisted checks,
flashcards, and attempts by real PHY101-A classmates so rank, percentile and analytics have something to show."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from services.learning.models import (
    Assessment,
    AssessmentItem,
    Attempt,
    AttemptAnswer,
    CardReview,
    Flashcard,
    Question,
)
from services.learning.practice_scoring import is_correct

# A question: (topic position, kind, stem, options, answer, explanation, difficulty, past-paper label or None).
# Choice answers are option indexes; numeric answers are (value, tolerance).
QUESTIONS = {
    "PHY101": [
        (1, "single", "A car goes 100 m east, then 100 m west in 20 s. Its average velocity is",
         ["0 m/s", "5 m/s", "10 m/s", "20 m/s"], [0],
         "Displacement is zero because it ends where it started, so average velocity is zero.", 1, None),
        (1, "multiple", "Which of these are vector quantities?", ["Velocity", "Speed", "Displacement", "Time"],
         [0, 2], "Velocity and displacement have direction; speed and time do not.", 1, None),
        (1, "numeric", "A cyclist speeds up from 2 m/s to 10 m/s in 4 s. What is the acceleration in m/s²?",
         None, (2.0, 0.01), "a = (10 - 2) / 4 = 2 m/s².", 2, "University exam, Dec 2025"),
        (1, "true_false", "An object can have zero velocity and non-zero acceleration at the same instant.",
         None, [0], "True: at the top of a vertical throw, velocity is zero but gravity still accelerates it.", 2,
         None),
        (2, "single", "On level ground, which launch angle gives the longest range (no air resistance)?",
         ["30°", "45°", "60°", "90°"], [1], "Range is proportional to sin 2θ, which peaks at θ = 45°.", 1,
         "University exam, May 2025"),
        (2, "numeric", "A ball is thrown at 20 m/s at 45°. Taking g = 9.8 m/s², what is its range in metres?",
         None, (40.8, 0.2), "R = v² sin 2θ / g = 400 × 1 / 9.8 ≈ 40.8 m.", 2, None),
        (2, "true_false", "At the top of its path, a projectile's speed is zero.", None, [1],
         "False: the horizontal velocity is unchanged, so the speed at the top equals v cos θ.", 2, None),
        (3, "single", "A 2 kg mass accelerates at 3 m/s². The net force on it is", ["1.5 N", "5 N", "6 N", "9 N"],
         [2], "F = ma = 2 × 3 = 6 N.", 1, "University exam, Dec 2025"),
        (3, "multiple", "Which statements about Newton's third law are true?",
         ["Action and reaction act on different bodies", "They cancel each other out",
          "They are equal in size", "They act in the same direction"], [0, 2],
         "The pair acts on different bodies, so they never cancel; they are equal and opposite.", 2, None),
        (4, "numeric", "How much kinetic energy, in joules, does a 4 kg trolley moving at 3 m/s have?", None,
         (18.0, 0.01), "KE = ½mv² = ½ × 4 × 9 = 18 J.", 1, "University exam, May 2025"),
        (4, "single", "A ball is dropped from 5 m. Ignoring air resistance, its speed just before landing is about",
         ["5 m/s", "7 m/s", "10 m/s", "25 m/s"], [2], "mgh = ½mv² gives v = √(2gh) = √98 ≈ 9.9 m/s.", 2, None),
    ],
    "MTH201": [
        (1, "single", "The derivative of x³ is", ["x²", "3x²", "3x³", "x⁴/4"], [1], "Power rule: n xⁿ⁻¹.", 1,
         None),
        (1, "numeric", "If f(x) = 5x² − 3x, what is f′(2)?", None, (17.0, 0.01), "f′(x) = 10x − 3, so f′(2) = 17.",
         1, "University exam, Dec 2025"),
        (1, "true_false", "The derivative of sin x is cos x.", None, [0], "True: d/dx sin x = cos x.", 1, None),
        (1, "single", "Using the chain rule, d/dx (3x + 1)⁴ is",
         ["4(3x + 1)³", "12(3x + 1)³", "(3x + 1)³", "12x³"], [1], "4(3x + 1)³ × 3 = 12(3x + 1)³.", 2, None),
        (2, "numeric", "Evaluate ∫₀² 3x² dx.", None, (8.0, 0.01), "The antiderivative is x³; 2³ − 0 = 8.", 1,
         "University exam, May 2025"),
        (2, "single", "For ∫ x eˣ dx by parts, the better choice of u is", ["eˣ", "x", "x eˣ", "1"], [1],
         "Choose u = x so du = dx is simpler; dv = eˣ dx integrates easily.", 2, None),
        (2, "true_false", "∫ 1/x dx = ln|x| + C.", None, [0], "True, for x ≠ 0.", 1, None),
        (3, "single", "The series 1 + 1/2 + 1/4 + 1/8 + … converges to", ["1", "1.5", "2", "It diverges"], [2],
         "Geometric series with r = 1/2: a / (1 − r) = 1 / 0.5 = 2.", 1, "University exam, Dec 2025"),
        (3, "multiple", "Which series converge?", ["Σ 1/n", "Σ 1/n²", "Σ (1/3)ⁿ", "Σ n"], [1, 2],
         "p-series with p = 2 and a geometric series with r = 1/3 converge; Σ 1/n and Σ n diverge.", 2, None),
        (3, "numeric", "The Taylor polynomial of eˣ at 0 up to x² gives what value at x = 1? (two decimals)", None,
         (2.5, 0.01), "1 + 1 + 1/2 = 2.5.", 2, None),
    ],
    "CS110": [
        (1, "single", "What does print(7 // 2) show?", ["3.5", "3", "4", "1"], [1],
         "// is floor division, so 7 // 2 is 3.", 1, None),
        (1, "true_false", "In Python, `=` compares two values.", None, [1],
         "False: `=` assigns; `==` compares.", 1, "University exam, Dec 2025"),
        (1, "single", "What is the type of the value 3.0?", ["int", "float", "str", "bool"], [1],
         "A number with a decimal point is a float.", 1, None),
        (2, "numeric", "How many times does `for i in range(2, 10, 3):` run its body?", None, (3.0, 0.0),
         "i takes 2, 5 and 8, so three times.", 2, "University exam, May 2025"),
        (2, "single", "Which loop runs forever?", ["while x < 5: x = x + 1", "while True: pass",
                                                   "for i in range(5): pass", "while False: pass"], [1],
         "while True never becomes false, and pass doesn't break out.", 1, None),
        (2, "multiple", "Which statements stop or skip parts of a loop?", ["break", "continue", "return", "print"],
         [0, 1, 2], "break exits, continue skips to the next round, return leaves the function and the loop.", 2,
         None),
        (3, "single", "What does len([1, [2, 3], 4]) return?", ["3", "4", "2", "5"], [0],
         "The inner list counts as one element.", 2, "University exam, Dec 2025"),
        (3, "true_false", "A function without a return statement returns None.", None, [0],
         "True: Python returns None by default.", 1, None),
        (3, "numeric", "After nums = [4, 1, 3]; nums.append(2); what is sum(nums)?", None, (10.0, 0.0),
         "4 + 1 + 3 + 2 = 10.", 1, None),
        (3, "single", "What is [x * 2 for x in range(3)]?", ["[0, 2, 4]", "[2, 4, 6]", "[0, 1, 2]", "[1, 2, 3]"],
         [0], "range(3) is 0, 1, 2, each doubled.", 2, None),
    ],
}

# Flashcards per topic position: (front, back).
FLASHCARDS = {
    "PHY101": {
        1: [("Displacement", "Change in position, with direction."),
            ("Average velocity", "Displacement divided by time taken."),
            ("Acceleration", "Rate of change of velocity: Δv / Δt.")],
        2: [("Range on level ground", "R = v² sin 2θ / g."), ("Best angle for range", "45°, with no air resistance."),
            ("Horizontal velocity in flight", "Constant: v cos θ.")],
        3: [("Newton's second law", "F = ma."), ("Newton's third law", "Equal and opposite forces on different bodies."),
            ("Free-body diagram", "A sketch of every force acting on one object.")],
        4: [("Kinetic energy", "½mv²."), ("Work", "Force × displacement in the force's direction."),
            ("Conservation of energy", "Total energy stays constant in a closed system.")],
    },
    "MTH201": {
        1: [("Power rule", "d/dx xⁿ = n xⁿ⁻¹."), ("Chain rule", "d/dx f(g(x)) = f′(g(x)) g′(x)."),
            ("Derivative of eˣ", "eˣ.")],
        2: [("Fundamental theorem", "∫ₐᵇ f(x) dx = F(b) − F(a)."), ("Integration by parts", "∫ u dv = uv − ∫ v du."),
            ("∫ 1/x dx", "ln|x| + C.")],
        3: [("Geometric series sum", "a / (1 − r) when |r| < 1."), ("p-series", "Σ 1/nᵖ converges when p > 1."),
            ("Taylor series of eˣ", "1 + x + x²/2! + x³/3! + …")],
    },
    "CS110": {
        1: [("= vs ==", "= assigns a value; == compares two values."), ("Floor division", "// rounds down: 7 // 2 is 3."),
            ("Boolean values", "True and False.")],
        2: [("range(a, b, s)", "From a up to but not including b, in steps of s."),
            ("break", "Leaves the loop immediately."), ("continue", "Skips to the next round of the loop.")],
        3: [("def", "Defines a function."), ("Default return", "A function without return gives None."),
            ("len(list)", "Number of top-level elements.")],
    },
}

COURSE_SECTIONS = {"PHY101": "PHY101-A", "MTH201": "MTH201-B", "CS110": "CS110-A"}
LETTERS = "abcdef"
MOCK_CLASSMATES = 6
MOCK_DURATION_MINUTES = 30
QUIZ_TOPICS = (1, 2)
RIGHT, WRONG, SKIP, SLOW_RIGHT = range(4)
OUTCOMES = (RIGHT, WRONG, SKIP, SLOW_RIGHT)
BASE_SECONDS = 40
SLOW_EXTRA_SECONDS = 60


def _options(kind: str, texts: list[str] | None) -> list[dict]:
    if kind == "true_false":
        return [{"id": "true", "text": "True"}, {"id": "false", "text": "False"}]
    if kind == "numeric":
        return []
    return [{"id": LETTERS[i], "text": text} for i, text in enumerate(texts)]


def _answer(kind: str, raw, options: list[dict]) -> dict:
    if kind == "numeric":
        value, tolerance = raw
        return {"value": value, "tolerance": tolerance}
    return {"options": [options[i]["id"] for i in raw]}


def _wrong_response(question) -> dict:
    if question.kind == "numeric":
        return {"value": question.answer["value"] + 10}
    right = set(question.answer["options"])
    return {"options": [next(o["id"] for o in question.options if o["id"] not in right)]}


def _right_response(question) -> dict:
    if question.kind == "numeric":
        return {"value": question.answer["value"]}
    return {"options": list(question.answer["options"])}


def _section_students(by_email: dict[str, dict], section_code: str) -> list[str]:
    """The students scripts/seed.py placed in a section, recomputed with the same deterministic rule."""
    from scripts.seed import CLASS_SECTIONS

    pool = sorted(e for e, p in by_email.items() if p["inst_code"] == "ASHF" and p["type"] == "student")
    offset = 0
    for code, _, _, demo_students, extra in CLASS_SECTIONS:
        extras = [e for e in pool[offset:offset + extra + len(demo_students)] if e not in demo_students][:extra]
        offset += extra
        if code == section_code:
            return demo_students + extras
    return []


async def seed(session, by_email: dict[str, dict], ashford) -> None:  # noqa: ANN001
    from scripts.seed import ANCHOR, uid

    bank: dict[str, list] = {}
    for code, rows in QUESTIONS.items():
        course_id = uid(f"course:{code}")
        bank[code] = []
        for n, (topic_pos, kind, stem, texts, raw, explanation, difficulty, pyq) in enumerate(rows, start=1):
            options = _options(kind, texts)
            question = Question(
                id=uid(f"question:{code}:{n}"), institution_id=ashford, course_id=course_id,
                topic_id=uid(f"topic:{code}:{topic_pos}"), kind=kind, stem=stem, options=options,
                answer=_answer(kind, raw, options), explanation=explanation, difficulty=difficulty,
                source="pyq" if pyq else "teacher", source_label=pyq, created_at=ANCHOR - timedelta(days=30),
            )
            session.add(question)
            bank[code].append((topic_pos, question))
        for topic_pos, cards in FLASHCARDS[code].items():
            for n, (front, back) in enumerate(cards, start=1):
                session.add(Flashcard(id=uid(f"card:{code}:{topic_pos}:{n}"), institution_id=ashford,
                                      course_id=course_id, topic_id=uid(f"topic:{code}:{topic_pos}"),
                                      front=front, back=back))
    await session.flush()

    def add_assessment(key: str, code: str, items: list[tuple[str, object]], **fields) -> Assessment:  # noqa: ANN003
        assessment = Assessment(id=uid(f"assessment:{key}"), institution_id=ashford, course_id=uid(f"course:{code}"),
                                created_at=ANCHOR - timedelta(days=14), **fields)
        session.add(assessment)
        for pos, (section, question) in enumerate(items, start=1):
            session.add(AssessmentItem(id=uid(f"item:{key}:{pos}"), assessment_id=assessment.id,
                                       question_id=question.id, section=section, position=pos))
        return assessment

    assessments: dict[str, Assessment] = {}
    for code, entries in bank.items():
        questions = [q for _, q in entries]
        assessments[f"{code}:quiz"] = add_assessment(
            f"{code}:quiz", code, [("", q) for pos, q in entries if pos in QUIZ_TOPICS],
            title=f"{code} Quiz 1", kind="quiz", counts_toward_grade=True, grade_category="Quizzes", max_attempts=2,
            instructions="Covers the first two topics. Two attempts; your best score counts.")
        add_assessment(f"{code}:past", code, [("", q) for q in questions if q.source == "pyq"],
                       title=f"{code} past papers", kind="past_paper",
                       instructions="Questions from earlier university exams. Untimed; take it as often as you like.")
        add_assessment(f"{code}:check", code, [("", q) for q in questions[::3]], title=f"{code} unassisted check",
                       kind="exam_check", tutor_allowed=False,
                       instructions="No EduBot help while you take this. It shows what you can do on your own.")
    topic_titles = {1: "Kinematics", 2: "Projectile motion", 3: "Newton's laws", 4: "Work and energy"}
    assessments["mock"] = add_assessment(
        "PHY101:mock", "PHY101", [(topic_titles[pos], q) for pos, q in bank["PHY101"]],
        title="PHY101 Mock test 1", kind="mock", duration_minutes=MOCK_DURATION_MINUTES, marks_correct=4,
        marks_wrong=-1, tutor_allowed=False, opens_at=ANCHOR - timedelta(days=1), closes_at=ANCHOR + timedelta(days=6),
        instructions="30 minutes. +4 for a right answer, −1 for a wrong one, 0 if you skip. EduBot is paused.")
    await session.flush()

    await _seed_attempts(session, by_email, ashford, bank, assessments, AttemptSeeder(session, ashford, uid, ANCHOR))

    ingrid = by_email["ingrid.abiodun@ashf.example.edu"]["id"]
    for n, (topic_pos, card_n, days) in enumerate([(1, 1, -1), (1, 2, 0), (2, 1, 0), (3, 1, 3), (1, 3, 5)], start=1):
        session.add(CardReview(id=uid(f"review:ingrid:{n}"), institution_id=ashford, person_id=ingrid,
                               card_id=uid(f"card:PHY101:{topic_pos}:{card_n}"), due_at=ANCHOR + timedelta(days=days),
                               interval_days=max(1.0, float(days)), ease=2.5, reps=2, lapses=0,
                               last_reviewed_at=ANCHOR - timedelta(days=2)))


@dataclass(frozen=True)
class AttemptSeeder:
    """What every seeded attempt shares: the session, the institution, id derivation and the time anchor."""

    session: object
    ashford: object
    uid: Callable[[str], object]
    anchor: datetime

    async def sit(self, key: str, assessment: Assessment, questions: list[Question], person_id,  # noqa: ANN001
                  pattern: list[int]) -> None:
        """pattern[i]: RIGHT, WRONG, SKIP, or SLOW_RIGHT (right, but taking longer)."""
        attempt = Attempt(id=self.uid(f"attempt:{key}"), institution_id=self.ashford, assessment_id=assessment.id,
                          person_id=person_id, number=1, status="submitted",
                          started_at=self.anchor - timedelta(hours=20),
                          submitted_at=self.anchor - timedelta(hours=19, minutes=35))
        self.session.add(attempt)
        await self.session.flush()
        answers = [self._answer(key, i, attempt, assessment, question, outcome)
                   for i, (question, outcome) in enumerate(zip(questions, pattern, strict=True))]
        self.session.add_all(answers)
        attempt.score = sum(a.marks for a in answers)
        attempt.max_score = len(questions) * assessment.marks_correct
        attempt.correct = sum(a.is_correct is True for a in answers)
        attempt.wrong = sum(a.is_correct is False for a in answers)
        attempt.skipped = sum(a.is_correct is None for a in answers)

    def _answer(self, key: str, i: int, attempt: Attempt, assessment: Assessment, question: Question,
                outcome: int) -> AttemptAnswer:
        response = None if outcome == SKIP else (_wrong_response(question) if outcome == WRONG
                                                 else _right_response(question))
        right = is_correct(question, response)
        marks = 0.0 if right is None else (assessment.marks_correct if right else assessment.marks_wrong)
        return AttemptAnswer(id=self.uid(f"answer:{key}:{i}"), attempt_id=attempt.id, question_id=question.id,
                             response=response, is_correct=right, marks=marks,
                             time_seconds=BASE_SECONDS + (i * 17) % 90 + (SLOW_EXTRA_SECONDS if outcome == SLOW_RIGHT
                                                                           else 0),
                             changes=1 if i % 5 == 0 else 0, marked_for_review=outcome == SKIP)


async def _seed_attempts(session, by_email: dict[str, dict], ashford, bank: dict, assessments: dict,  # noqa: ANN001
                         seeder: AttemptSeeder) -> None:
    """Classmates sit the PHY101 mock (so rank means something), and Ingrid has a quiz attempt too."""
    mock_questions = [q for _, q in bank["PHY101"]]
    for offset, email in enumerate(_section_students(by_email, "PHY101-A")[:MOCK_CLASSMATES]):
        # Each classmate gets a different, deterministic mix of right, wrong, skipped and slow answers.
        pattern = [(offset + i) % len(OUTCOMES) for i in range(len(mock_questions))]
        await seeder.sit(f"mock:{email}", assessments["mock"], mock_questions, by_email[email]["id"], pattern)
    quiz_questions = [q for pos, q in bank["PHY101"] if pos in QUIZ_TOPICS]
    await seeder.sit("quiz:ingrid", assessments["PHY101:quiz"], quiz_questions,
                     by_email["ingrid.abiodun@ashf.example.edu"]["id"],
                     [RIGHT, RIGHT, WRONG, RIGHT, SKIP, RIGHT, WRONG][:len(quiz_questions)])
