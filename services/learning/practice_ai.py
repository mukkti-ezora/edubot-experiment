"""AI-written practice: questions and flashcards from lesson material, validated before anything is stored.

The model is asked for strict JSON. Every item is checked on its own and dropped if anything about it is off;
the request fails as AI_UNAVAILABLE only when nothing usable came back.
"""

from __future__ import annotations

import json
import logging
import math
from collections.abc import Callable
from contextlib import aclosing
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from services.learning import tutor
from services.learning.doubts import AiUnavailable
from services.learning.enrolment import Enrolment
from services.learning.models import Lesson
from services.learning.practice_scoring import NUMERIC_LIMIT, ONE_CHOICE_KINDS
from services.learning.providers.base import ChatTurn, ProviderUnavailable

log = logging.getLogger(__name__)

AI_QUESTIONS_PER_SET = 5
AI_CARDS_MAX = 8
AI_SOURCE_CHARS = 12_000
OPTION_COUNT = (2, 6)
OPTION_ID_MAX = 8
TEXT_LIMITS = {"stem": 2000, "option": 500, "explanation": 2000, "card": 600}
QUESTION_KINDS = ("single", "multiple", "numeric", "true_false")
TRUE_FALSE_OPTIONS = [{"id": "true", "text": "True"}, {"id": "false", "text": "False"}]
# A generated tolerance may be at most 10% of the answer (or 0.5 when the answer is zero), so a careless model
# can't make every response "correct".
MAX_RELATIVE_TOLERANCE = 0.10
MAX_TOLERANCE_AT_ZERO = 0.5

PRACTICE_RULES = """You write practice questions for a college student, grounded only in the lesson material below.
Return ONLY a JSON object, no prose, in exactly this shape:
{"questions": [{"kind": "single" | "multiple" | "true_false" | "numeric", "stem": "...",
  "options": [{"id": "a", "text": "..."}], "answer": {"options": ["a"]} or {"value": 9.8, "tolerance": 0.1},
  "explanation": "...", "difficulty": 1 | 2 | 3}]}
- Write %d questions of mixed kinds and difficulty that check understanding, not recall of wording.
- single and multiple have 2 to 6 options; numeric has no options and a numeric answer with a tolerance.
- true_false uses the options "true" and "false".
- Every explanation says why the answer is right in one or two sentences."""

FLASHCARD_RULES = """You write flashcards for a college student from the lesson material below.
Return ONLY a JSON object, no prose: {"cards": [{"front": "a short question or term", "back": "a short answer"}]}
- Up to %d cards covering the key ideas, one idea per card, each side under 40 words."""


def extract_json(text: str) -> dict | None:
    """The first {...} object in a model reply, tolerating prose or code fences around it."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def valid_text(value: Any, limit: int) -> str | None:
    """Non-empty text within `limit` characters, stripped; None when it isn't."""
    return value.strip() if isinstance(value, str) and value.strip() and len(value) <= limit else None


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def _clean_options(kind: str, raw: Any) -> list[dict] | None:
    if kind == "true_false":
        return TRUE_FALSE_OPTIONS
    if not isinstance(raw, list) or not OPTION_COUNT[0] <= len(raw) <= OPTION_COUNT[1]:
        return None
    options = []
    for option in raw:
        if not isinstance(option, dict):
            return None
        option_id = valid_text(option.get("id"), OPTION_ID_MAX)
        text = valid_text(option.get("text"), TEXT_LIMITS["option"])
        if option_id is None or text is None:
            return None
        options.append({"id": option_id, "text": text})
    return options if len({o["id"] for o in options}) == len(options) else None


def _numeric_answer(raw: dict) -> dict | None:
    value, tolerance = raw.get("value"), raw.get("tolerance", 0)
    if not _is_number(value) or not _is_number(tolerance) or abs(value) > NUMERIC_LIMIT or tolerance < 0:
        return None
    limit = MAX_RELATIVE_TOLERANCE * abs(value) if value else MAX_TOLERANCE_AT_ZERO
    return {"value": value, "tolerance": tolerance} if tolerance <= limit else None


