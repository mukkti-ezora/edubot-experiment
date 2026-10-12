from functools import lru_cache

from pydantic import Field

from services.shared.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://edubot:edubot@localhost:5433/learning_db",
        alias="LEARNING_DATABASE_URL",
    )
    # Learning-trail records (lesson views, tutor chats) are rotated out after this many days.
    trail_retention_days: int = Field(default=60, alias="LEARNING_TRAIL_RETENTION_DAYS")
    trail_purge_interval_hours: int = Field(default=6, alias="LEARNING_TRAIL_PURGE_INTERVAL_HOURS")

    # AI tutor. Provider is chosen per institution; this is the default when none is set.
    tutor_default_provider: str = Field(default="anthropic", alias="TUTOR_DEFAULT_PROVIDER")
    anthropic_model: str = Field(default="claude-opus-5-5", alias="TUTOR_ANTHROPIC_MODEL")
    anthropic_effort: str = Field(default="medium", alias="TUTOR_ANTHROPIC_EFFORT")
    openai_model: str = Field(default="gpt-5.5", alias="TUTOR_OPENAI_MODEL")
    tutor_max_tokens: int = Field(default=4000, alias="TUTOR_MAX_TOKENS")
    tutor_history_turns: int = Field(default=12, alias="TUTOR_HISTORY_TURNS")
    tutor_messages_per_minute: int = Field(default=8, alias="TUTOR_MESSAGES_PER_MINUTE")
    tutor_messages_per_day: int = Field(default=200, alias="TUTOR_MESSAGES_PER_DAY")
    doubt_reply_hours: int = Field(default=48, alias="DOUBT_REPLY_HOURS")
    doubts_per_day: int = Field(default=10, alias="DOUBTS_PER_DAY")
    doubt_follow_ups_per_day: int = Field(default=30, alias="DOUBT_FOLLOW_UPS_PER_DAY")
    doubt_messages_max: int = Field(default=50, alias="DOUBT_MESSAGES_MAX")
    doubt_drafts_per_minute: int = Field(default=5, alias="DOUBT_DRAFTS_PER_MINUTE")
    doubt_draft_max_tokens: int = Field(default=800, alias="DOUBT_DRAFT_MAX_TOKENS")

    # Files (photos of working, submissions, certificates).
    attachment_max_bytes: int = Field(default=10 * 1024 * 1024, alias="ATTACHMENT_MAX_BYTES")
    attachments_per_day: int = Field(default=60, alias="ATTACHMENTS_PER_DAY")

    # Practice. AI generation shares the tutor's provider choice.
    ai_practice_per_day: int = Field(default=20, alias="AI_PRACTICE_PER_DAY")
    doubt_drafts_per_day: int = Field(default=100, alias="DOUBT_DRAFTS_PER_DAY")
    ai_practice_max_tokens: int = Field(default=3000, alias="AI_PRACTICE_MAX_TOKENS")

    # Coursework. Extensions within this many hours of the deadline, asked before it, are approved automatically.
    extension_auto_approve_hours: int = Field(default=48, alias="EXTENSION_AUTO_APPROVE_HOURS")

    # Attendance. Most Indian universities require 75%.
    attendance_threshold_percent: int = Field(default=75, ge=1, le=99, alias="ATTENDANCE_THRESHOLD_PERCENT")
    checkin_window_minutes: int = Field(default=10, alias="CHECKIN_WINDOW_MINUTES")
    # Calendar days ("today", leave dates) are the institution's local days. Per-institution later (OD-12).
    institution_timezone: str = Field(default="Asia/Kolkata", alias="INSTITUTION_TIMEZONE")


@lru_cache
def get_settings() -> Settings:
    return Settings()
