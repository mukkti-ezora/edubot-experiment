"""Keyset pagination helpers. Cursors are opaque base64url JSON {"v": value, "id": uuid}."""

from __future__ import annotations

import base64
import json
import uuid
from typing import Any

from services.shared.errors import ValidationFailed


def encode_cursor(value: Any, row_id: uuid.UUID) -> str:
    raw = json.dumps({"v": _ser(value), "id": str(row_id)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(raw: str | None) -> tuple[Any, uuid.UUID] | None:
    if not raw:
        return None
    try:
        padded = raw + "=" * (-len(raw) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        return data["v"], uuid.UUID(data["id"])
    except Exception as exc:
        raise ValidationFailed("Invalid pagination cursor.") from exc


def _ser(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return {"$uuid": str(value)}
    return value


def de(value: Any) -> Any:
    if isinstance(value, dict) and "$uuid" in value:
        return uuid.UUID(value["$uuid"])
    return value


def coerce_cursor_value(column: Any, value: Any) -> Any:
    """Convert a serialized cursor value back to the column's Python type."""
    from datetime import datetime

    from sqlalchemy import DateTime, Uuid

    if value is None:
        return None
    try:
        if isinstance(column.type, DateTime) and isinstance(value, str):
            return datetime.fromisoformat(value)
        if isinstance(column.type, Uuid) and isinstance(value, str):
            return uuid.UUID(value)
    except (NotImplementedError, AttributeError):
        return value
    return value
