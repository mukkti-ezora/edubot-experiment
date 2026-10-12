"""OpenAI adapter (official OpenAI SDK only)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import openai

from services.learning.providers.base import ChatTurn, ProviderUnavailable


class OpenAITutor:
    name = "openai"

    def __init__(self, *, model: str) -> None:
        self.model = model
        self._client: openai.AsyncOpenAI | None = None

    def _get_client(self) -> openai.AsyncOpenAI:
        if self._client is None:
            try:
                self._client = openai.AsyncOpenAI()
            except openai.OpenAIError as exc:  # raised when no API key is configured
                raise ProviderUnavailable("OpenAI is not configured for this deployment.", reason="missing_credentials") from exc
        return self._client

    async def stream(self, *, system: list[str], history: list[ChatTurn], max_tokens: int) -> AsyncIterator[str]:
        client = self._get_client()
        try:
            stream = await client.responses.create(
                model=self.model,
                instructions="\n\n".join(system),
                input=[{"role": t.role, "content": t.content} for t in history],
                max_output_tokens=max_tokens,
                store=False,  # student conversations are not retained by the provider
                stream=True,
            )
            async with stream:
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        yield event.delta
                    elif event.type in ("response.failed", "response.incomplete"):
                        raise RuntimeError(f"OpenAI response ended early: {event.type}")
        except openai.AuthenticationError as exc:
            raise ProviderUnavailable("OpenAI credentials were rejected.", reason="rejected_credentials") from exc
        except openai.APIConnectionError as exc:
            raise ProviderUnavailable("OpenAI could not be reached.", reason="unreachable") from exc
        except openai.APIStatusError as exc:
            if exc.status_code == 429 or exc.status_code >= 500:
                raise ProviderUnavailable("OpenAI is busy right now.", reason="provider_busy") from exc
            raise
