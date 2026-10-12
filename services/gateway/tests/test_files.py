"""Files (photo doubts, uploads), and the tutor's reply language, end to end through the gateway."""

import uuid

import pytest

from services.gateway.tests.conftest import audit_rows
from services.gateway.tests.test_doubts import DOUBTS, FETCH, INBOX, _ask, _signed_in, world  # noqa: F401
from services.gateway.tests.test_student_learning import FakeTutor
from services.learning.models import CreditTransferRequest, MoocCourse, Programme, StudentProgramme

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"\x00" * 64
UPLOAD = "/api/v1/student/attachments"


async def _upload(client, data: bytes = PNG, content_type: str = "image/png", name: str = "working.png"):
    return await client.post(UPLOAD, params={"filename": name}, content=data,
                             headers={**FETCH, "content-type": content_type})


@pytest.mark.asyncio
async def test_a_photo_can_be_uploaded_and_opened_inline(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        uploaded = (await _upload(sana)).json()
        opened = await sana.get(f"{UPLOAD}/{uploaded['id']}")

    assert uploaded["contentType"] == "image/png" and uploaded["size"] == len(PNG)
    assert opened.content == PNG
    assert opened.headers["content-disposition"].startswith("inline")
    assert opened.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_pdfs_download_rather_than_open_in_the_page(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        uploaded = (await _upload(sana, PDF, "application/pdf", "notes.pdf")).json()
        opened = await sana.get(f"{UPLOAD}/{uploaded['id']}")

    assert opened.headers["content-disposition"].startswith("attachment")


@pytest.mark.asyncio
@pytest.mark.parametrize("data,content_type", [
    (b"<svg onload=alert(1)>", "image/svg+xml"),  # not an allowed type
    (b"<html>not an image</html>", "image/png"),  # bytes don't match the declared type
    (b"", "image/png"),  # empty
])
async def test_unsafe_or_mislabelled_files_are_refused(stack, world, data, content_type):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await _upload(sana, data, content_type)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_files_over_the_size_limit_are_refused(stack, world):  # noqa: F811
    stack.apps["learning"].state.settings.attachment_max_bytes = len(PNG) - 1
    try:
        async with _signed_in(stack, "sana@ashf.example.edu") as sana:
            response = await _upload(sana)
    finally:
        stack.apps["learning"].state.settings.attachment_max_bytes = 10 * 1024 * 1024

    assert response.status_code == 413


@pytest.mark.asyncio
async def test_other_students_cannot_open_your_files(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        uploaded = (await _upload(sana)).json()
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        response = await sam.get(f"{UPLOAD}/{uploaded['id']}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_photo_doubt_reaches_the_teacher_with_its_photo(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        photo = (await _upload(sana)).json()
        doubt = await _ask(sana, world, attachmentIds=[photo["id"]])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        detail = (await tara.get(f"{INBOX}/{doubt['id']}")).json()
        opened = await tara.get(f"/api/v1/teacher/attachments/{photo['id']}")
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        other_class = await omar.get(f"/api/v1/teacher/attachments/{photo['id']}")

    assert detail["messages"][0]["attachments"][0]["filename"] == "working.png"
    assert opened.status_code == 200 and opened.content == PNG
    assert other_class.status_code == 404


@pytest.mark.asyncio
async def test_a_doubt_cannot_attach_someone_elses_file(stack, world):  # noqa: F811
    async with _signed_in(stack, "sam@ashf.example.edu") as sam:
        sams = (await _upload(sam)).json()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(DOUBTS, json={"courseId": str(world["phy"]), "title": "Help", "body": "Stuck",
                                                 "attachmentIds": [sams["id"]]}, headers=FETCH)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_teacher_reply_can_carry_a_photo_the_student_can_open(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        doubt = await _ask(sana, world)
        async with _signed_in(stack, "tara@ashf.example.edu") as tara:
            sketch = (await tara.post("/api/v1/teacher/attachments", params={"filename": "sketch.png"},
                                      content=PNG, headers={**FETCH, "content-type": "image/png"})).json()
            await tara.post(f"{INBOX}/{doubt['id']}/messages", json={"body": "See the sketch.",
                                                                     "attachmentIds": [sketch["id"]]}, headers=FETCH)
        opened = await sana.get(f"{UPLOAD}/{sketch['id']}")

    assert opened.status_code == 200


@pytest.mark.asyncio
async def test_tutor_replies_in_the_students_chosen_language(stack, world):  # noqa: F811
    fake = FakeTutor("anthropic")
    stack.apps["learning"].state.tutor_providers = {"anthropic": fake, "openai": fake}
    stack.apps["learning"].state.tutor_limiter.reset()
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        saved = (await sana.put("/api/v1/student/preferences", json={"tutorLanguage": "hinglish"},
                                headers=FETCH)).json()
        await sana.post("/api/v1/student/tutor/messages", json={"message": "Velocity kya hai?"}, headers=FETCH)

    assert saved["tutorLanguage"] == "hinglish"
    assert any("Hinglish" in block for block in fake.calls[0]["system"])


@pytest.mark.asyncio
async def test_unknown_tutor_language_is_refused(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.put("/api/v1/student/preferences", json={"tutorLanguage": "klingon"}, headers=FETCH)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_oversized_uploads_are_refused_before_being_buffered(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        response = await sana.post(UPLOAD, params={"filename": "big.png"}, content=PNG + b"\x00" * (12 * 1024 * 1024),
                                   headers={**FETCH, "content-type": "image/png"})

    assert response.status_code == 413


@pytest.mark.asyncio
async def test_teacher_opening_a_students_file_is_audited(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        photo = (await _upload(sana)).json()
        await _ask(sana, world, attachmentIds=[photo["id"]])
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        await tara.get(f"/api/v1/teacher/attachments/{photo['id']}")

    assert ("attachment.view", "success", "tara@ashf.example.edu") in await audit_rows(stack)


@pytest.mark.asyncio
async def test_advisor_can_open_a_credit_certificate(stack, world):  # noqa: F811
    async with _signed_in(stack, "sana@ashf.example.edu") as sana:
        certificate = (await _upload(sana, PDF, "application/pdf", "nptel.pdf")).json()
    async with stack.session("learning") as s:
        programme = Programme(institution_id=uuid.uuid4(), name="B.Sc.", total_credits=160)
        s.add(programme)
        await s.flush()
        s.add(StudentProgramme(person_id=world["sana"], institution_id=programme.institution_id,
                               programme_id=programme.id, admitted_year=2025, advisor_id=world["tara"]))
        mooc = MoocCourse(institution_id=programme.institution_id, provider="NPTEL", title="ML", weeks=8, credits=2,
                          category="Elective", url="https://onlinecourses.nptel.ac.in/")
        s.add(mooc)
        await s.flush()
        s.add(CreditTransferRequest(institution_id=programme.institution_id, person_id=world["sana"],
                                    mooc_course_id=mooc.id, score_percent=72,
                                    certificate_attachment_id=uuid.UUID(certificate["id"])))
        await s.commit()
    async with _signed_in(stack, "tara@ashf.example.edu") as tara:
        advisor = await tara.get(f"/api/v1/teacher/attachments/{certificate['id']}")
    async with _signed_in(stack, "omar@ashf.example.edu") as omar:
        not_advisor = await omar.get(f"/api/v1/teacher/attachments/{certificate['id']}")

    assert advisor.status_code == 200
    assert not_advisor.status_code == 404
