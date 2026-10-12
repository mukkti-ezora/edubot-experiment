"""Demo data for the progress area (Ashford). Called from scripts/seed.py inside the learning seed.

Two earlier terms on the record, a NEP four-year programme with exit points, an approved SWAYAM/NPTEL
catalogue, and one pending credit-transfer request.
"""

from __future__ import annotations

from datetime import timedelta

COURSE_CREDITS = {"PHY101": (4, "Core"), "MTH201": (4, "Core"), "CS110": (3, "Skill")}

PROGRAMME = {
    "name": "B.Sc. (Hons) Physical Sciences",
    "total_credits": 160,
    "requirements": [{"category": "Core", "credits": 96}, {"category": "Skill", "credits": 24},
                     {"category": "Elective", "credits": 28}, {"category": "Value-added", "credits": 12}],
    "exit_points": [{"credits": 40, "award": "UG Certificate"}, {"credits": 80, "award": "UG Diploma"},
                    {"credits": 120, "award": "Bachelor's degree"},
                    {"credits": 160, "award": "Bachelor's degree with Honours"}],
}

# (term, code, title, credits, category, grade, grade point)
INGRID_RECORD = [
    ("2025 Autumn", "PHY100", "Mechanics Foundations", 4, "Core", "A+", 9),
    ("2025 Autumn", "MTH101", "Calculus I", 4, "Core", "A", 8),
    ("2025 Autumn", "CHM101", "General Chemistry", 4, "Core", "B+", 7),
    ("2025 Autumn", "CS100", "Digital Literacy", 3, "Skill", "A+", 9),
    ("2025 Autumn", "ENG101", "Communication Skills", 2, "Value-added", "O", 10),
    ("2025 Autumn", "EVS101", "Environmental Studies", 2, "Value-added", "A", 8),
    ("2026 Spring", "PHY102", "Waves and Oscillations", 4, "Core", "A", 8),
    ("2026 Spring", "PHY103", "Physics Lab I", 2, "Core", "O", 10),
    ("2026 Spring", "PHY104", "Physics Lab II", 2, "Core", "A+", 9),
    ("2026 Spring", "MTH102", "Linear Algebra", 4, "Core", "B+", 7),
    ("2026 Spring", "MTH103", "Statistics", 4, "Core", "B", 6),
    ("2026 Spring", "CS105", "Python for Scientists", 3, "Skill", "A", 8),
    ("2026 Spring", "AST101", "Astronomy Basics", 4, "Elective", "A+", 9),
    ("2026 Spring", "IKS101", "Indian Knowledge Systems", 2, "Value-added", "A", 8),
]
KWAME_RECORD = [
    ("2025 Autumn", "MTH101", "Calculus I", 4, "Core", "O", 10),
    ("2025 Autumn", "PHY100", "Mechanics Foundations", 4, "Core", "B", 6),
    ("2025 Autumn", "CHM101", "General Chemistry", 4, "Core", "F", 0),
    ("2025 Autumn", "CS100", "Digital Literacy", 3, "Skill", "A", 8),
    ("2025 Autumn", "ENG101", "Communication Skills", 2, "Value-added", "B+", 7),
    ("2026 Spring", "MTH102", "Linear Algebra", 4, "Core", "A+", 9),
    ("2026 Spring", "MTH103", "Statistics", 4, "Core", "A", 8),
    ("2026 Spring", "CHM101", "General Chemistry (repeat)", 4, "Core", "C", 5),
    ("2026 Spring", "CS105", "Python for Scientists", 3, "Skill", "A+", 9),
    ("2026 Spring", "IKS101", "Indian Knowledge Systems", 2, "Value-added", "A", 8),
]

# Approved SWAYAM/NPTEL courses: (title, weeks, credits, category).
MOOCS = [
    ("Introduction to Machine Learning", 12, 3, "Elective"),
    ("Programming, Data Structures and Algorithms using Python", 8, 2, "Skill"),
    ("Data Analytics with Python", 12, 3, "Skill"),
    ("Classical Mechanics: From Newtonian to Lagrangian Formulation", 12, 3, "Elective"),
    ("Introduction to Astrophysics", 8, 2, "Elective"),
    ("Ethics in Engineering Practice", 8, 2, "Value-added"),
]
NPTEL_URL = "https://onlinecourses.nptel.ac.in/"
NEXT_RUN = "Jan to Apr 2027"
ADVISOR = "leila.abiodun@ashf.example.edu"
INGRID, KWAME = "ingrid.abiodun@ashf.example.edu", "kwame.abiodun@ashf.example.edu"


async def seed(session, by_email: dict[str, dict], ashford) -> None:  # noqa: ANN001
    from scripts.seed import ANCHOR, uid
    from services.learning.models import (
        Course,
        CourseResult,
        CreditTransferRequest,
        MoocCourse,
        Programme,
        StudentProgramme,
    )

    for code, (credits, category) in COURSE_CREDITS.items():
        course = await session.get(Course, uid(f"course:{code}"))
        course.credits, course.category = credits, category

    programme_id = uid("programme:bsc-physical-sciences")
    session.add(Programme(id=programme_id, institution_id=ashford, **PROGRAMME))
    await session.flush()
    advisor = by_email[ADVISOR]["id"]
    session.add_all([
        StudentProgramme(person_id=by_email[INGRID]["id"], institution_id=ashford, programme_id=programme_id,
                         admitted_year=2025, advisor_id=advisor),
        StudentProgramme(person_id=by_email[KWAME]["id"], institution_id=ashford, programme_id=programme_id,
                         admitted_year=2025, advisor_id=advisor, apaar_id="482109375512", abc_status="linked",
                         abc_synced_at=ANCHOR - timedelta(days=20)),
    ])
    for email, record in ((INGRID, INGRID_RECORD), (KWAME, KWAME_RECORD)):
        for term, code, title, credits, category, grade, point in record:
            session.add(CourseResult(id=uid(f"result:{email}:{term}:{code}"), institution_id=ashford,
                                     person_id=by_email[email]["id"], term=term, code=code, title=title,
                                     credits=credits, category=category, grade=grade, grade_point=point))

    mooc_ids = []
    for position, (title, weeks, credits, category) in enumerate(MOOCS, start=1):
        mooc_id = uid(f"mooc:{position}")
        mooc_ids.append(mooc_id)
        session.add(MoocCourse(id=mooc_id, institution_id=ashford, provider="NPTEL", title=title, weeks=weeks,
                               credits=credits, category=category, url=NPTEL_URL, next_run=NEXT_RUN))
    await session.flush()
    session.add(CreditTransferRequest(id=uid("transfer:ingrid:pdsa"), institution_id=ashford,
                                      person_id=by_email[INGRID]["id"], mooc_course_id=mooc_ids[1],
                                      score_percent=76, created_at=ANCHOR - timedelta(days=3)))
