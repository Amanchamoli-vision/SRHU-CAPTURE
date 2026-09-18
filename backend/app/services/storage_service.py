"""Uploaded files in GridFS, plus cascading deletes that keep MongoDB tidy."""

from __future__ import annotations

import logging
import re

from bson import ObjectId
from fastapi import HTTPException, Request, UploadFile, status
from gridfs.errors import NoFile

from app.config import settings
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
    for field in fields:
        if document.get(field):
            document[field] = absolute_url(request, document[field])
    return document


# ======================================================================
# Cascading deletes
# ======================================================================

def delete_event_cascade(event_id: str) -> None:
    """Remove an event with its media, documents, notifications and report."""
    for media in event_media.find({"event_id": event_id}, {"file_id": 1}):
        delete_file(media.get("file_id"))
    event_media.delete_many({"event_id": event_id})

    for document in event_documents.find({"event_id": event_id}, {"file_id": 1}):
        delete_file(document.get("file_id"))
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
