"""Serve uploaded files straight out of MongoDB GridFS."""

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from gridfs.errors import NoFile

from app.database import fs
from app.services.storage_service import safe_file_name
from app.utils.serializers import to_object_id


router = APIRouter(prefix="/files", tags=["Files"])

CHUNK_SIZE = 256 * 1024


def _iter_file(grid_out):
    try:
        while True:
            chunk = grid_out.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk
    finally:
        grid_out.close()


@router.get("/{file_id}")
def get_file(file_id: str, download: bool = False):
    object_id = to_object_id(file_id)
    if object_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    try:
        grid_out = fs.get(object_id)
    except NoFile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    original_name = grid_out.filename or file_id
    ascii_name = safe_file_name(original_name)
    disposition = "attachment" if download else "inline"

    headers = {
        "Content-Disposition": (
            f'{disposition}; filename="{ascii_name}"; '
            f"filename*=UTF-8''{quote(original_name)}"
        ),
        "Content-Length": str(grid_out.length),
        "Cache-Control": "public, max-age=3600",
    }

    return StreamingResponse(
        _iter_file(grid_out),
        media_type=grid_out.content_type or "application/octet-stream",
        headers=headers,
    )
