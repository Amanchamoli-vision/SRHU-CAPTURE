"""Uploaded files (Cloudflare R2, or GridFS as a fallback), plus cascading
deletes that keep MongoDB tidy."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote

from bson import ObjectId
from bson.errors import InvalidId
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
from app.utils.file_signing import signed_file_path
from app.utils.serializers import to_object_id, utc_now


logger = logging.getLogger(__name__)


# ======================================================================
# Accepted file types
#
# Every accepted upload is keyed by its extension. The declared (client)
# content type must agree with the extension, the first bytes must look like
# that format where a cheap check exists, and the content type that is stored
# and later served is the canonical one for the extension -- never the
# client's. SVG, HTML and anything else that a browser could execute is not on
# the list, so it can never be uploaded.
# ======================================================================

# extension -> (media kind, canonical content type, accepted declared types)
MEDIA_TYPES: dict[str, tuple[str, str, frozenset[str]]] = {
    ".jpg": ("image", "image/jpeg", frozenset({"image/jpeg", "image/jpg", "image/pjpeg"})),
    ".jpeg": ("image", "image/jpeg", frozenset({"image/jpeg", "image/jpg", "image/pjpeg"})),
    ".png": ("image", "image/png", frozenset({"image/png"})),
    ".webp": ("image", "image/webp", frozenset({"image/webp"})),
    ".gif": ("image", "image/gif", frozenset({"image/gif"})),
    ".heic": ("image", "image/heic", frozenset({"image/heic", "image/heif"})),
    ".heif": ("image", "image/heif", frozenset({"image/heif", "image/heic"})),
    ".mp4": ("video", "video/mp4", frozenset({"video/mp4"})),
    ".webm": ("video", "video/webm", frozenset({"video/webm"})),
    ".mov": ("video", "video/quicktime", frozenset({"video/quicktime"})),
}

# extension -> (canonical content type, accepted declared types)
DOCUMENT_TYPES: dict[str, tuple[str, frozenset[str]]] = {
    ".pdf": ("application/pdf", frozenset({"application/pdf", "application/x-pdf"})),
    ".doc": ("application/msword", frozenset({"application/msword"})),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        frozenset({"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),
    ),
    ".xls": ("application/vnd.ms-excel", frozenset({"application/vnd.ms-excel"})),
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        frozenset({"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),
    ),
    ".ppt": ("application/vnd.ms-powerpoint", frozenset({"application/vnd.ms-powerpoint"})),
    ".pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        frozenset({"application/vnd.openxmlformats-officedocument.presentationml.presentation"}),
    ),
    ".txt": ("text/plain", frozenset({"text/plain"})),
    ".csv": (
        "text/csv",
        frozenset({
            "text/csv", "text/plain", "application/csv", "application/x-csv",
            "text/x-csv", "text/comma-separated-values", "application/vnd.ms-excel",
        }),
    ),
}

# The document step picks files by extension (see CreateEvent.jsx), and a
# browser that has no registered handler for, say, .docx reports an empty or
# generic type. Such a declaration does not contradict the extension, so it is
# accepted for documents; the stored type still comes from the extension and
# the magic-byte check below still applies.
GENERIC_DECLARED_TYPES = frozenset({"", "application/octet-stream", "binary/octet-stream"})

# Kept for callers that still import the old names.
DOCUMENT_CONTENT_TYPES = {canonical for canonical, _ in DOCUMENT_TYPES.values()}
DOCUMENT_EXTENSIONS = set(DOCUMENT_TYPES)

# What may ever be served, and what may be shown inline in the browser.
SERVABLE_CONTENT_TYPES = (
    {canonical for _, canonical, _ in MEDIA_TYPES.values()} | DOCUMENT_CONTENT_TYPES
)
INLINE_CONTENT_TYPES = (
    {canonical for _, canonical, _ in MEDIA_TYPES.values()} | {"application/pdf"}
)

_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_ZIP = (b"PK\x03\x04",)


def _is_iso_bmff(head: bytes) -> bool:
    # MP4, MOV, HEIC/HEIF: a box header whose type sits at bytes 4-8.
    return head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot")


_MAGIC_CHECKS = {
    ".jpg": lambda h: h.startswith(b"\xff\xd8\xff"),
    ".jpeg": lambda h: h.startswith(b"\xff\xd8\xff"),
    ".png": lambda h: h.startswith(b"\x89PNG\r\n\x1a\n"),
    ".gif": lambda h: h.startswith((b"GIF87a", b"GIF89a")),
    ".webp": lambda h: h.startswith(b"RIFF") and h[8:12] == b"WEBP",
    ".heic": lambda h: h[4:8] == b"ftyp",
    ".heif": lambda h: h[4:8] == b"ftyp",
    ".mp4": _is_iso_bmff,
    ".mov": _is_iso_bmff,
    ".webm": lambda h: h.startswith(b"\x1a\x45\xdf\xa3"),
    ".pdf": lambda h: b"%PDF-" in h[:1024],
    ".doc": lambda h: h.startswith(_OLE),
    ".xls": lambda h: h.startswith(_OLE),
    ".ppt": lambda h: h.startswith(_OLE),
    ".docx": lambda h: h.startswith(_ZIP),
    ".xlsx": lambda h: h.startswith(_ZIP),
    ".pptx": lambda h: h.startswith(_ZIP),
}

# Per-event caps, matching the create-event wizard (4 photos, 2 videos).
MAX_EVENT_PHOTOS = 4
MAX_EVENT_VIDEOS = 2
MAX_EVENT_DOCUMENTS = 20

_READ_CHUNK = 1024 * 1024


def _extension(name: str | None) -> str:
    name = (name or "").strip().lower()
    return name[name.rfind("."):] if "." in name else ""


def _declared_type(upload: UploadFile) -> str:
    return (upload.content_type or "").split(";")[0].strip().lower()


def safe_file_name(name: str | None) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", (name or "upload").strip())
    return cleaned[:180] or "upload"


def content_disposition(disposition: str, file_name: str | None, fallback: str = "download") -> str:
    """A ``Content-Disposition`` value that survives any file name.

    Header values must be latin-1, so ``filename=`` carries an ASCII-only
    fallback and the real name goes in ``filename*`` (RFC 5987/6266).
    """
    original = (file_name or "").strip() or fallback
    ascii_name = re.sub(r"[^A-Za-z0-9._-]", "_", original)
    ascii_name = re.sub(r"_+", "_", ascii_name).strip("_")[:180]
    stem = ascii_name.rsplit(".", 1)[0]
    if not re.search(r"[A-Za-z0-9]", stem):
        extension = _extension(original)
        if not re.fullmatch(r"\.[a-z0-9]{1,8}", extension):
            extension = ""
        ascii_name = fallback + extension
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(original, safe='')}"


def serving_policy(content_type: str | None, *, download: bool = False) -> tuple[str, str]:
    """(content type, disposition) to serve a stored file with.

    Anything not on the accepted list -- which covers files stored before the
    whitelist, with whatever type the client claimed -- is served as opaque
    bytes, and only images, videos and PDFs may open inline.
    """
    stored = (content_type or "").split(";")[0].strip().lower()
    served = stored if stored in SERVABLE_CONTENT_TYPES else "application/octet-stream"
    inline = not download and served in INLINE_CONTENT_TYPES
    return served, ("inline" if inline else "attachment")


# ======================================================================
# Validation
# ======================================================================

def inspect_media(upload: UploadFile) -> dict:
    """Validate a photo/video upload's name and declared type.

    Returns ``{"kind", "extension", "content_type"}`` where ``content_type`` is
    the canonical type for the extension.
    """
    extension = _extension(upload.filename)
    declared = _declared_type(upload)
    entry = MEDIA_TYPES.get(extension)
    if entry is None or declared not in entry[2]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported media file. Allowed: JPEG, PNG, WebP, GIF and HEIC photos, "
                "and MP4, WebM and MOV videos"
            ),
        )
    kind, canonical, _ = entry
    return {"kind": kind, "extension": extension, "content_type": canonical}


def inspect_document(upload: UploadFile) -> dict:
    """Validate a supporting document's name and declared type."""
    extension = _extension(upload.filename)
    declared = _declared_type(upload)
    entry = DOCUMENT_TYPES.get(extension)
    if entry is None or (declared not in entry[1] and declared not in GENERIC_DECLARED_TYPES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported document type. Allowed: PDF, Word, PowerPoint, Excel, "
                "text and CSV files"
            ),
        )
    return {"extension": extension, "content_type": entry[0]}


