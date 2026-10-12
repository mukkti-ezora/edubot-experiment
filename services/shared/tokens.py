"""Access-token mint/verify (ADR-0005)."""

from __future__ import annotations

import time
import uuid
from typing import Any

import jwt

from services.shared.errors import Unauthenticated

ISSUER = "edubot"
ALGORITHM = "HS256"  # OD-2: RS256 for production


def create_access_token(
    *,
    secret: str,
    ttl_seconds: int,
    subject: uuid.UUID,
    email: str,
    scope: str,
    institution_id: uuid.UUID | None,
    permissions: list[str],
    session_id: uuid.UUID | None = None,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "iss": ISSUER,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": str(uuid.uuid4()),
        "sub": str(subject),
        "email": email,
        "scope": scope,
        "perms": sorted(permissions),
    }
    if institution_id is not None:
        claims["inst"] = str(institution_id)
    if session_id is not None:
        claims["sid"] = str(session_id)
    return jwt.encode(claims, secret, algorithm=ALGORITHM)


def decode_access_token(token: str, *, secret: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(token, secret, algorithms=[ALGORITHM], issuer=ISSUER)
    except jwt.PyJWTError as exc:
        raise Unauthenticated("Your session has expired. Sign in again.") from exc
    return claims
