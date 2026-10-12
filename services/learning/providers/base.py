"""Provider-neutral contract for the AI tutor. Each adapter wraps exactly one vendor SDK."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

PROVIDERS = ("anthropic", "openai")


class ProviderUnavailable(Exception):
    """The provider has no credentials or cannot be reached; the tutor shows a clear unavailable state."""

    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.reason = reason  # missing_credentials | rejected_credentials | unreachable


@dataclass(frozen=True)
class ChatTurn:
    role: str  # "user" | "assistant"
    content: str


class TutorProvider(Protocol):
    name: str
    model: str

    def stream(self, *, system: list[str], history: list[ChatTurn], max_tokens: int) -> AsyncIterator[str]:
        """Yield the reply as text fragments. `system` is ordered stable-first for prompt caching."""
        ...
