import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from services.shared.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class AuditEventRow(Base):
    """Product audit trail (ADR-0008). Append-only: no UPDATE/DELETE paths exist anywhere."""

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    actor_type: Mapped[str] = mapped_column(String(16))  # admin | student | teacher | parent | anonymous | system
    actor_label: Mapped[str | None] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(80), index=True)
    result: Mapped[str] = mapped_column(String(16), index=True)  # success | denied | error
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))  # uuid or natural key
    target_label: Mapped[str | None] = mapped_column(String(320))
    institution_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    institution_label: Mapped[str | None] = mapped_column(String(200))
    request_id: Mapped[str | None] = mapped_column(String(64), index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)  # sign-in session (identity)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(400))
    diff: Mapped[dict | None] = mapped_column(JSONB)

    __table_args__ = (
        Index("ix_audit_events_occurred_desc", occurred_at.desc()),
    )
