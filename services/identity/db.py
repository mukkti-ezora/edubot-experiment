from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from services.identity.config import get_settings
from services.identity.models import Base
from services.shared.db import create_schema, drop_schema, make_engine, make_sessionmaker

_engine: AsyncEngine | None = None
_sessions: async_sessionmaker[AsyncSession] | None = None


def bind(database_url: str) -> None:
    global _engine, _sessions
    if _engine is not None:
        return  # one binding per process; tests bind before app creation
    _engine = make_engine(database_url)
    _sessions = make_sessionmaker(_engine)


def bind_from_settings() -> None:
    bind(get_settings().database_url)


def get_engine() -> AsyncEngine:
    assert _engine is not None, "identity db not bound"
    return _engine


async def reset_schema() -> None:
    engine = get_engine()
    await drop_schema(engine, Base.metadata)
    await create_schema(engine, Base.metadata)


async def get_session() -> AsyncIterator[AsyncSession]:
    assert _sessions is not None, "identity db not bound"
    async with _sessions() as session:
        yield session


SessionDep = Depends(get_session)
