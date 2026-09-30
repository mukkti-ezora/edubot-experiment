from functools import lru_cache

from pydantic import Field

from services.shared.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://edubot:edubot@localhost:5433/rbac_db",
        alias="RBAC_DATABASE_URL",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
