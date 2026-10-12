import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI

from services.identity import db, repo
from services.identity.api import router
from services.identity.config import get_settings
from services.shared.audit import AuditClient, forbidden_audit_hook
from services.shared.clients import ServiceClient
from services.shared.context import ContextMiddleware
from services.shared.errors import install_exception_handlers
from services.shared.logging import setup_logging

SERVICE_NAME = "identity"
log = logging.getLogger(__name__)


async def _rotate_sessions_forever(retention_days: int, interval_hours: int) -> None:
    """Rotate out expired session records at startup and then on a fixed interval."""
    from services.shared.db import make_sessionmaker

    while True:
        try:
            async with make_sessionmaker(db.get_engine())() as session:
                purged = await repo.purge_sessions(session, datetime.now(UTC) - timedelta(days=retention_days))
                await session.commit()
            if purged:
                log.info("sessions_rotated", extra={"purged": purged, "retention_days": retention_days})
        except Exception:
            log.exception("session_rotation_failed")
        await asyncio.sleep(interval_hours * 3600)


@asynccontextmanager
async def _lifespan(app: FastAPI):  # noqa: ANN202
    settings = app.state.settings
    task = asyncio.create_task(
        _rotate_sessions_forever(settings.session_retention_days, settings.session_purge_interval_hours)
    )
    try:
        yield
    finally:
        task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(SERVICE_NAME, settings.log_level)
    db.bind_from_settings()

    app = FastAPI(title="edubot-identity", docs_url=None, openapi_url=None, lifespan=_lifespan)
    app.state.settings = settings
    app.state.audit = AuditClient(settings.audit_url, settings.internal_token)
    app.state.rbac = ServiceClient(settings.rbac_url, settings.internal_token)

    app.add_middleware(ContextMiddleware, internal_token=settings.internal_token)
    install_exception_handlers(app, on_forbidden=forbidden_audit_hook(app.state.audit))

    app.include_router(router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True, "service": SERVICE_NAME}

    return app


app = create_app()
