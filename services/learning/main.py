import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI

from services.learning import coursework, db, doubts, files, practice, progress, schedule
from services.learning.api import purge_trail_older_than, router
from services.learning.config import get_settings
from services.learning.tutor import build_providers
from services.shared.audit import AuditClient, forbidden_audit_hook
from services.shared.clients import ServiceClient
from services.shared.context import ContextMiddleware
from services.shared.errors import install_exception_handlers
from services.shared.logging import setup_logging
from services.shared.ratelimit import FixedWindowLimiter

SERVICE_NAME = "learning"
log = logging.getLogger(__name__)


async def _rotate_trail_forever(retention_days: int, interval_hours: int) -> None:
    """Rotate out learning-trail records (lesson events, tutor chats) past the retention window."""
    while True:
        try:
            async with db.get_sessionmaker()() as session:
                purged = await purge_trail_older_than(session, datetime.now(UTC) - timedelta(days=retention_days))
                await session.commit()
            if purged:
                log.info("trail_rotated", extra={"purged": purged, "retention_days": retention_days})
        except Exception:
            log.exception("trail_rotation_failed")
        await asyncio.sleep(interval_hours * 3600)


@asynccontextmanager
async def _lifespan(app: FastAPI):  # noqa: ANN202
    settings = app.state.settings
    task = asyncio.create_task(
        _rotate_trail_forever(settings.trail_retention_days, settings.trail_purge_interval_hours)
    )
    try:
        yield
    finally:
        task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(SERVICE_NAME, settings.log_level)
    db.bind_from_settings()

    app = FastAPI(title="edubot-learning", docs_url=None, openapi_url=None, lifespan=_lifespan)
    app.state.settings = settings
    app.state.audit = AuditClient(settings.audit_url, settings.internal_token)
    app.state.users = ServiceClient(settings.users_url, settings.internal_token)
    app.state.tutor_providers = build_providers(settings)
    app.state.tutor_limiter = FixedWindowLimiter()
    app.state.draft_limiter = FixedWindowLimiter()
    app.state.checkin_limiter = FixedWindowLimiter()

    app.add_middleware(ContextMiddleware, internal_token=settings.internal_token)
    install_exception_handlers(app, on_forbidden=forbidden_audit_hook(app.state.audit))
    app.include_router(router)
    app.include_router(doubts.router)
    app.include_router(files.router)
    app.include_router(practice.router)
    app.include_router(coursework.router)
    app.include_router(progress.router)
    app.include_router(schedule.router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True, "service": SERVICE_NAME}

    return app


app = create_app()
