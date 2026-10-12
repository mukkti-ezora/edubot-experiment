"""Claude adapter (official Anthropic SDK only)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import anthropic

from services.learning.providers.base import ChatTurn, ProviderUnavailable

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicTutor:
    name = "anthropic"

    def __init__(self, *, model: str, effort: str) -> None:
        self.model = model
        self._effort = effort
        self._client: anthropic.AsyncAnthropic | None = None

    def _get_client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            try:
                self._client = anthropic.AsyncAnthropic()
            except Exception as exc:  # missing credentials surface here or on first call
                raise ProviderUnavailable("Claude is not configured for this deployment.", reason="missing_credentials") from exc
        return self._client

    async def stream(self, *, system: list[str], history: list[ChatTurn], max_tokens: int) -> AsyncIterator[str]:
        client = self._get_client()
        # Stable tutor rules first (cached), lesson context second.
        system_blocks = [{"type": "text", "text": block} for block in system]
        system_blocks[0]["cache_control"] = {"type": "ephemeral"}
        try:
            async with client.beta.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system_blocks,
                messages=[{"role": t.role, "content": t.content} for t in history],
                output_config={"effort": self._effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",  # a safety decline is retried on Anthropic's recommended fallback model
            ) as stream:
                async for text in stream.text_stream:
                    yield text
                final = await stream.get_final_message()
            if final.stop_reason == "refusal":
                yield "\n\nI can't help with that one. Let's get back to your coursework."
        except anthropic.AuthenticationError as exc:
            raise ProviderUnavailable("Claude credentials were rejected.", reason="rejected_credentials") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderUnavailable("Claude could not be reached.", reason="unreachable") from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code == 429 or exc.status_code >= 500:
                raise ProviderUnavailable("Claude is busy right now.", reason="provider_busy") from exc
            raise
