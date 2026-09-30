import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from services.shared.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)

INSTITUTION_TYPES = [
    "University",
    "College",
    "Community College",
    "Institute of Technology",
    "Academy",
]

INSTITUTION_STATUSES = ["active", "pending", "suspended"]


class Institution(Base):
    """The tenant root. Every institution-owned resource references this id."""

    __tablename__ = "institutions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)  # e.g. ASHF
    name: Mapped[str] = mapped_column(String(200), index=True)
    type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    city: Mapped[str | None] = mapped_column(String(120))
    region: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(120))
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    status_note: Mapped[str | None] = mapped_column(String(400))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlatformSettings(Base):
    """Singleton row (id=1 fields). Editable MVP settings only — no invented configuration."""

    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    platform_name: Mapped[str] = mapped_column(String(120), default="EduBot")
    support_email: Mapped[str | None] = mapped_column(String(320))
    sign_in_notice: Mapped[str | None] = mapped_column(String(400))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
