"""Super Admin configurable photo and video upload limits.

The per-event photo and video caps used to be constants: `config.py` held them
and `frontend/src/utils/uploadRules.js` mirrored them, so raising "10 photos"
to "15 photos" meant editing two files and redeploying. They now live in one
document of the `app_settings` collection, which the Super Admin edits from the
console and which both the upload endpoints and the teacher's wizard read at
runtime.

Shape of the stored document::

    {
        "_id": "upload_limits",
        "max_photos_per_event": 10,     # count, always set
        "max_photo_size_mb": 20,        # per file, always set
        "max_photo_total_mb": None,     # combined, None = no combined cap
        "max_videos_per_event": None,   # count, None = no count cap
        "max_video_size_mb": 200,       # per file, always set
        "max_video_total_mb": 200,      # combined, always set
        "updated_at": datetime,
        "updated_by": "<user id>",
    }

Documents are deliberately not here: they keep the fixed budget in
`settings.max_documents_total_mb`.

Defaults come from `settings`, so a deployment that has never saved a row keeps
behaving exactly as it did before this module existed, and an operator can
still move the starting point with an environment variable.
"""

from __future__ import annotations

import logging

from pymongo.errors import PyMongoError

from app.config import settings
from app.database import app_settings
from app.utils.serializers import utc_now

logger = logging.getLogger(__name__)

UPLOAD_LIMITS_ID = "upload_limits"

MEGABYTE = 1024 * 1024

#: Every configurable field, and whether it may be left unset ("no limit").
#: The bounds are the same ones the request schema enforces and the console
#: shows next to each input, so there is one place to change them.
LIMIT_BOUNDS: dict[str, dict] = {
    "max_photos_per_event": {"min": 1, "max": 200, "nullable": False},
    "max_photo_size_mb": {"min": 1, "max": 1024, "nullable": False},
    "max_photo_total_mb": {"min": 1, "max": 51200, "nullable": True},
    "max_videos_per_event": {"min": 1, "max": 200, "nullable": True},
    "max_video_size_mb": {"min": 1, "max": 51200, "nullable": False},
    "max_video_total_mb": {"min": 1, "max": 51200, "nullable": False},
}

LIMIT_FIELDS: tuple[str, ...] = tuple(LIMIT_BOUNDS)


def default_upload_limits() -> dict:
    """The limits used when nothing has been saved yet.

    These are today's shipped values: 10 photos of 20 MB each with no combined
    photo budget, and 200 MB of video across any number of files.
    """
    return {
        "max_photos_per_event": settings.max_photos_per_event,
        "max_photo_size_mb": settings.max_photo_size_mb,
        "max_photo_total_mb": settings.max_photo_total_mb,
        "max_videos_per_event": settings.max_videos_per_event,
        "max_video_size_mb": settings.max_video_size_mb,
        "max_video_total_mb": settings.max_video_total_mb,
    }


def _coerce(field: str, value) -> int | None:
    """One stored value, or None when it is missing or unusable.

    A row written by an older version of this module, or hand-edited in the
    shell, must not be able to take the upload endpoints down -- an
    unrecognisable value falls back to the default for that field.
    """
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = int(value)
    bounds = LIMIT_BOUNDS[field]
    if number < bounds["min"] or number > bounds["max"]:
        return None
    return number


def _merge(stored: dict | None) -> dict:
    """Stored values over the defaults, field by field."""
    defaults = default_upload_limits()
    if not stored:
        return defaults

    merged = {}
    for field in LIMIT_FIELDS:
        if field not in stored:
            merged[field] = defaults[field]
            continue
        value = _coerce(field, stored[field])
        # A stored None is a deliberate "no limit" for a nullable field, but
        # never a valid value for a required one.
        if value is None and not LIMIT_BOUNDS[field]["nullable"]:
            value = defaults[field]
        merged[field] = value
    return merged


def get_upload_limits() -> dict:
    """The limits in force right now.

    Read on every upload and on every page load rather than cached: a Super
    Admin who raises a cap expects the next upload to honour it, and the query
    is a single `_id` lookup next to the several the upload already runs.

    A database that cannot be read degrades to the defaults instead of
    refusing the upload.
    """
    try:
        stored = app_settings.find_one({"_id": UPLOAD_LIMITS_ID})
    except PyMongoError as error:
        logger.error("upload_limits_read_failed error=%s", error)
        return default_upload_limits()
    return _merge(stored)


def get_upload_limits_record() -> dict:
    """The limits plus who last changed them, for the Super Admin console."""
    try:
        stored = app_settings.find_one({"_id": UPLOAD_LIMITS_ID})
    except PyMongoError as error:
        logger.error("upload_limits_read_failed error=%s", error)
        stored = None

    return {
        "limits": _merge(stored),
        "is_default": stored is None,
        "updated_at": (stored or {}).get("updated_at"),
        "updated_by": (stored or {}).get("updated_by"),
    }


def save_upload_limits(values: dict, *, updated_by: str | None = None) -> dict:
    """Write the limits, replacing whatever was there. Returns the new record.

    The payload is validated by `UploadLimitsRequest` before it reaches here,
    so this only has to persist it. `upsert` means the first save creates the
    single row and every later one replaces it -- there can never be two.
    """
    document = {field: values.get(field) for field in LIMIT_FIELDS}
    document["updated_at"] = utc_now()
    document["updated_by"] = updated_by

    app_settings.update_one(
        {"_id": UPLOAD_LIMITS_ID},
        {"$set": document},
        upsert=True,
    )
    return get_upload_limits_record()


# ----------------------------------------------------------------------
# Byte helpers
#
# The stored values are megabytes because that is what a Super Admin types;
# every enforcement site wants bytes.
# ----------------------------------------------------------------------

def to_bytes(megabytes: int | None) -> int | None:
    return None if megabytes is None else megabytes * MEGABYTE
