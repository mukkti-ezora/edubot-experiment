import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from services.shared.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class AuthAccount(Base):
    """Credentials for people who can authenticate. Today: platform administrators only."""

    __tablename__ = "auth_accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)  # stored lowercase
    password_hash: Mapped[str] = mapped_column(Text)
    # Cross-service reference BY VALUE to the users service person record. No FK across ownership.
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    scope: Mapped[str] = mapped_column(String(16), default="platform")
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | disabled
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class RefreshToken(Base):
    """Opaque refresh sessions. Stored as SHA-256 hashes (tokens are high-entropy)."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("auth_accounts.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
