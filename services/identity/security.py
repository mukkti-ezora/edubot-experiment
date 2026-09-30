import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

_hasher = PasswordHasher()  # argon2id defaults


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def refresh_digest(token: str) -> str:
    """Deterministic digest for lookup. High-entropy tokens don't need a slow hash."""
    return hashlib.sha256(token.encode()).hexdigest()
