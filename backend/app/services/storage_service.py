"""Uploaded files (Cloudflare R2, or GridFS as a fallback), plus cascading
deletes that keep MongoDB tidy."""

from __future__ import annotations

import logging
import re

from bson import ObjectId
from fastapi import HTTPException, Request, UploadFile, status
from gridfs.errors import NoFile

from app.config import settings
from app.services import r2_service
from app.database import (
    event_documents,
    event_media,
    event_reports,
    events,
    fs,
    notifications,
    users,
)
from app.utils.serializers import to_object_id


logger = logging.getLogger(__name__)


DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
}

DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".csv",
}


def safe_file_name(name: str | None) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", (name or "upload").strip())
    return cleaned[:180] or "upload"


def read_upload(upload: UploadFile) -> bytes:
    """Read an upload fully, enforcing the configured size limit."""
    data = upload.file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty",
        )
    if len(data) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Files must be smaller than {settings.max_upload_size_mb} MB",
        )
    return data


def media_type_for(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").lower()
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only image and video files can be uploaded as media",
    )


def validate_document(upload: UploadFile) -> None:
    content_type = (upload.content_type or "").lower()
    name = (upload.filename or "").lower()
    extension = name[name.rfind("."):] if "." in name else ""
    if content_type in DOCUMENT_CONTENT_TYPES or extension in DOCUMENT_EXTENSIONS:
        return
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported document type. Allowed: PDF, Word, PowerPoint, Excel, text and CSV files",
    )


def store_file(data: bytes, *, filename: str, content_type: str | None, **metadata) -> ObjectId:
    return fs.put(
        data,
        filename=filename,
        content_type=content_type or "application/octet-stream",
        **metadata,
    )


def delete_file(file_id: str | ObjectId | None) -> None:
    object_id = to_object_id(file_id)
    if object_id is None:
        return
    try:
        fs.delete(object_id)
    except NoFile:
        pass


def file_route(file_id: str | ObjectId) -> str:
    """The relative URL under which a stored file is served."""
    return f"/files/{file_id}"


def save_upload(
    data: bytes,
    *,
    file_name: str,
    content_type: str | None,
    kind: str,
    event_id: str,
    teacher_id: str,
) -> dict:
    """Store an upload and return the storage fields for its metadata record.

    With R2 configured the record gets ``storage="r2"`` and an ``object_key``
    (its URL is signed on every read, see :func:`absolutize`); otherwise the
    bytes go to GridFS and the record gets a ``file_id`` and ``/files`` URL.
    """
    if settings.r2_configured:
        object_key = r2_service.build_object_key(
            event_id=event_id,
            kind=kind,
            file_name=safe_file_name(file_name),
        )
        try:
            r2_service.upload_bytes(
                data,
                object_key=object_key,
                content_type=content_type,
                metadata={"event_id": event_id, "teacher_id": teacher_id},
            )
        except Exception:
            logger.exception("R2 upload failed for %s", object_key)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not upload the file to storage. Please try again.",
            )
        return {"storage": "r2", "object_key": object_key, "file_id": None, "url": None}

    file_id = store_file(
        data,
        filename=file_name,
        content_type=content_type,
        kind=kind,
        event_id=event_id,
        teacher_id=teacher_id,
    )
    return {
        "storage": "gridfs",
        "object_key": None,
        "file_id": str(file_id),
        "url": file_route(file_id),
    }


def delete_stored(record: dict | None) -> None:
    """Delete the bytes behind a media or document record, wherever they live."""
    if not record:
        return
    if record.get("object_key"):
        r2_service.delete_object(record["object_key"])
    else:
        delete_file(record.get("file_id"))


def absolute_url(request: Request, path: str | None) -> str | None:
    """Turn a relative ``/files/...`` path into a URL for the calling client.

    Stored paths are relative so the same record works whether the API is
    reached through localhost, a LAN address or a public hostname.
    """
    if not path:
        return path
    if path.startswith(("http://", "https://")):
        return path
    return f"{str(request.base_url).rstrip('/')}{path}"


def absolutize(request: Request, document: dict | None, *fields: str) -> dict | None:
    if document is None:
        return None
    if document.get("object_key"):
        # R2 objects are private; sign a fresh URL on every read.
        url = r2_service.object_url(
            document["object_key"],
            file_name=document.get("file_name"),
            content_type=document.get("content_type") or document.get("file_type"),
        )
        for field in fields:
            document[field] = url
        return document
    for field in fields:
        if document.get(field):
            document[field] = absolute_url(request, document[field])
    return document


# ======================================================================
# Cascading deletes
# ======================================================================

def delete_event_cascade(event_id: str) -> None:
    """Remove an event with its media, documents, notifications and report."""
    for media in event_media.find({"event_id": event_id}, {"file_id": 1, "object_key": 1}):
        delete_stored(media)
    event_media.delete_many({"event_id": event_id})

    for document in event_documents.find({"event_id": event_id}, {"file_id": 1, "object_key": 1}):
        delete_stored(document)
    event_documents.delete_many({"event_id": event_id})

    notifications.delete_many({"event_id": event_id})
    event_reports.delete_many({"event_id": event_id})

    object_id = to_object_id(event_id)
    if object_id is not None:
        events.delete_one({"_id": object_id})


def delete_user_cascade(user_id: str) -> None:
    """Remove a user together with everything they own."""
    for event in events.find({"teacher_id": user_id}, {"_id": 1}):
        delete_event_cascade(str(event["_id"]))

    notifications.delete_many({"user_id": user_id})

    object_id = to_object_id(user_id)
    if object_id is not None:
        users.delete_one({"_id": object_id})
