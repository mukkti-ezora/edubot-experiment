"""Shared base settings.

Every service subclasses BaseServiceSettings with its own database URL alias.
Env vars are documented in .env.example; defaults here are development-only.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BaseServiceSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""

    jwt_secret: str = Field(
        default="dev-insecure-jwt-secret-change-me-0123456789", alias="EDUBOT_JWT_SECRET"
    )
    internal_token: str = Field(
        default="dev-insecure-internal-token-change-me", alias="EDUBOT_INTERNAL_TOKEN"
    )

    identity_url: str = Field(default="http://localhost:8001", alias="IDENTITY_URL")
    tenancy_url: str = Field(default="http://localhost:8002", alias="TENANCY_URL")
    users_url: str = Field(default="http://localhost:8003", alias="USERS_URL")
    rbac_url: str = Field(default="http://localhost:8004", alias="RBAC_URL")
    audit_url: str = Field(default="http://localhost:8005", alias="AUDIT_URL")
    learning_url: str = Field(default="http://localhost:8006", alias="LEARNING_URL")

    access_token_ttl_seconds: int = Field(default=900, alias="ACCESS_TOKEN_TTL_SECONDS")
    refresh_token_ttl_days: int = Field(default=30, alias="REFRESH_TOKEN_TTL_DAYS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
