"""What the two event reports share about files: which photos they show, the
photo bytes, and the long-lived download links printed in the PDF.

Both the Dean's report (routers/reports.py, teacher events) and the Event
Manager's (routers/event_manager.py, managed events) are laid out by
app/services/managed_report_pdf.py and pick their photos the same way. Each
router passes its own collections and GridFS handle in, so the tests that
swap those out on the router module keep working.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time

from bson import ObjectId
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse, StreamingResponse
from pymongo import ASCENDING

from app.config import settings
from app.schemas.event_manager import MAX_REPORT_PHOTOS
from app.services import r2_service
from app.services.storage_service import content_disposition, serving_policy

logger = logging.getLogger(__name__)


# ============================================================
# WHICH PHOTOS
# ============================================================

def photo_ids(media_collection, event_key: str) -> list[str]:
    """The event's photos in upload order (by _id)."""
    return [
        str(row["_id"])
        for row in media_collection.find(
            {"event_id": event_key, "media_type": "image"}, {"_id": 1}
        ).sort("_id", ASCENDING)
    ]


def choose_photo_ids(chosen: list[str] | None, available: list[str]) -> list[str]:
    """The saved choice (still-existing photos only, in the chosen order), or
    the first MAX_REPORT_PHOTOS of ``available`` while nothing is chosen."""
    if chosen is None:
        return available[:MAX_REPORT_PHOTOS]
    existing = set(available)
    return [pid for pid in chosen if pid in existing][:MAX_REPORT_PHOTOS]


def report_photo_ids(event: dict, media_collection) -> list[str]:
    """The photos the report shows for this event."""
    available = photo_ids(media_collection, str(event.get("_id") or event.get("id")))
    return choose_photo_ids(event.get("report_photo_ids"), available)


def with_report_photos(item: dict, event: dict, media_collection=None, *, media: list | None = None) -> dict:
    """Add the report-photo fields the upload step and event page read.

    Pass ``media`` (serialized rows, already loaded for the response) to work
    from them instead of querying ``media_collection`` again.
    """
    if media is not None:
        available = sorted(row["id"] for row in media if row.get("media_type") == "image")
        item["report_photo_ids"] = choose_photo_ids(event.get("report_photo_ids"), available)
    else:
        item["report_photo_ids"] = report_photo_ids(event, media_collection)
    # False while the report still uses the default (the first photos
    # uploaded), so the upload step can keep its ticks in step with new photos.
    item["report_photos_chosen"] = event.get("report_photo_ids") is not None
    return item


def clean_report_choice(requested: list[str], event_key: str, media_collection) -> list[str]:
    """The requested ids, de-duplicated, in order; 400 for any that is not a
    photo of this event."""
    available = set(photo_ids(media_collection, event_key))
    chosen: list[str] = []
    for pid in requested:
        if pid not in available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Choose photos of this event only."
            )
        if pid not in chosen:
            chosen.append(pid)
    return chosen


# ============================================================
# PHOTO BYTES
# ============================================================

def read_file_bytes(row: dict, fs) -> bytes | None:
    """The stored bytes of one upload, from R2 or GridFS; None if unreadable."""
    try:
        if row.get("object_key"):
            obj = r2_service._client().get_object(Bucket=settings.r2_bucket_name, Key=row["object_key"])
            return obj["Body"].read()
        return fs.get(ObjectId(str(row["file_id"]))).read()
    except Exception as error:  # noqa: BLE001 - a missing photo must not sink the report
        logger.warning("report_photo_unreadable file=%s error=%s", row.get("_id") or row.get("id"), error)
        return None


# ============================================================
# DOWNLOAD LINKS PRINTED IN A REPORT
# ============================================================

def links_expiry() -> int:
    """One expiry for every link in a report, rounded up to a whole day."""
    seconds = settings.report_link_expiry_days * 86400
    return int((time.time() + seconds) // 86400 + 1) * 86400


def link_signature(scope: str, kind: str, file_id: str, exp: int) -> str:
    """HMAC over the scope too, so a link for one report's files can never
    open a file from the other's collections."""
    message = f"{scope}-{kind}:{file_id}:{int(exp)}".encode("utf-8")
    return hmac.new(settings.jwt_secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def valid_link(scope: str, kind: str, object_id, exp: int, sig: str) -> bool:
    return (
        kind in ("media", "documents")
        and object_id is not None
        and exp > time.time()
        and hmac.compare_digest(link_signature(scope, kind, str(object_id), exp), sig.lower())
    )


def download_response(row: dict | None, fs):
    """Hand one stored file to the browser as a download."""
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This file is no longer available.")

    name = row.get("original_name") or row.get("file_name") or "download"
    served_type, _ = serving_policy(row.get("content_type") or row.get("file_type"), download=True)

    if row.get("object_key"):
        url = r2_service._client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": row["object_key"],
                "ResponseContentType": served_type,
                "ResponseContentDisposition": content_disposition("attachment", name),
            },
            ExpiresIn=300,
        )
        return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    try:
        grid_out = fs.get(ObjectId(str(row["file_id"])))
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This file is no longer available.")

    def chunks():
        while True:
            block = grid_out.read(1024 * 1024)
            if not block:
                break
            yield block

    return StreamingResponse(
        chunks(),
        media_type=served_type,
        headers={
            "Content-Disposition": content_disposition("attachment", name),
            "Content-Length": str(grid_out.length),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
