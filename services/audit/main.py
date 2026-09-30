from fastapi import FastAPI

from services.audit import db
from services.audit.api import router
from services.audit.config import get_settings
from services.shared.context import ContextMiddleware
from services.shared.errors import install_exception_handlers
from services.shared.logging import setup_logging

SERVICE_NAME = "audit"


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(SERVICE_NAME, settings.log_level)
    db.bind_from_settings()

    app = FastAPI(title="edubot-audit", docs_url=None, openapi_url=None)
    app.state.settings = settings
    # The audit service never audits itself.
    install_exception_handlers(app)

    app.add_middleware(ContextMiddleware, internal_token=settings.internal_token)
    app.include_router(router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True, "service": SERVICE_NAME}

    return app


app = create_app()
