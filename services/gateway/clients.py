"""Gateway-side service registry: one AsyncClient per backend service.

Production uses plain network transports; E2E tests inject ASGI transports so the
entire distributed path runs in-process.
"""

from __future__ import annotations

import httpx

from services.shared.context import HEADER_INTERNAL_TOKEN


class ServiceRegistry:
    def __init__(
        self,
        *,
        internal_token: str,
        base_urls: dict[str, str],
        transports: dict[str, httpx.AsyncBaseTransport] | None = None,
    ) -> None:
        transports = transports or {}
        self._clients: dict[str, httpx.AsyncClient] = {
            name: httpx.AsyncClient(
                base_url=url,
                transport=transports.get(name),
                headers={HEADER_INTERNAL_TOKEN: internal_token},
                timeout=httpx.Timeout(8.0, connect=2.0),
            )
            for name, url in base_urls.items()
        }

    def client(self, name: str) -> httpx.AsyncClient:
        return self._clients[name]

    async def aclose(self) -> None:
        for client in self._clients.values():
            await client.aclose()
