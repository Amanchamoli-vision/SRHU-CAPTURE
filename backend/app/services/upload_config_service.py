"""Service for managing dynamic photo and video upload limits configured by Super Admin."""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.database import upload_config
from app.utils.serializers import utc_now

logger = logging.getLogger(__name__)

CONFIG_KEY = "upload_limits"

# Defaults match the original hardcoded settings in config.py
DEFAULT_UPLOAD_LIMITS: dict[str, Any] = {
    "max_photos_per_event": settings.max_photos_per_event,
    "max_photo_size_mb": settings.max_photo_size_mb,
    "max_photo_total_mb": None,
    "max_videos_per_event": None,
    "max_video_size_mb": 200,
    "max_video_total_mb": settings.max_video_total_mb,
}


def get_upload_limits() -> dict[str, Any]:
    """Retrieve the current upload limits from the database, falling back to defaults."""
    doc = None
    try:
        doc = upload_config.find_one({"key": CONFIG_KEY})
    except Exception as exc:
        logger.warning("Failed to fetch upload limits from database: %s", exc)

    limits: dict[str, Any] = dict(DEFAULT_UPLOAD_LIMITS)

    if doc:
        for field in DEFAULT_UPLOAD_LIMITS:
            if field in doc and doc[field] is not None:
                limits[field] = doc[field]
        if "max_photo_total_mb" in doc:
            limits["max_photo_total_mb"] = doc["max_photo_total_mb"]
        if "max_videos_per_event" in doc:
            limits["max_videos_per_event"] = doc["max_videos_per_event"]

    # Compute byte equivalents for backend size enforcement
    limits["max_photo_size_bytes"] = limits["max_photo_size_mb"] * 1024 * 1024
    limits["max_photo_total_bytes"] = (
        limits["max_photo_total_mb"] * 1024 * 1024
        if limits.get("max_photo_total_mb") is not None
        else None
    )
    limits["max_video_size_bytes"] = (
        limits["max_video_size_mb"] * 1024 * 1024
        if limits.get("max_video_size_mb") is not None
        else None
    )
    limits["max_video_total_bytes"] = limits["max_video_total_mb"] * 1024 * 1024

    return limits


def get_public_upload_limits() -> dict[str, Any]:
    """Return upload limits formatted for frontend consumption (count and MB)."""
    limits = get_upload_limits()
    return {
        "max_photos_per_event": limits["max_photos_per_event"],
        "max_photo_size_mb": limits["max_photo_size_mb"],
        "max_photo_total_mb": limits["max_photo_total_mb"],
        "max_videos_per_event": limits["max_videos_per_event"],
        "max_video_size_mb": limits["max_video_size_mb"],
        "max_video_total_mb": limits["max_video_total_mb"],
    }


def update_upload_limits(data: dict[str, Any], user_id: str) -> dict[str, Any]:
    """Persist new upload limits to the database."""
    now = utc_now()
    doc_to_save = {
        "key": CONFIG_KEY,
        "max_photos_per_event": data["max_photos_per_event"],
        "max_photo_size_mb": data["max_photo_size_mb"],
        "max_photo_total_mb": data.get("max_photo_total_mb"),
        "max_videos_per_event": data.get("max_videos_per_event"),
        "max_video_size_mb": data["max_video_size_mb"],
        "max_video_total_mb": data["max_video_total_mb"],
        "updated_at": now,
        "updated_by": str(user_id),
    }

    upload_config.update_one(
        {"key": CONFIG_KEY},
        {"$set": doc_to_save},
        upsert=True,
    )

    return get_public_upload_limits()


def reset_upload_limits(user_id: str) -> dict[str, Any]:
    """Reset upload limits to system defaults."""
    now = utc_now()
    doc_to_save = {
        "key": CONFIG_KEY,
        **DEFAULT_UPLOAD_LIMITS,
        "updated_at": now,
        "updated_by": str(user_id),
    }

    upload_config.update_one(
        {"key": CONFIG_KEY},
        {"$set": doc_to_save},
        upsert=True,
    )

    return get_public_upload_limits()
