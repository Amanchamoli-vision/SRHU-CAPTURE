"""Serve uploaded files straight out of MongoDB GridFS.

Byte ranges are honoured (``206 Partial Content``). A ``<video>`` element
needs them to seek, and Safari -- including every browser on an iPhone --
will not play a video at all from a server that ignores ``Range``.
"""

import re

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from gridfs.errors import NoFile

from app.database import fs
from app.services.storage_service import content_disposition, serving_policy
from app.utils import file_signing
from app.utils.serializers import to_object_id


router = APIRouter(prefix="/files", tags=["Files"])

CHUNK_SIZE = 256 * 1024

_RANGE = re.compile(r"^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$", re.IGNORECASE)


def _iter_file(grid_out, remaining: int | None = None):
    """Yield the file from its current position; stop after ``remaining``
    bytes when given (the end of a requested range)."""
    try:
        while remaining is None or remaining > 0:
            size = CHUNK_SIZE if remaining is None else min(CHUNK_SIZE, remaining)
            chunk = grid_out.read(size)
            if not chunk:
                break
            if remaining is not None:
                remaining -= len(chunk)
            yield chunk
    finally:
        grid_out.close()


def parse_range(header: str | None, length: int) -> tuple[int, int] | None:
    """The inclusive ``(start, end)`` a single-range ``Range`` header asks for.

    Returns None when there is no usable header -- absent, malformed or
    multi-range -- in which case the whole file is sent, as RFC 9110 allows.
    Raises 416 for a well-formed range that lies entirely past the end.
    """
    if not header or "," in header:
        return None
    match = _RANGE.match(header)
    if not match:
        return None

    first, last = match.groups()
    if first == "" and last == "":
        return None

    if first == "":
        # Suffix form "bytes=-N": the final N bytes.
        suffix = int(last)
        if suffix == 0:
            raise HTTPException(
                status_code=416,  # Range Not Satisfiable
                headers={"Content-Range": f"bytes */{length}"},
            )
        return max(0, length - suffix), length - 1

    start = int(first)
    end = int(last) if last else length - 1
    if start >= length or end < start:
        raise HTTPException(
            status_code=416,  # Range Not Satisfiable
            headers={"Content-Range": f"bytes */{length}"},
        )
    return start, min(end, length - 1)


LINK_INVALID = "This file link has expired or is invalid."

# Upper bound on how long a browser may reuse a response, whatever the link's
# remaining lifetime.
MAX_CACHE_SECONDS = 3600


@router.get("/{file_id}")
def get_file(
    file_id: str,
    download: bool = False,
    exp: str | None = None,
    sig: str | None = None,
    range_header: str | None = Header(default=None, alias="Range"),
):
    """Serve a GridFS file to the holder of a valid signed link.

    Links come only from API responses the caller was authorised to see (see
    ``storage_service.absolutize``) and expire; ``download`` is not signed, so
    one link serves both viewing and saving.
    """
    object_id = to_object_id(file_id)
    if object_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if not file_signing.verify(object_id, exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=LINK_INVALID)

    try:
        grid_out = fs.get(object_id)
    except NoFile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    original_name = grid_out.filename or file_id
    length = grid_out.length
    media_type, disposition = serving_policy(grid_out.content_type, download=download)
    max_age = min(file_signing.remaining_seconds(exp), MAX_CACHE_SECONDS)

    headers = {
        "Content-Disposition": content_disposition(disposition, original_name, fallback=file_id),
        "Accept-Ranges": "bytes",
        "Cache-Control": f"private, max-age={max_age}",
        "X-Content-Type-Options": "nosniff",
    }

    try:
        requested = parse_range(range_header, length)
    except HTTPException:
        grid_out.close()
        raise

    if requested is None:
        headers["Content-Length"] = str(length)
        return StreamingResponse(_iter_file(grid_out), media_type=media_type, headers=headers)

    start, end = requested
    size = end - start + 1
    headers["Content-Range"] = f"bytes {start}-{end}/{length}"
    headers["Content-Length"] = str(size)

    grid_out.seek(start)
    return StreamingResponse(
        _iter_file(grid_out, remaining=size),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type=media_type,
        headers=headers,
    )
