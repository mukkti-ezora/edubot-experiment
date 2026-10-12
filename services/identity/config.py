from functools import lru_cache

from pydantic import Field

from services.shared.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://edubot:edubot@localhost:5433/identity_db",
        alias="IDENTITY_DATABASE_URL",
    )
    login_rate_limit_attempts: int = Field(default=10, alias="LOGIN_RATE_LIMIT_ATTEMPTS")
    login_rate_limit_window_seconds: int = Field(
        default=900, alias="LOGIN_RATE_LIMIT_WINDOW_SECONDS"
    )
    # Sign-in session records are kept this long after they end or go idle, then rotated out.
    session_retention_days: int = Field(default=60, alias="SESSION_RETENTION_DAYS")
    session_purge_interval_hours: int = Field(default=6, alias="SESSION_PURGE_INTERVAL_HOURS")


@lru_cache
def get_settings() -> Settings:
    return Settings()
