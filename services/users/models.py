import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from services.shared.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)

USER_TYPES = ["student", "teacher", "parent", "administrator"]
USER_STATUSES = ["active", "invited", "suspended", "deactivated"]


class User(Base):
    """A person known to the platform.

    institution_id NULL + type=administrator == platform administrator.
    institution scopes all others by value-reference to tenancy's Institution.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    type: Mapped[str] = mapped_column(String(16), index=True)
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)  # stored lowercase
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        Index("ix_users_institution_created", "institution_id", "created_at"),
        Index("ix_users_name", "last_name", "first_name"),
    )
