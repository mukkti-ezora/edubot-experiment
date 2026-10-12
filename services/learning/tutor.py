"""EduBot Tutor: hint-first, grounded in the student's lesson, streamed, and logged to the learning trail."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import aclosing

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from services.learning import files
from services.learning.config import Settings
from services.learning.models import (
    Course,
    InstitutionTutorSetting,
    LearningEvent,
    Lesson,
    Module,
    TutorMessage,
)
from services.learning.providers.anthropic_provider import AnthropicTutor
from services.learning.providers.base import PROVIDERS, ChatTurn, ProviderUnavailable, TutorProvider
from services.learning.providers.openai_provider import OpenAITutor
from services.shared.context import RequestContext

log = logging.getLogger(__name__)

UNAVAILABLE_MESSAGE = "The tutor isn't available right now. Try again in a few minutes, or ask your teacher."
FAILED_MESSAGE = "Something went wrong while answering. Try asking again."

TUTOR_RULES = """You are EduBot Tutor, a patient tutor for students at their institution. You help students learn; you do not do their work for them.

How you teach:
- Give hints, guiding questions and small steps before full answers. For anything that looks like a graded assignment, quiz or exam question, guide step by step and never hand over the final answer.
- When a student asks to understand a concept, explain it clearly with one small example, then check understanding with one short question.
- Start from what the student already knows; ask one short question when it helps you pitch the explanation.
- Keep replies under about 180 words unless the student asks for more. Use plain language, short Markdown lists, and `code` formatting for code or formulas.
- Use the lesson material below when it is relevant and say when an answer goes beyond it.
- If you are not sure, say so. Never invent facts, references or numbers.

