import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from services.shared.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # e.g. institution.create
    domain: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text, default="")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    scope: Mapped[str] = mapped_column(String(16), default="platform")  # platform | institution (future)
    description: Mapped[str] = mapped_column(Text, default="")
    is_system: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )


class RoleAssignment(Base):
    """User → RoleAssignment → Role. Assignments carry their scope explicitly."""

    __tablename__ = "role_assignments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)  # person id (by value; owned by users)
    role_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roles.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[str] = mapped_column(String(16), default="platform")
    institution_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
