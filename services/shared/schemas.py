"""Shared pydantic primitives: camelCase JSON by default."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Page(CamelModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
