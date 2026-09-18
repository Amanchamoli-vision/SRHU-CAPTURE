"""Short-lived signed links for files served out of GridFS (``/files/{id}``).

``GET /files/{id}`` cannot rely on the ``Authorization`` header: the links are
used directly as ``<img src>``, ``<video src>`` and download hrefs, which
browsers fetch without it. Instead every URL the API hands out carries an
expiry and an HMAC over ``"{file_id}:{exp}"``, the same model as R2's
pre-signed URLs. Only someone who was shown the file by an authorised API call
holds a working link, and only until it expires.

Expiries are rounded up to the next whole hour, so repeated list calls within
the hour return identical URLs and the browser cache keeps working.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import time

from bson import ObjectId
from bson.errors import InvalidId

from app.config import settings


DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60
_ROUND_TO = 60 * 60


def expiry_seconds() -> int:
    value = getattr(settings, "r2_signed_url_expiry", DEFAULT_EXPIRY_SECONDS)
    try:
        value = int(value)
    except (TypeError, ValueError):
        value = DEFAULT_EXPIRY_SECONDS
    return value if value > 0 else DEFAULT_EXPIRY_SECONDS


def normalize_file_id(file_id) -> str | None:
    try:
        return str(ObjectId(str(file_id)))
    except (InvalidId, TypeError):
        return None


def sign(file_id: str, exp: int) -> str:
    message = f"{file_id}:{int(exp)}".encode("utf-8")
    return hmac.new(settings.jwt_secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def new_expiry(now: float | None = None) -> int:
    now = time.time() if now is None else now
    return int(math.ceil((now + expiry_seconds()) / _ROUND_TO) * _ROUND_TO)


def signed_file_path(file_id, now: float | None = None) -> str | None:
    """``/files/{id}?exp=<unix>&sig=<hex>`` for a GridFS file id."""
    normalized = normalize_file_id(file_id)
    if normalized is None:
        return None
    exp = new_expiry(now)
    return f"/files/{normalized}?exp={exp}&sig={sign(normalized, exp)}"


def verify(file_id, exp, sig, now: float | None = None) -> bool:
    """True when ``sig`` is a valid, unexpired signature for ``file_id``."""
    normalized = normalize_file_id(file_id)
    if normalized is None or exp is None or not sig:
        return False
    try:
        exp_value = int(exp)
    except (TypeError, ValueError):
        return False
    now = time.time() if now is None else now
    if exp_value <= now:
        return False
    return hmac.compare_digest(sign(normalized, exp_value), str(sig).lower())


def remaining_seconds(exp, now: float | None = None) -> int:
    now = time.time() if now is None else now
    try:
        return max(0, int(int(exp) - now))
    except (TypeError, ValueError):
        return 0
