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


@lru_cache
def get_settings() -> Settings:
    return Settings()
