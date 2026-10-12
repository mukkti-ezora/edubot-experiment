import uuid

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware

from services.gateway.api import router
from services.gateway.clients import ServiceRegistry
from services.gateway.config import get_settings
from services.shared.errors import install_exception_handlers
from services.shared.logging import setup_logging

SERVICE_NAME = "gateway"


class RequestIdMiddleware(BaseHTTPMiddleware):
    """The edge assigns/propagates request ids; internal-token check happens in the services."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN202
        request.state.request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-Id"] = request.state.request_id
        return response


def create_app(transports: dict | None = None) -> FastAPI:
    settings = get_settings()
    setup_logging(SERVICE_NAME, settings.log_level)

    app = FastAPI(title="edubot-gateway", docs_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.registry = ServiceRegistry(
        internal_token=settings.internal_token,
        base_urls={
            "identity": settings.identity_url,
            "tenancy": settings.tenancy_url,
            "users": settings.users_url,
            "rbac": settings.rbac_url,
            "audit": settings.audit_url,
            "learning": settings.learning_url,
        },
        transports=transports,
    )

    app.add_middleware(RequestIdMiddleware)
    install_exception_handlers(app)
    app.include_router(router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True, "service": SERVICE_NAME}

    return app


app = create_app()