def _choice_answer(kind: str, raw: dict, options: list[dict]) -> dict | None:
    chosen = raw.get("options")
    if not isinstance(chosen, list) or not chosen or not all(isinstance(c, str) for c in chosen):
        return None
    if not set(chosen) <= {o["id"] for o in options}:
        return None
    if kind in ONE_CHOICE_KINDS and len(chosen) != 1:
        return None
    return {"options": list(dict.fromkeys(chosen))}


def validate_generated_question(raw: Any) -> dict | None:
    """One AI-written question in a storable shape, or None when anything about it is off."""
    if not isinstance(raw, dict) or raw.get("kind") not in QUESTION_KINDS:
        return None
    kind = raw["kind"]
    stem = valid_text(raw.get("stem"), TEXT_LIMITS["stem"])
    explanation = valid_text(raw.get("explanation"), TEXT_LIMITS["explanation"])
    options = [] if kind == "numeric" else _clean_options(kind, raw.get("options"))
    if stem is None or explanation is None or options is None or not isinstance(raw.get("answer"), dict):
        return None
    answer = _numeric_answer(raw["answer"]) if kind == "numeric" else _choice_answer(kind, raw["answer"], options)
    if answer is None:
        return None
    difficulty = raw.get("difficulty") if raw.get("difficulty") in (1, 2, 3) else 2
    return {"kind": kind, "stem": stem, "options": options, "answer": answer, "explanation": explanation,
            "difficulty": difficulty}


def validate_generated_card(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    front, back = valid_text(raw.get("front"), TEXT_LIMITS["card"]), valid_text(raw.get("back"), TEXT_LIMITS["card"])
    return {"front": front, "back": back} if front and back else None


def lesson_material(lessons: list[Lesson]) -> str:
    return "\n\n".join(f"## {lesson.title}\n{lesson.body}" for lesson in lessons)


async def generate(request: Request, session: AsyncSession, me: Enrolment, rules: str, material: str) -> dict:
    """Ask the institution's model for JSON; any failure to get a parseable object is AI_UNAVAILABLE."""
    settings = request.app.state.settings
    provider = await tutor.provider_for(session, request.app.state.tutor_providers, me.institution_id,
                                        settings.tutor_default_provider)
    stream = provider.stream(system=[rules, f"Lesson material:\n{material[:AI_SOURCE_CHARS]}"],
                             history=[ChatTurn(role="user", content="Write them now as JSON.")],
                             max_tokens=settings.ai_practice_max_tokens)
    try:
        async with aclosing(stream) as fragments:
            text = "".join([fragment async for fragment in fragments])
    except Exception as exc:
        reason = exc.reason if isinstance(exc, ProviderUnavailable) else "error"
        log.warning("ai_practice_failed", extra={"provider": provider.name, "reason": reason}, exc_info=True)
        raise AiUnavailable() from exc
    parsed = extract_json(text)
    if parsed is None:
        log.warning("ai_practice_unparseable", extra={"provider": provider.name})
        raise AiUnavailable()
    return parsed


def keep_valid(parsed: dict, field: str, validate: Callable[[Any], dict | None], limit: int) -> list[dict]:
    """The valid items under `field`, at most `limit`; logs how many came back and how many were kept."""
    raw = parsed.get(field) if isinstance(parsed.get(field), list) else []
    kept: list[dict] = []
    for index, item in enumerate(raw):
        cleaned = validate(item)
        if cleaned is None:
            log.debug("ai_item_dropped", extra={"field": field, "index": index})
        elif len(kept) < limit:
            kept.append(cleaned)
    log.info("ai_items_validated", extra={"field": field, "received": len(raw), "kept": len(kept)})
    if not kept:
        raise AiUnavailable()
    return kept
