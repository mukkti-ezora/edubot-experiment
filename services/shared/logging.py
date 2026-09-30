"""Structured JSON logging for services. One line per event, request_id carried where available."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime


class _PlainJsonFormatter(logging.Formatter):
    """Minimal JSON formatter (no external dependency)."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_RESERVED = {
    "name", "msg", "args", "created", "msecs", "relativeCreated", "levelname",
    "levelno", "pathname", "filename", "module", "exc_info", "exc_text",
    "stack_info", "lineno", "funcName", "process", "processName", "thread",
    "threadName", "taskName", "message",
}


def setup_logging(service: str, level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    formatter = _PlainJsonFormatter()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    class _ServiceFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            record.service = service
            return True

    handler.addFilter(_ServiceFilter())
