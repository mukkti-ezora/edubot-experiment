"""Files (photos of working, submission files, leave documents, certificates) and student preferences.

Uploads arrive as the raw request body with the file name in the query string, so no multipart parser is
needed. The file's leading bytes must match its declared type. Only images are shown inline; PDFs download.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import cast, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import db
from services.learning.enrolment import Enrolment, student_enrolment, teacher_enrolment
from services.learning.models import (
    Assignment,
    Attachment,
    Course,
    CreditTransferRequest,
    Doubt,
    DoubtMessage,
    LeaveRequest,
    StudentPreference,
    StudentProgramme,
    Submission,
)
from services.shared.audit import AuditEvent
from services.shared.context import RequestContext, get_context
from services.shared.errors import AppError, NotFound, RateLimited, ValidationFailed
from services.shared.schemas import CamelModel

router = APIRouter()

DAY = timedelta(days=1)
FILENAME_MAX = 200
# Declared type -> the bytes every genuine file of that type starts with.
SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
    "application/pdf": (b"%PDF-",),
}
INLINE_TYPES = frozenset({"image/png", "image/jpeg", "image/webp"})
MAX_ATTACHMENTS_PER_ITEM = 4

TutorLanguage = Literal["en", "hinglish", "hi", "bn", "ta", "te", "mr", "kn", "ml", "gu"]
LANGUAGE_NAMES: dict[str, str] = {
    "en": "English", "hinglish": "Hinglish", "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu",
    "mr": "Marathi", "kn": "Kannada", "ml": "Malayalam", "gu": "Gujarati",
}


# ---- attachments ----

def _check_signature(content_type: str, data: bytes) -> None:
    signatures = SIGNATURES.get(content_type)
    if signatures is None:
        raise ValidationFailed("Upload a PNG, JPEG or WebP image, or a PDF.")
    if not any(data.startswith(signature) for signature in signatures):
        raise ValidationFailed("That file doesn't look like the type it claims to be.")
    if content_type == "image/webp" and data[8:12] != b"WEBP":
        raise ValidationFailed("That file doesn't look like the type it claims to be.")


def _clean_filename(name: str) -> str:
    cleaned = "".join(ch for ch in name if ch.isprintable() and ch not in '/\\"').strip()
    return cleaned[:FILENAME_MAX] or "file"


async def _store(request: Request, session: AsyncSession, me: Enrolment, filename: str) -> dict:
    settings = request.app.state.settings
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    uploaded_today = (await session.execute(select(func.count()).where(
        Attachment.owner_id == me.person_id, Attachment.created_at >= datetime.now(UTC) - DAY))).scalar_one()
    if uploaded_today >= settings.attachments_per_day:
        raise RateLimited("You've uploaded a lot of files today. Try again tomorrow.")
    data = await read_limited(request, settings.attachment_max_bytes)
    if not data:
        raise ValidationFailed("The file is empty.")
    _check_signature(content_type, data)
    attachment = Attachment(institution_id=me.institution_id, owner_id=me.person_id,
                            filename=_clean_filename(filename), content_type=content_type, size=len(data),
                            sha256=hashlib.sha256(data).hexdigest(), data=data)
    session.add(attachment)
    await session.commit()
    return describe(attachment)


class PayloadTooLarge(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"
    public_message = "That file is too large."


async def read_limited(request: Request, limit: int) -> bytes:
    """Read the body, refusing as soon as it exceeds `limit` bytes rather than after buffering all of it."""
    too_large = PayloadTooLarge(f"Files can be up to {limit // (1024 * 1024)} MB.")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise too_large
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise too_large
        chunks.append(chunk)
    return b"".join(chunks)


def describe(attachment: Attachment) -> dict:
    return {"id": str(attachment.id), "filename": attachment.filename, "contentType": attachment.content_type,
            "size": attachment.size}


async def owned_attachments(session: AsyncSession, me: Enrolment, ids: list[uuid.UUID]) -> list[str]:
    """Validate that every id is a file the caller uploaded; returns them as stored strings."""
    if len(ids) > MAX_ATTACHMENTS_PER_ITEM:
        raise ValidationFailed(f"Attach up to {MAX_ATTACHMENTS_PER_ITEM} files.")
    if not ids:
        return []
    found = set((await session.execute(select(Attachment.id).where(
        Attachment.id.in_(ids), Attachment.owner_id == me.person_id,
        Attachment.institution_id == me.institution_id))).scalars())
    if found != set(ids):
        raise NotFound("Attachment not found.")
    return [str(i) for i in ids]


async def describe_many(session: AsyncSession, ids: list[str]) -> dict[str, dict]:
    """Metadata (never the bytes) for attachments referenced by messages or submissions."""
    if not ids:
        return {}
    rows = (await session.execute(
        select(Attachment.id, Attachment.filename, Attachment.content_type, Attachment.size)
        .where(Attachment.id.in_([uuid.UUID(i) for i in ids]))
    )).all()
    return {str(r.id): {"id": str(r.id), "filename": r.filename, "contentType": r.content_type, "size": r.size}
            for r in rows}


def _referenced(column, attachment_id: uuid.UUID):  # noqa: ANN001, ANN202
    return cast(column, JSONB).contains([str(attachment_id)])


async def _teacher_can_read(session: AsyncSession, me: Enrolment, attachment_id: uuid.UUID) -> bool:
    """A teacher sees a file when it is part of a doubt, submission or leave request from their classes."""
    in_doubt = select(DoubtMessage.id).join(Doubt, Doubt.id == DoubtMessage.doubt_id).where(
        _referenced(DoubtMessage.attachment_ids, attachment_id), Doubt.section_id.in_(me.section_ids))
    in_submission = (select(Submission.id).join(Assignment, Assignment.id == Submission.assignment_id)
                     .join(Course, Course.id == Assignment.course_id)
                     .where(_referenced(Submission.attachment_ids, attachment_id),
                            Course.section_id.in_(me.section_ids)))
    in_leave = select(LeaveRequest.id).where(_referenced(LeaveRequest.attachment_ids, attachment_id),
                                             LeaveRequest.person_id.in_(list(me.student_names)))
    in_transfer = (select(CreditTransferRequest.id)
                   .join(StudentProgramme, StudentProgramme.person_id == CreditTransferRequest.person_id)
                   .where(CreditTransferRequest.certificate_attachment_id == attachment_id,
                          StudentProgramme.advisor_id == me.person_id))
    for query in (in_doubt, in_submission, in_leave, in_transfer):
        if (await session.execute(query.limit(1))).first() is not None:
            return True
    return False


def _download(attachment: Attachment) -> Response:
    disposition = "inline" if attachment.content_type in INLINE_TYPES else "attachment"
    return Response(content=attachment.data, media_type=attachment.content_type, headers={
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(attachment.filename)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    })


async def _attachment(session: AsyncSession, me: Enrolment, attachment_id: uuid.UUID) -> Attachment:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None or attachment.institution_id != me.institution_id:
        raise NotFound("File not found.")
    return attachment


FileName = Annotated[str, Query(min_length=1, max_length=FILENAME_MAX)]


@router.post("/student/attachments", status_code=201)
async def student_upload(
    filename: FileName,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    return await _store(request, session, await student_enrolment(request, ctx), filename)


@router.post("/teacher/attachments", status_code=201)
async def teacher_upload(
    filename: FileName,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    return await _store(request, session, await teacher_enrolment(request, ctx), filename)


@router.get("/student/attachments/{attachment_id}")
async def student_download(
    attachment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> Response:
    """Students open their own files and files their teachers attached to the student's doubts."""
    me = await student_enrolment(request, ctx)
    attachment = await _attachment(session, me, attachment_id)
    if attachment.owner_id != me.person_id:
        shared_with_me = (await session.execute(
            select(DoubtMessage.id).join(Doubt, Doubt.id == DoubtMessage.doubt_id)
            .where(_referenced(DoubtMessage.attachment_ids, attachment_id), Doubt.student_id == me.person_id)
            .limit(1)
        )).first()
        if shared_with_me is None:
            raise NotFound("File not found.")
    return _download(attachment)


