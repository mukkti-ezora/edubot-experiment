"""Inter-service HTTP client. Carries the internal token and forwards the request context."""

from __future__ import annotations

from typing import Any

import httpx

from services.shared.context import HEADER_INTERNAL_TOKEN, RequestContext, forward_headers
from services.shared.errors import AppError


class ServiceClient:
    def __init__(
        self,
        base_url: str,
        internal_token: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 5.0,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            transport=transport,
            timeout=timeout,
            headers={HEADER_INTERNAL_TOKEN: internal_token},
        )

    async def get(
        self, path: str, *, ctx: RequestContext | None = None, params: dict | None = None
    ) -> Any:
        response = await self._client.get(
            path, params=params, headers=forward_headers(ctx) if ctx else None
        )
        return self._unwrap(response)

    async def post(
        self, path: str, *, ctx: RequestContext | None = None, json: Any = None
    ) -> Any:
        response = await self._client.post(
            path, json=json, headers=forward_headers(ctx) if ctx else None
        )
        return self._unwrap(response)

    async def patch(
        self, path: str, *, ctx: RequestContext | None = None, json: Any = None
    ) -> Any:
        response = await self._client.patch(
            path, json=json, headers=forward_headers(ctx) if ctx else None
        )
        return self._unwrap(response)

    async def aclose(self) -> None:
        await self._client.aclose()

    @staticmethod
    def _unwrap(response: httpx.Response) -> Any:
        if response.status_code >= 400:
            try:
                body = response.json()
            except Exception:
                body = {}
            code = body.get("code", "INTERNAL")
            message = body.get("message", "Upstream service error.")
            raise AppError(message, details={"upstream": code})
        if response.status_code == 204 or not response.content:
            return None
        return response.json()
