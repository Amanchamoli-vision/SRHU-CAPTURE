"""Requests for direct browser-to-R2 uploads (app.services.direct_upload)."""

from typing import Literal

from pydantic import BaseModel, Field


class DirectUploadStartRequest(BaseModel):
    """What the browser is about to upload. Validated like a proxied upload
    before any URL is issued; R2 then refuses bytes that differ in size, and
    completion re-checks the size, type and contents of what arrived."""

    kind: Literal["media", "documents"]
    file_name: str = Field(min_length=1, max_length=255)
    # The browser's File.type; may be empty for documents (see
    # GENERIC_DECLARED_TYPES in storage_service).
    content_type: str = Field(default="", max_length=255)
    # 0 is let through so the empty-file message matches the proxied upload.
    size: int = Field(ge=0, le=5 * 1024 ** 4)


class DirectUploadSignRequest(BaseModel):
    """Which parts need a fresh URL (default: the first batch)."""

    part_numbers: list[int] = Field(default_factory=list, max_length=100)
