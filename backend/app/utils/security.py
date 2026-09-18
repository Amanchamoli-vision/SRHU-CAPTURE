"""Password hashing, JWT issuance and one-time token helpers."""

import hashlib
import secrets
from datetime import timedelta

import bcrypt
import jwt

from app.config import settings
from app.utils.serializers import utc_now


# bcrypt only looks at the first 72 bytes of the password. New passwords longer
# than that are rejected by the request schemas (see ``password_byte_error``)
# rather than silently truncated.
BCRYPT_MAX_BYTES = 72
_BCRYPT_MAX_BYTES = BCRYPT_MAX_BYTES

PASSWORD_TOO_LONG_MESSAGE = (
    "Password is too long. Use at most 72 bytes -- about 72 English letters, "
    "fewer if it contains accented letters, Hindi or emoji."
)


def password_byte_error(password: str) -> str | None:
    """The validation message for a password bcrypt cannot fully use, else None."""
    if len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        return PASSWORD_TOO_LONG_MESSAGE
    return None


def hash_password(password: str) -> str:
    error = password_byte_error(password)
    if error:
        raise ValueError(error)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    # Truncating here matches hashes created before over-long passwords were
    # rejected, when bcrypt silently used only the first 72 bytes.
    raw = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    try:
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except ValueError:
        return False


# Computed once at import, with the same cost factor as real hashes, so the
# first unknown-email login is not slower than the rest.
_DUMMY_PASSWORD_HASH = bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt()).decode("utf-8")


def burn_password_check(password: str) -> None:
    """Spend the same bcrypt time as a real check when there is no account.

    Without it a login for an unknown email answered in a few milliseconds
    while a known one took a full bcrypt round, which revealed which addresses
    have accounts.
    """
    verify_password(password, _DUMMY_PASSWORD_HASH)


def create_access_token(
    user_id: str,
    role: str,
    *,
    token_version: int = 0,
    auth_time: int | None = None,
) -> tuple[str, int]:
    """Return ``(token, expires_in_seconds)`` for the given user.

    ``ver`` must equal the user's stored ``token_version`` for the token to be
    accepted, so bumping that counter ends every outstanding session.
    ``auth_time`` is when the password was last entered; refreshes carry it
    over unchanged so a session cannot be extended forever.
    """
    expires_in = settings.access_token_expire_minutes * 60
    now = utc_now()
    issued_at = int(now.timestamp())
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "ver": int(token_version or 0),
        "auth_time": int(auth_time) if auth_time is not None else issued_at,
        "iat": issued_at,
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