@router.get("/teacher/attachments/{attachment_id}")
async def teacher_download(
    attachment_id: uuid.UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> Response:
    me = await teacher_enrolment(request, ctx)
    attachment = await _attachment(session, me, attachment_id)
    if attachment.owner_id != me.person_id:
        if not await _teacher_can_read(session, me, attachment_id):
            raise NotFound("File not found.")
        await request.app.state.audit.emit(ctx, AuditEvent(  # staff opened a student's file
            action="attachment.view", target_type="attachment", target_id=attachment.id,
            target_label=attachment.filename, institution_id=attachment.institution_id))
    return _download(attachment)


# ---- preferences ----

class PreferencesIn(CamelModel):
    tutor_language: TutorLanguage


async def tutor_language(session: AsyncSession, person_id: uuid.UUID) -> str:
    preference = await session.get(StudentPreference, person_id)
    return preference.tutor_language if preference else "en"


def _preferences(language: str) -> dict:
    return {"tutorLanguage": language,
            "languages": [{"code": code, "name": name} for code, name in LANGUAGE_NAMES.items()]}


@router.get("/student/preferences")
async def get_preferences(
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    return _preferences(await tutor_language(session, me.person_id))


@router.put("/student/preferences")
async def put_preferences(
    body: PreferencesIn,
    request: Request,
    session: Annotated[AsyncSession, Depends(db.get_session)],
    ctx: Annotated[RequestContext, Depends(get_context)],
) -> dict:
    me = await student_enrolment(request, ctx)
    preference = await session.get(StudentPreference, me.person_id) or StudentPreference(
        person_id=me.person_id, institution_id=me.institution_id)
    preference.tutor_language, preference.updated_at = body.tutor_language, datetime.now(UTC)
    session.add(preference)
    await session.commit()
    return _preferences(preference.tutor_language)


def language_rule(language: str) -> str | None:
    """The tutor's reply-language instruction, or None for English."""
    if language == "en":
        return None
    if language == "hinglish":
        return ("Reply in Hinglish: Hindi written in Roman script, mixed naturally with English the way students "
                "speak. Keep technical terms, formulas and code in English.")
    return (f"Reply in {LANGUAGE_NAMES[language]}, in its native script. Keep technical terms, formulas and code in "
            "English, and add the English term in brackets the first time you use a translated one.")

