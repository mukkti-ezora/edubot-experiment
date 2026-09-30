from functools import lru_cache

from pydantic import Field

from services.shared.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    database_url: str = ""  # gateway is stateless; no database

    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    access_cookie: str = "edubot_access"
    refresh_cookie: str = "edubot_refresh"
    csrf_header: str = "X-Requested-With"


@lru_cache
def get_settings() -> Settings:
    return Settings()
