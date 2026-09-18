"""Password hashing, JWT issuance and one-time token helpers."""

import hashlib
import secrets
from datetime import timedelta

import bcrypt
import jwt

from app.config import settings
from app.utils.serializers import utc_now


# bcrypt only looks at the first 72 bytes of the password.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    raw = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    try:
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, role: str) -> tuple[str, int]:
    """Return ``(token, expires_in_seconds)`` for the given user."""
    expires_in = settings.access_token_expire_minutes * 60
    now = utc_now()
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> dict:
    """Decode and validate a token. Raises ``jwt.PyJWTError`` when invalid."""
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp"]},
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Unexpected token type")
    return payload


def generate_one_time_token() -> str:
    """A URL-safe secret for email verification and password reset links."""
    return secrets.token_urlsafe(32)


def hash_one_time_token(token: str) -> str:
    """Only the hash is stored, so a database leak does not expose live links."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_temporary_password(length: int = 12) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))