def check_file_signature(extension: str, data: bytes) -> None:
    """Reject a file whose first bytes do not match its extension."""
    check = _MAGIC_CHECKS.get(extension)
    if check is not None and not check(data[:1024]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The file's contents do not match its type",
        )


def media_type_for(upload: UploadFile) -> str:
    """Backwards-compatible wrapper: ``"image"`` or ``"video"``."""
    return inspect_media(upload)["kind"]


def validate_document(upload: UploadFile) -> None:
    """Backwards-compatible wrapper around :func:`inspect_document`."""
    inspect_document(upload)


def _too_large() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"Files must be smaller than {settings.max_upload_size_mb} MB",
    )


def read_upload(upload: UploadFile, max_bytes: int | None = None) -> bytes:
    """Read an upload in chunks, aborting as soon as it passes the size limit.

    Never holds more than ``max_bytes`` (+ one chunk) in memory, however large
    the request body is.
    """
    limit = settings.max_upload_size_bytes if max_bytes is None else max_bytes

    declared_size = getattr(upload, "size", None)
    if isinstance(declared_size, int) and declared_size > limit:
        raise _too_large()

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = upload.file.read(_READ_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise _too_large()
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty",
        )
    return b"".join(chunks)


# ======================================================================
# Storage
# ======================================================================

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
    """The relative, unsigned path stored on a record. It is never handed to
    a client as-is: :func:`absolutize` signs it on every read."""
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
    bytes go to GridFS and the record gets a ``file_id`` and ``/files`` path.
    """
    if settings.r2_configured:
        object_key = r2_service.build_object_key(
            event_id=event_id,
            kind=kind,
            file_name=safe_file_name(file_name),
        )
        _, disposition = serving_policy(content_type)
        try:
            r2_service.upload_bytes(
                data,
                object_key=object_key,
                content_type=content_type,
                metadata={"event_id": event_id, "teacher_id": teacher_id},
                content_disposition=content_disposition(disposition, file_name),
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


def _record_orphan(record: dict) -> None:
    """Remember an object whose delete failed so it can be swept later."""
    try:
        from app import database

        database.db["storage_orphans"].insert_one({
            "object_key": record.get("object_key"),
            "file_id": record.get("file_id"),
            "created_at": utc_now(),
        })
    except Exception:
        logger.exception("Could not record orphaned object %s", record.get("object_key"))


def delete_stored(record: dict | None) -> None:
    """Delete the bytes behind a media or document record, wherever they live.

    Never raises: a leftover object only costs storage. Failed R2 deletes are
    written to the ``storage_orphans`` collection for a later sweep.
    """
    if not record:
        return
    try:
        if record.get("object_key"):
            if not r2_service.delete_object(record["object_key"]):
                _record_orphan(record)
        else:
            delete_file(record.get("file_id"))
    except Exception:
        logger.exception("Could not delete stored file for record %s", record.get("_id"))
        _record_orphan(record)


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


_FILES_PATH = re.compile(r"^/files/([0-9a-fA-F]{24})(?:[?#].*)?$")


def _signed_gridfs_path(document: dict, value: str | None) -> str | None:
    """A freshly signed ``/files/{id}?exp=..&sig=..`` path for a GridFS record."""
    file_id = document.get("file_id")
    if not file_id and value:
        match = _FILES_PATH.match(value)
        file_id = match.group(1) if match else None
    if not file_id:
        return value
    return signed_file_path(file_id) or value


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
        value = document.get(field)
        if not value:
            continue
        if not value.startswith(("http://", "https://")) or document.get("file_id"):
            value = _signed_gridfs_path(document, value)
        document[field] = absolute_url(request, value)
    return document


# ======================================================================
# Cascading deletes
# ======================================================================

def delete_event_cascade(event_id: str) -> None:
    """Remove an event with its media, documents, notifications and report."""
    # Delete the event first, so an upload racing this delete sees the event
    # gone on its post-insert check and removes its own file.
    object_id = to_object_id(event_id)
    if object_id is not None:
        events.delete_one({"_id": object_id})

    for media in event_media.find({"event_id": event_id}, {"file_id": 1, "object_key": 1}):
        delete_stored(media)
    event_media.delete_many({"event_id": event_id})

    for document in event_documents.find({"event_id": event_id}, {"file_id": 1, "object_key": 1}):
        delete_stored(document)
    event_documents.delete_many({"event_id": event_id})

    notifications.delete_many({"event_id": event_id})
    event_reports.delete_many({"event_id": event_id})


def delete_user_cascade(user_id: str) -> None:
    """Remove a user together with everything they own."""
    # Events and notifications store the id in its canonical lower-case
    # string form; normalise so an upper-case id cannot miss them.
    try:
        user_id = str(ObjectId(str(user_id)))
    except (InvalidId, TypeError):
        pass

    for event in events.find({"teacher_id": user_id}, {"_id": 1}):
        delete_event_cascade(str(event["_id"]))

    notifications.delete_many({"user_id": user_id})

    object_id = to_object_id(user_id)
    if object_id is not None:
        users.delete_one({"_id": object_id})
