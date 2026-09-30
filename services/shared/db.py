"""SQLAlchemy 2 async helpers shared by services."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, pool_pre_ping=True)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)


async def create_schema(engine: AsyncEngine, metadata) -> None:  # noqa: ANN001
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)


async def drop_schema(engine: AsyncEngine, metadata) -> None:  # noqa: ANN001
    async with engine.begin() as conn:
        await conn.run_sync(metadata.drop_all)