Boundaries:
- You are an AI tutor, not a friend or counsellor. Keep to learning topics.
- If the student mentions self-harm, harming others or being in danger, reply with care, encourage them to contact a trusted adult or their institution's counsellor now, and do not continue the lesson in that reply.
- The student has been told that their teachers can review tutor conversations."""

# A deliberately simple safety net. It only routes a conversation to adult review; it is not a classifier.
DISTRESS = re.compile(
    r"\b(kill myself|hurt myself|harm myself|suicid\w*|self[- ]harm|end my life|want to die|cutting myself)\b",
    re.IGNORECASE,
)


def build_providers(settings: Settings) -> dict[str, TutorProvider]:
    return {
        "anthropic": AnthropicTutor(model=settings.anthropic_model, effort=settings.anthropic_effort),
        "openai": OpenAITutor(model=settings.openai_model),
    }


async def provider_for(session: AsyncSession, providers: dict[str, TutorProvider], institution_id: uuid.UUID,
                       default: str) -> TutorProvider:
    setting = await session.get(InstitutionTutorSetting, institution_id)
    name = setting.provider if setting and setting.provider in PROVIDERS else default
    return providers[name]


async def lesson_context(session: AsyncSession, lesson_id: uuid.UUID | None) -> str | None:
    if lesson_id is None:
        return None
    row = (
        await session.execute(
            select(Lesson, Module, Course)
            .join(Module, Module.id == Lesson.module_id)
            .join(Course, Course.id == Lesson.course_id)
            .where(Lesson.id == lesson_id)
        )
    ).first()
    if row is None:
        return None
    lesson, module, course = row
    return (
        f"The student is studying {course.code} {course.title}, module \"{module.title}\", "
        f"lesson \"{lesson.title}\".\n\nLesson material:\n{lesson.body}"
    )


async def history_for(session: AsyncSession, conversation_id: uuid.UUID, person_id: uuid.UUID,
                      turns: int) -> list[ChatTurn]:
    rows = (
        await session.execute(
            select(TutorMessage)
            .where(TutorMessage.conversation_id == conversation_id, TutorMessage.person_id == person_id)
            .order_by(TutorMessage.created_at.desc())
            .limit(turns)
        )
    ).scalars().all()
    return alternate([ChatTurn(role=r.role, content=r.content) for r in reversed(rows)])


def alternate(turns: list[ChatTurn]) -> list[ChatTurn]:
    """Providers expect user/assistant turns to alternate, starting with the user. A question whose answer
    never arrived (stream cancelled, provider down) is merged into the next one rather than sent twice."""
    out: list[ChatTurn] = []
    for turn in turns:
        if not out and turn.role != "user":
            continue
        if out and out[-1].role == turn.role:
            out[-1] = ChatTurn(role=turn.role, content=f"{out[-1].content}\n\n{turn.content}")
        else:
            out.append(turn)
    return out


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def answer(
    *,
    sessions: async_sessionmaker[AsyncSession],
    providers: dict[str, TutorProvider],
    settings: Settings,
    ctx: RequestContext,
    institution_id: uuid.UUID,
    message: str,
    conversation_id: uuid.UUID | None,
    lesson_id: uuid.UUID | None,
) -> AsyncIterator[str]:
    """Stream one tutor reply as server-sent events, persisting both turns to the trail."""
    conversation_id = conversation_id or uuid.uuid4()
    person_id = ctx.actor_id
    async with sessions() as session:
        provider = await provider_for(session, providers, institution_id, settings.tutor_default_provider)
        context = await lesson_context(session, lesson_id)
        reply_language = files.language_rule(await files.tutor_language(session, person_id))
        history = await history_for(session, conversation_id, person_id, settings.tutor_history_turns)
        flagged = bool(DISTRESS.search(message))
        session.add(TutorMessage(conversation_id=conversation_id, institution_id=institution_id,
                                 person_id=person_id, session_id=ctx.session_id, lesson_id=lesson_id,
                                 role="user", content=message))
        session.add(LearningEvent(institution_id=institution_id, person_id=person_id, session_id=ctx.session_id,
                                  kind="tutor_question", lesson_id=lesson_id,
                                  detail={"conversationId": str(conversation_id), "text": message}))
        if flagged:
            session.add(LearningEvent(institution_id=institution_id, person_id=person_id,
                                      session_id=ctx.session_id, kind="tutor_flagged", lesson_id=lesson_id,
                                      detail={"conversationId": str(conversation_id), "reason": "distress"}))
        await session.commit()

    system = [TUTOR_RULES] + [block for block in (reply_language, context) if block]
    turns = alternate([*history, ChatTurn(role="user", content=message)])
    reply: list[str] = []
    outcome = "cancelled"

    async def record(text: str) -> None:
        """Persist what the student actually saw, even when the stream was cut short."""
        async with sessions() as session:
            if text:
                session.add(TutorMessage(conversation_id=conversation_id, institution_id=institution_id,
                                         person_id=person_id, session_id=ctx.session_id, lesson_id=lesson_id,
                                         role="assistant", content=text, provider=provider.name,
                                         model=provider.model))
            kind = "tutor_answer" if text else f"tutor_{outcome}"
            detail = {"conversationId": str(conversation_id), "provider": provider.name}
            if text and outcome != "complete":
                detail["truncated"] = outcome
            session.add(LearningEvent(institution_id=institution_id, person_id=person_id,
                                      session_id=ctx.session_id, kind=kind, lesson_id=lesson_id, detail=detail))
            await session.commit()

    try:
        async with aclosing(provider.stream(system=system, history=turns,
                                            max_tokens=settings.tutor_max_tokens)) as fragments:
            async for fragment in fragments:
                reply.append(fragment)
                yield sse({"type": "delta", "text": fragment})
        outcome = "complete" if "".join(reply).strip() else "empty"
    except ProviderUnavailable as exc:
        outcome = "unavailable"
        log.warning("tutor_unavailable", extra={"provider": provider.name, "reason": exc.reason,
                                                "institution": str(institution_id)})
    except Exception:
        outcome = "failed"
        log.exception("tutor_failed", extra={"provider": provider.name})
    finally:
        # Shielded so a client disconnect (task cancellation) cannot drop the half-written answer.
        await asyncio.shield(record("".join(reply).strip()))

    if outcome == "complete":
        yield sse({"type": "done", "conversationId": str(conversation_id)})
    elif outcome == "unavailable":
        yield sse({"type": "error", "code": "TUTOR_UNAVAILABLE", "message": UNAVAILABLE_MESSAGE})
    else:
        yield sse({"type": "error", "code": "TUTOR_FAILED", "message": FAILED_MESSAGE})
