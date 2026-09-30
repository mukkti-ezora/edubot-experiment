from fastapi import FastAPI

from services.rbac import db
from services.rbac.api import router
from services.rbac.config import get_settings
from services.shared.audit import AuditClient, forbidden_audit_hook
from services.shared.clients import ServiceClient
from services.shared.context import ContextMiddleware
from services.shared.errors import install_exception_handlers
from services.shared.logging import setup_logging

SERVICE_NAME = "rbac"


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(SERVICE_NAME, settings.log_level)
    db.bind_from_settings()

    app = FastAPI(title="edubot-rbac", docs_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.audit = AuditClient(settings.audit_url, settings.internal_token)
    app.state.users = ServiceClient(settings.users_url, settings.internal_token)

    app.add_middleware(ContextMiddleware, internal_token=settings.internal_token)
    install_exception_handlers(app, on_forbidden=forbidden_audit_hook(app.state.audit))

    app.include_router(router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True, "service": SERVICE_NAME}

    return app


app = create_app()
