"""Class roster: teachers see exactly the students they teach; students see their classes."""

import uuid

import pytest

from services.gateway.tests.conftest import login
from services.gateway.tests.test_role_dashboards import PASSWORD
from services.identity.models import AuthAccount
from services.identity.security import hash_password
from services.users.models import ClassMember, ClassSection, User


async def _person(stack, institution_id, user_type, first, email, *, account=False) -> uuid.UUID:
    pid = uuid.uuid4()
    async with stack.session("users") as s:
        s.add(User(id=pid, institution_id=institution_id, type=user_type, first_name=first,
                   last_name="Okafor", email=email, status="active"))
        await s.commit()
    if account:
        async with stack.session("identity") as s:
            s.add(AuthAccount(email=email, password_hash=hash_password(PASSWORD), person_id=pid,
                              scope=user_type, status="active"))
            await s.commit()
    return pid


async def _section(stack, institution_id, code, members: list[tuple[uuid.UUID, str]]) -> None:
    sid = uuid.uuid4()
    async with stack.session("users") as s:
        s.add(ClassSection(id=sid, institution_id=institution_id, code=code, name=f"{code} class", term="2026 Autumn"))
        await s.flush()
        for person_id, role in members:
            s.add(ClassMember(section_id=sid, institution_id=institution_id, person_id=person_id, role=role))
        await s.commit()


@pytest.fixture
async def roster(stack, seeded):
    ash, hil = seeded["ashford"], seeded["hillview"]
    teacher = await _person(stack, ash, "teacher", "Tara", "tara@ashf.example.edu", account=True)
    other_teacher = await _person(stack, ash, "teacher", "Omar", "omar@ashf.example.edu", account=True)
    s1 = await _person(stack, ash, "student", "Sana", "sana@ashf.example.edu", account=True)
    s2 = await _person(stack, ash, "student", "Sam", "sam@ashf.example.edu")
    s3 = await _person(stack, ash, "student", "Sol", "sol@ashf.example.edu")
    stranger = await _person(stack, hil, "student", "Sky", "sky@hilv.example.edu")
    await _section(stack, ash, "PHY101-A", [(teacher, "teacher"), (s1, "student"), (s2, "student")])
    await _section(stack, ash, "CS110-A", [(other_teacher, "teacher"), (s3, "student"), (s1, "student")])
    await _section(stack, hil, "BIO100-A", [(stranger, "student")])
    return {"teacher": teacher, "s1": s1, "s2": s2, "s3": s3, "stranger": stranger}


@pytest.mark.asyncio
async def test_teacher_sees_only_their_own_students(client, roster):
    await login(client, "tara@ashf.example.edu", PASSWORD)

    classes = (await client.get("/api/v1/roster")).json()["classes"]

    assert [c["code"] for c in classes] == ["PHY101-A"]
    emails = {s["email"] for s in classes[0]["students"]}
    assert emails == {"sana@ashf.example.edu", "sam@ashf.example.edu"}


@pytest.mark.asyncio
async def test_student_sees_their_classes_and_teachers(client, roster):
    await login(client, "sana@ashf.example.edu", PASSWORD)

    classes = (await client.get("/api/v1/roster")).json()["classes"]

    assert sorted(c["code"] for c in classes) == ["CS110-A", "PHY101-A"]
    assert all("students" not in c for c in classes), "students never see classmates' details"
    teachers = {c["code"]: c["teachers"] for c in classes}
    assert teachers["PHY101-A"] == ["Tara Okafor"]


@pytest.mark.asyncio
async def test_platform_admin_is_not_served_the_role_roster(client, roster):
    await login(client)

    response = await client.get("/api/v1/roster")

    assert response.status_code == 403
