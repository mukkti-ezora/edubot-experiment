"""Deterministic synthetic dataset (ADR-0009).

Writes through each service's own models — the same code paths the APIs use —
so data ownership is respected even at seed time. Re-run any time: it resets
each service database and regenerates the identical dataset.

    make seed
    .venv/bin/python -m scripts.seed --keep   # skip wiping (append-safe)

Identity note: all people/institutions are fictional; emails live on reserved
.example.edu domains; no real personal data exists in this dataset.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import uuid
from datetime import UTC, datetime, timedelta

SEED = "edubot-mvp-v1"
rng = random.Random(SEED)

ANCHOR = datetime.now(UTC).replace(microsecond=0)


def days_ago(n: float) -> datetime:
    return ANCHOR - timedelta(days=n)


def uid(key: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"{SEED}:{key}")


# ---------------------------------------------------------------- institutions

INSTITUTIONS = [
    # code, name, type, status, city, region, created_days_ago
    ("ASHF", "Ashford Institute of Technology", "Institute of Technology", "active", "Portland", "OR", 1080),
    ("CLWT", "Clearwater College", "College", "active", "Duluth", "MN", 730),
    ("HILV", "Hillview Community College", "Community College", "active", "Fresno", "CA", 520),
    ("MRDN", "Meredian University", "University", "pending", "Burlington", "VT", 19),
    ("SORM", "Southshore Regional Academy", "Academy", "suspended", "Mobile", "AL", 420),
    ("KRPT", "Kestrel Ridge Polytechnic", "Institute of Technology", "active", "Boise", "ID", 890),
    ("PANU", "Port Anselm University", "University", "active", "Tacoma", "WA", 1300),
    ("NGCA", "Northgate College of Arts", "College", "active", "Providence", "RI", 640),
    ("BHIN", "Beacon Hill Institute", "Academy", "active", "Boston", "MA", 300),
    ("CVSC", "Carver State College", "College", "active", "Carson City", "NV", 990),
    ("ESTC", "Estuary Technical College", "Community College", "active", "Corpus Christi", "TX", 210),
    ("VXHU", "Vauxhall University", "University", "active", "Cincinnati", "OH", 1150),
    ("LNDC", "Lindell College", "College", "active", "St. Louis", "MO", 75),
    ("QBIT", "Quarry Bank Institute of Technology", "Institute of Technology", "pending", "Pittsburgh", "PA", 9),
    ("HLWC", "Halloway Community College", "Community College", "active", "Tucson", "AZ", 610),
    ("THSU", "Thessaly University", "University", "suspended", "Albany", "NY", 800),
    ("MRGC", "Marrowgate College", "College", "active", "Richmond", "VA", 460),
    ("CLWI", "Calloway Institute", "Academy", "active", "Boise", "ID", 41),
]

FIRST_NAMES = [
    "Priya", "Micah", "Ananya", "Diego", "Ingrid", "Kofi", "Mei", "Tomás", "Ren", "Farah",
    "Owen", "Leila", "Nadia", "Theo", "Haruto", "Amara", "Jonas", "Selin", "Owen", "Yuki",
    "Marcus", "Elena", "Noor", "Callum", "Zola", "Henrik", "Imani", "Petra", "Ravi", "Sofia",
    "Deandre", "Marguerite", "Anton", "Keiko", "Lucia", "Bashir", "Esther", "Niall", "Wren",
    "Tomasz", "Uma", "Vera", "Adaeze", "Soren", "Mabel", "Dmitri", "Chloe", "Arjun", "Tessa",
    "Ibrahim", "Maren", "Joaquin", "Celeste", "Bolanle", "Stellan", "Odette", "Rosa", "Emeka",
    "Solveig", "Mateo", "Astrid", "Kwame",
]

LAST_NAMES = [
    "Nair", "Okonkwo", "Lindqvist", "Cabrera", "Okafor", "Haugen", "Tanaka", "Silva", "Moreau",
    "Petrov", "Adeyemi", "Nguyen", "Kowalski", "Ferreira", "Osei", "Bergstrom", "Castillo",
    "Raghavan", "Novak", "Whitfield", "Amato", "Diallo", "Larsen", "Mbeki", "O'Connell",
    "Sorensen", "Vasquez", "Yamamoto", "Abiodun", "Greer", "Haldane", "Ibarra", "Jovanovic",
    "Keating", "Lindholm", "Marchetti", "Nakamura", "Oduya", "Padevit", "Quarshie", "Rothwell",
    "Salcedo", "Thibodeaux", "Urbaniak", "Voss", "Wanjiru", "Xiong", "Yamane", "Zbigniew",
]

ADMIN_ROLE = {
    "sysadmin@edubot.example.edu": "Platform Owner",
    "d.kowalczyk@edubot.example.edu": "Operations Admin",
    "f.adeyemi@edubot.example.edu": "Operations Admin",
    "t.lindqvist@edubot.example.edu": "Support Admin",
    "r.ishikawa@edubot.example.edu": "Support Admin",
    "o.fontaine@edubot.example.edu": "Read-only Auditor",
    "c.meyer@edubot.example.edu": "Read-only Auditor",
}

PLATFORM_ADMINS = [
    ("Marisol", "Vance", "sysadmin@edubot.example.edu", "active"),
    ("Demetri", "Kowalczyk", "d.kowalczyk@edubot.example.edu", "active"),
    ("Farah", "Adeyemi", "f.adeyemi@edubot.example.edu", "active"),
    ("Tomas", "Lindqvist", "t.lindqvist@edubot.example.edu", "active"),
    ("Ren", "Ishikawa", "r.ishikawa@edubot.example.edu", "active"),
    ("Odile", "Fontaine", "o.fontaine@edubot.example.edu", "active"),
    ("Cassian", "Meyer", "c.meyer@edubot.example.edu", "deactivated"),
]

# Per-institution volume plan (students, teachers, parents, institution admins)
VOLUME: dict[str, tuple[int, int, int, int]] = {
    "ASHF": (620, 38, 310, 4),
    "CLWT": (410, 24, 205, 3),
    "HILV": (290, 17, 130, 2),
    "MRDN": (45, 6, 22, 1),
    "SORM": (160, 11, 84, 2),
    "KRPT": (96, 7, 40, 1),
    "PANU": (88, 6, 36, 1),
    "NGCA": (52, 4, 21, 0),
    "BHIN": (40, 3, 16, 0),
    "CVSC": (71, 5, 29, 1),
    "ESTC": (33, 2, 14, 0),
    "VXHU": (58, 4, 24, 0),
    "LNDC": (22, 2, 9, 0),
    "QBIT": (12, 1, 5, 0),
    "HLWC": (49, 4, 20, 1),
    "THSU": (36, 3, 15, 0),
    "MRGC": (41, 3, 17, 0),
    "CLWI": (14, 1, 6, 0),
}

ACTIONS_SUCCESS = [
    ("institution.create", "institution"),
    ("institution.update", "institution"),
    ("user.update", "user"),
    ("user.deactivate", "user"),
    ("user.activate", "user"),
    ("role.assign", "role"),
    ("admin.create", "user"),
]


async def seed_tenancy(session, institutions: dict[str, dict]) -> None:
    from services.tenancy.models import Institution

    for code, name, type_, status, city, region, created_days in INSTITUTIONS:
        row = Institution(
            id=institutions[code]["id"],
            code=code,
            name=name,
            type=type_,
            status=status,
            city=city,
            region=region,
            country="United States",
            contact_name=f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}",
            contact_email=f"registrar@{code.lower()}.example.edu",
            created_at=days_ago(created_days),
            updated_at=days_ago(rng.uniform(0, created_days)),
            suspended_at=days_ago(14) if status == "suspended" else None,
            status_note="Accreditation review in progress." if status == "suspended" else None,
        )
        session.add(row)
    settings = institutions.get("__settings__")
    if settings:
        session.add(settings["row"])
    await session.commit()


async def seed_users(session, institutions: dict[str, dict], people: list[dict]) -> None:
    for person in people:
        session.add(person["row"])
    await session.commit()


async def seed_rbac(session) -> dict[str, uuid.UUID]:
    from services.rbac.models import Permission, Role, RoleAssignment, RolePermission
    from services.rbac.seed_data import PERMISSIONS, ROLE_DESCRIPTIONS, SYSTEM_ROLES

    perms: dict[str, Permission] = {}
    for key, domain, description in PERMISSIONS:
        row = Permission(id=uid(f"perm:{key}"), key=key, domain=domain, description=description)
        session.add(row)
        perms[key] = row
    await session.flush()

    role_ids: dict[str, uuid.UUID] = {}
    for role_name, keys in SYSTEM_ROLES.items():
        role = Role(
            id=uid(f"role:{role_name}"), name=role_name, scope="platform",
            description=ROLE_DESCRIPTIONS[role_name], is_system=True,
            created_at=days_ago(320),
        )
        session.add(role)
        await session.flush()
        role_ids[role_name] = role.id
        for key in keys:
            session.add(
                RolePermission(role_id=role.id, permission_id=perms[key].id)
            )
    await session.flush()

    for _first, _last, email, _status in PLATFORM_ADMINS:
        person_id = uid(f"person:{email}")
        role_name = ADMIN_ROLE[email]
        session.add(
            RoleAssignment(
                id=uid(f"assign:{email}"),
                actor_id=person_id,
                role_id=role_ids[role_name],
                scope="platform",
                created_at=days_ago(300),
            )
        )
    await session.commit()
    return role_ids


ROLE_DEMO_ACCOUNTS = [
    # (email, type) of people produced by build_people; checked by check_role_demo_accounts
    ("ingrid.abiodun@ashf.example.edu", "student"),
    ("kwame.abiodun@ashf.example.edu", "student"),
    ("leila.abiodun@ashf.example.edu", "teacher"),
    ("mei.amato@ashf.example.edu", "teacher"),
    ("adaeze.abiodun@ashf.example.edu", "parent"),
    ("farah.abiodun@ashf.example.edu", "parent"),
]


def check_role_demo_accounts(people: list[dict]) -> None:
    """Fail the seed if a demo account would point at a missing or mistyped person."""
    type_by_email = {p["email"]: p["type"] for p in people}
    for email, user_type in ROLE_DEMO_ACCOUNTS:
        if type_by_email.get(email) != user_type:
            raise SystemExit(f"Demo account {email} needs a seeded {user_type}; got {type_by_email.get(email)}.")


async def seed_identity(session) -> None:
    from services.identity.models import AuthAccount
    from services.identity.security import hash_password

    default_password = os.environ.get("EDUBOT_SEED_ADMIN_PASSWORD", "ChangeMe-admin-234!")
    for _first, _last, email, status in PLATFORM_ADMINS:
        person_id = uid(f"person:{email}")
        password = default_password if email.startswith("sysadmin@") else f"Dev-only-{email.split('@')[0]}-2026!"
        account = AuthAccount(
            id=uid(f"account:{email}"),
            email=email,
            password_hash=hash_password(password),
            person_id=person_id,
            scope="platform",
            status="active" if status == "active" else "disabled",
            last_login_at=days_ago(rng.uniform(0.05, 20)) if status == "active" else None,
            created_at=days_ago(300),
        )
        session.add(account)

    # Role demo accounts (students, teachers, parents)
    role_password = os.environ.get("EDUBOT_SEED_ROLE_PASSWORD", "EduBot-demo-2026!")
    for email, user_type in ROLE_DEMO_ACCOUNTS:
        person_id = uid(f"person:{email}")
        account = AuthAccount(
            id=uid(f"account:{email}"),
            email=email,
            password_hash=hash_password(role_password),
            person_id=person_id,
            scope=user_type,
            status="active",
            last_login_at=None,
            created_at=days_ago(200),
        )
        session.add(account)

    await session.commit()


def build_people(institutions: dict[str, dict]):
    people: list[dict] = []
    seen_emails: set[str] = set()

    def add_person(inst_code: str | None, type_: str, first: str, last: str, *, days: float, status: str):
        local = f"{first}.{last}".lower().replace("'", "").replace(" ", ".")
        domain = f"{inst_code.lower()}.example.edu" if inst_code else "edubot.example.edu"
        email = f"{local}@{domain}"
        n = 2
        while email in seen_emails:
            email = f"{local}{n}@{domain}"
            n += 1
        seen_emails.add(email)
        people.append(
            {
                "id": uid(f"person:{email}"),
                "email": email,
                "first": first,
                "last": last,
                "type": type_,
                "status": status,
                "inst_code": inst_code,
                "created_days": days,
            }
        )

    for first, last, email, status in PLATFORM_ADMINS:
        seen_emails.add(email)
        people.append(
            {
                "id": uid(f"person:{email}"),
                "email": email,
                "first": first,
                "last": last,
                "type": "administrator",
                "status": status,
                "inst_code": None,
                "created_days": 300,
            }
        )

    for code, _name, _t, _status, *_rest2 in INSTITUTIONS:
        students, teachers, parents, admins = VOLUME[code]
        inst_created_days = next(d for c, *_rest, d in [(i[0], i[1], i[2], i[3], i[4], i[5], i[6]) for i in INSTITUTIONS] if c == code)
        for _ in range(students):
            status_pick = "suspended" if rng.random() < 0.02 else ("deactivated" if rng.random() < 0.01 else "active")
            add_person(
                code, "student",
                FIRST_NAMES[rng.randrange(len(FIRST_NAMES))], LAST_NAMES[rng.randrange(len(LAST_NAMES))],
                days=rng.uniform(1, inst_created_days - 1), status=status_pick,
            )
        for _ in range(teachers):
            add_person(
                code, "teacher",
                FIRST_NAMES[rng.randrange(len(FIRST_NAMES))], LAST_NAMES[rng.randrange(len(LAST_NAMES))],
                days=rng.uniform(1, inst_created_days - 1), status="active",
            )
        for _ in range(parents):
            add_person(
                code, "parent",
                FIRST_NAMES[rng.randrange(len(FIRST_NAMES))], LAST_NAMES[rng.randrange(len(LAST_NAMES))],
                days=rng.uniform(1, inst_created_days - 1), status="active",
            )
        for _ in range(admins):
            add_person(
                code, "administrator",
                FIRST_NAMES[rng.randrange(len(FIRST_NAMES))], LAST_NAMES[rng.randrange(len(LAST_NAMES))],
                days=rng.uniform(1, inst_created_days - 1), status="active",
            )

    # Isolation fixtures (see ADR-0009 / Phase-1 §17.3)
    add_person("ASHF", "student", "Priya", "Nair", days=200, status="active")
    add_person("HILV", "student", "Priya", "Nair", days=180, status="active")
    add_person("ASHF", "teacher", "Micah", "Okafor", days=210, status="active")
    seen_emails.discard("micah.okafor@clwt.example.edu")  # force local-part collision below
    add_person("CLWT", "teacher", "Marian", "Okafor", days=190, status="active")
    people[-1]["email"] = "m.okafor@clwt.example.edu"
    return people


def users_to_rows(people: list[dict], institutions: dict[str, dict]):
    from services.users.models import User

    rows = []
    for person in people:
        inst = institutions.get(person["inst_code"]) if person["inst_code"] else None
        created = days_ago(person["created_days"])
        rows.append(
            User(
                id=person["id"],
                institution_id=inst["id"] if inst else None,
                type=person["type"],
                first_name=person["first"],
                last_name=person["last"],
                email=person["email"],
                status=person["status"],
                created_at=created,
                updated_at=created,
            )
        )
    return rows


async def seed_users_db(session, people_rows) -> None:
    # Batched bulk insert for a few thousand rows.
    session.add_all(people_rows)
    await session.commit()


CLASS_SECTIONS = [
    # code, name, teacher email, demo students placed in it, extra seeded ASHF students
    ("PHY101-A", "Physics 101, Section A", "leila.abiodun@ashf.example.edu", ["ingrid.abiodun@ashf.example.edu"], 24),
    ("MTH201-B", "Calculus II, Section B", "leila.abiodun@ashf.example.edu", ["kwame.abiodun@ashf.example.edu"], 20),
    ("CS110-A", "Introduction to Programming, Section A", "mei.amato@ashf.example.edu",
     ["ingrid.abiodun@ashf.example.edu", "kwame.abiodun@ashf.example.edu"], 18),
]
CLASS_TERM = "2026 Autumn"


async def seed_classes(session, people: list[dict], institutions: dict[str, dict]) -> int:
    """Deterministic class roster at Ashford around the demo accounts."""
    from services.users.models import ClassMember, ClassSection

    ashford = institutions["ASHF"]["id"]
    by_email = {p["email"]: p for p in people}
    pool = sorted(p["email"] for p in people if p["inst_code"] == "ASHF" and p["type"] == "student")
    offset = 0
    for code, name, teacher, demo_students, extra in CLASS_SECTIONS:
        section_id = uid(f"class:{code}")
        session.add(ClassSection(id=section_id, institution_id=ashford, code=code, name=name, term=CLASS_TERM))
        await session.flush()
        extras = [e for e in pool[offset:offset + extra + len(demo_students)] if e not in demo_students][:extra]
        offset += extra
        members = [(teacher, "teacher")] + [(e, "student") for e in demo_students + extras]
        for email, role in members:
            session.add(ClassMember(
                id=uid(f"class-member:{code}:{email}"), section_id=section_id, institution_id=ashford,
                person_id=by_email[email]["id"], role=role,
            ))
    await session.commit()
    return len(CLASS_SECTIONS)


async def seed_learning(session, people: list[dict], institutions: dict[str, dict]) -> tuple[int, int]:
    """Starter library at Ashford: courses on the seeded class sections, lessons, assignments."""
    from scripts.learning_seed import ASSIGNMENTS, COURSES, TOPICS
    from services.learning.models import Assignment, Course, Lesson, Module, Submission, Topic

    ashford = institutions["ASHF"]["id"]
    by_email = {p["email"]: p for p in people}
    course_ids: dict[str, object] = {}
    lessons = 0
    for code, section_code, title, subject, summary, modules in COURSES:
        course_id = uid(f"course:{code}")
        course_ids[code] = course_id
        session.add(Course(id=course_id, institution_id=ashford, section_id=uid(f"class:{section_code}"),
                           code=code, title=title, subject=subject, summary=summary, term=CLASS_TERM))
        await session.flush()
        topic_of: dict[tuple[int, int], object] = {}
        for t_pos, (t_title, t_summary, t_lessons) in enumerate(TOPICS.get(code, []), start=1):
            topic_id = uid(f"topic:{code}:{t_pos}")
            session.add(Topic(id=topic_id, institution_id=ashford, course_id=course_id, position=t_pos,
                              title=t_title, summary=t_summary))
            topic_of.update({key: topic_id for key in t_lessons})
        await session.flush()
        for m_pos, (m_title, m_lessons) in enumerate(modules, start=1):
            module_id = uid(f"module:{code}:{m_pos}")
            session.add(Module(id=module_id, institution_id=ashford, course_id=course_id, position=m_pos,
                               title=m_title))
            await session.flush()
            for l_pos, (l_title, minutes, body, video, animation) in enumerate(m_lessons, start=1):
                session.add(Lesson(id=uid(f"lesson:{code}:{m_pos}:{l_pos}"), institution_id=ashford,
                                   course_id=course_id, module_id=module_id,
                                   topic_id=topic_of.get((m_pos, l_pos)), position=l_pos, title=l_title,
                                   minutes=minutes, body=body, video=video, animation=animation))
                lessons += 1
    await session.flush()
    for code, a_title, kind, days, points, submitted_by in ASSIGNMENTS:
        assignment_id = uid(f"assignment:{code}:{a_title}")
        session.add(Assignment(id=assignment_id, institution_id=ashford, course_id=course_ids[code],
                               title=a_title, kind=kind, due_at=ANCHOR + timedelta(days=days), points=points))
        await session.flush()
        for email in submitted_by:
            session.add(Submission(institution_id=ashford, assignment_id=assignment_id,
                                   person_id=by_email[email]["id"], status="submitted"))
    await seed_doubts(session, by_email, ashford)
    from scripts import seed_coursework, seed_practice, seed_progress, seed_schedule

    for area in (seed_coursework, seed_practice, seed_progress, seed_schedule):
        await area.seed(session, by_email, ashford)
    await session.commit()
    return len(COURSES), lessons


async def seed_doubts(session, by_email: dict[str, dict], ashford) -> None:
    """A few doubts in every state, so both the student Doubts page and the teacher inbox have real examples."""
    from scripts.learning_seed import COURSES, DOUBTS
    from services.learning.models import Doubt, DoubtMessage, Lesson

    sections = {code: section_code for code, section_code, *_ in COURSES}
    teachers = {section: teacher for section, _, teacher, *_ in CLASS_SECTIONS}
    reply_target = timedelta(hours=48)
    for code, (m_pos, l_pos), email, title, status, asked_hours, thread in DOUBTS:
        lesson = await session.get(Lesson, uid(f"lesson:{code}:{m_pos}:{l_pos}"))
        teacher = by_email[teachers[sections[code]]]
        asked = ANCHOR - timedelta(hours=asked_hours)
        sent = [ANCHOR - timedelta(hours=hours) for _, hours, _ in thread]
        replies = [when for (role, _, _), when in zip(thread, sent, strict=True) if role == "teacher"]
        doubt_id = uid(f"doubt:{code}:{title}")
        session.add(Doubt(
            id=doubt_id, institution_id=ashford, section_id=uid(f"class:{sections[code]}"), course_id=lesson.course_id,
            topic_id=lesson.topic_id, lesson_id=lesson.id, student_id=by_email[email]["id"], title=title,
            status=status, reply_due_at=sent[-1] + reply_target, created_at=asked, updated_at=sent[-1],
            first_answered_at=replies[0] if replies else None,
            resolved_at=sent[-1] if status == "resolved" else None,
        ))
        await session.flush()
        for (role, _, body), when in zip(thread, sent, strict=True):
            author = teacher if role == "teacher" else by_email[email]
            session.add(DoubtMessage(
                institution_id=ashford, doubt_id=doubt_id, author_id=author["id"], author_role=role,
                author_name=f"{author['first']} {author['last']}" if role == "teacher" else None,
                body=body, created_at=when,
            ))


async def seed_audit(session, institutions, people, admin_people) -> None:
    from services.audit.models import AuditEventRow

    events: list[AuditEventRow] = []
    owner_id = uid("person:sysadmin@edubot.example.edu")
    owner_label = "sysadmin@edubot.example.edu"

    def add(action, *, actor_id=owner_id, actor_label=owner_label, actor_type="admin",
            result="success", days, target_type=None, target_id=None, target_label=None,
            inst_code=None, diff=None):
        inst = institutions.get(inst_code) if inst_code else None
        events.append(
            AuditEventRow(
                id=uuid.uuid4() if not target_id else uid(f"audit:{action}:{target_id}:{days}"),
                occurred_at=days_ago(days) + timedelta(minutes=rng.randrange(0, 900)),
                actor_id=actor_id if actor_type == "admin" else None,
                actor_type=actor_type,
                actor_label=actor_label,
                action=action,
                result=result,
                target_type=target_type,
                target_id=str(target_id) if target_id else None,
                target_label=target_label,
                institution_id=inst["id"] if inst else None,
                institution_label=inst["name"] if inst else None,
                request_id=str(uuid.uuid4()),
                ip=f"192.0.2.{rng.randrange(2, 250)}",  # documentation range
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                diff=diff,
            )
        )

    # Institution lifecycle follows the dataset's own creation dates.
    for code, name, _t, status, *_rest in INSTITUTIONS:
        inst = institutions[code]
        created_days = next(i[6] for i in INSTITUTIONS if i[0] == code)
        add("institution.create", days=created_days, target_type="institution",
            target_id=inst["id"], target_label=name, inst_code=code)
        if status in ("active", "suspended"):
            add("institution.reactivate" if created_days > 400 else "institution.update",
                days=min(created_days - 1, rng.uniform(2, 380)),
                target_type="institution", target_id=inst["id"], target_label=name, inst_code=code)
        if status == "suspended":
            add("institution.suspend", days=14, target_type="institution", target_id=inst["id"],
                target_label=name, inst_code=code, diff={"reason": "Accreditation review in progress."})

    # Steady drumbeat of activity + auth events over ~90 days.
    admins = [a for a in PLATFORM_ADMINS if a[3] == "active"]
    for day in range(90):
        for _ in range(rng.randrange(0, 4)):
            first, last, email, _ = rng.choice(admins)
            add("auth.sign_in", days=day + rng.uniform(0, 1), actor_id=uid(f"person:{email}"),
                actor_label=email, target_type="account", target_id=uid(f"person:{email}"),
                target_label=email)
        if rng.random() < 0.35:
            person = rng.choice(people)
            code = person["inst_code"]
            actor = rng.choice(admins)
            action, target_type = rng.choice(ACTIONS_SUCCESS[2:])  # user/admin mutations
            add(action, days=day + rng.uniform(0, 1), actor_id=uid(f"person:{actor[2]}"),
                actor_label=actor[2], target_type="user", target_id=person["id"],
                target_label=f'{person["first"]} {person["last"]}', inst_code=code,
                diff={"status": {"before": "active", "after": "deactivated"}} if "deactivate" in action else None)
    # Failed sign-in history + one recent cluster (drives the attention indicator honestly).
    for _ in range(6):
        add("auth.sign_in_failed", result="denied", actor_type="anonymous",
            actor_id=None, actor_label="unknown@hilv.example.edu", days=rng.uniform(2, 80),
            target_type="account", target_label="unknown@hilv.example.edu",
            diff={"reason": "invalid_credentials"})
    for _minute_cluster in range(4):
        add("auth.sign_in_failed", result="denied", actor_type="anonymous", actor_id=None,
            actor_label="c.meyer@edubot.example.edu", days=0.35, target_type="account",
            target_label="c.meyer@edubot.example.edu", diff={"reason": "invalid_credentials"})
    # One denied privileged attempt (RBAC denial on record).
    add("institution.suspend", result="denied", days=2.5,
        actor_id=uid("person:t.lindqvist@edubot.example.edu"),
        actor_label="t.lindqvist@edubot.example.edu", target_type="http",
        target_label="POST /api/v1/institutions/…/suspend",
        diff={"detail": "Missing permission: institution.suspend"})
    add("settings.update", days=5.2, target_type="settings", target_id="platform",
        target_label="Platform settings",
        diff={"support_email": {"before": None, "after": "help@edubot.example.edu"}})

    session.add_all(events)
    await session.commit()


async def main(reset: bool) -> None:
    import services.audit.db as audit_db
    import services.identity.db as identity_db
    import services.learning.db as learning_db
    import services.rbac.db as rbac_db
    import services.tenancy.db as tenancy_db
    import services.users.db as users_db
    from services.tenancy.models import PlatformSettings

    modules = {
        "tenancy": tenancy_db,
        "users": users_db,
        "rbac": rbac_db,
        "identity": identity_db,
        "audit": audit_db,
        "learning": learning_db,
    }
    for module in modules.values():
        module.bind_from_settings()
        if reset:
            await module.reset_schema()

    institutions: dict[str, dict] = {
        i[0]: {"id": uid(f"institution:{i[0]}"), "name": i[1]} for i in INSTITUTIONS
    }
    people = build_people(institutions)
    check_role_demo_accounts(people)

    tenancy_mod, users_mod, rbac_mod, identity_mod, audit_mod = (
        modules["tenancy"], modules["users"], modules["rbac"], modules["identity"], modules["audit"],
    )

    from services.shared.db import make_sessionmaker

    tenancy_sessions = make_sessionmaker(tenancy_mod.get_engine())
    async with tenancy_sessions() as session:
        await seed_tenancy(session, {**institutions, "__settings__": {
            "row": PlatformSettings(
                id=1, platform_name="EduBot", support_email="help@edubot.example.edu",
                sign_in_notice="Authorized platform administrators only. All sign-ins are recorded.",
                updated_at=days_ago(5), updated_by=uid("person:sysadmin@edubot.example.edu"),
            )
        }})
        print(f"tenancy: {len(institutions)} institutions")

    people_rows = users_to_rows(people, institutions)
    users_sessions = make_sessionmaker(users_mod.get_engine())
    async with users_sessions() as session:
        await seed_users_db(session, people_rows)
        sections = await seed_classes(session, people, institutions)
        print(f"users: {len(people_rows)} people, {sections} class sections")

    rbac_sessions = make_sessionmaker(rbac_mod.get_engine())
    async with rbac_sessions() as session:
        await seed_rbac(session)
        print(f"rbac: catalog + {len(PLATFORM_ADMINS)} administrator assignments")

    identity_sessions = make_sessionmaker(identity_mod.get_engine())
    async with identity_sessions() as session:
        await seed_identity(session)
        print(f"identity: {len(PLATFORM_ADMINS)} admin accounts + {len(ROLE_DEMO_ACCOUNTS)} role demo accounts")

    audit_sessions = make_sessionmaker(audit_mod.get_engine())
    async with audit_sessions() as session:
        await seed_audit(session, institutions, people, PLATFORM_ADMINS)
        print("audit: activity history seeded")

    learning_sessions = make_sessionmaker(learning_db.get_engine())
    async with learning_sessions() as session:
        course_count, lesson_count = await seed_learning(session, people, institutions)
        print(f"learning: {course_count} courses, {lesson_count} lessons")

    students = sum(1 for p in people if p["type"] == "student")
    print(
        f"\nDone. {len(people_rows)} people across {len(institutions)} institutions "
        f"({students} students). Sign in: sysadmin@edubot.example.edu / "
        f"{os.environ.get('EDUBOT_SEED_ADMIN_PASSWORD', 'ChangeMe-admin-234!')}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", action="store_true", help="do not wipe first (not idempotent if re-run)")
    args = parser.parse_args()
    asyncio.run(main(reset=not args.keep))
