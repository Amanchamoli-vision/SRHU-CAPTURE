"""Cloudflare R2 object storage (S3-compatible) for event uploads.

Objects are private. Clients get a pre-signed GET URL, which R2 serves with
full HTTP Range support, so browsers can stream and seek videos directly
from R2 without the bytes passing through this API.
"""

from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings


logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


def build_object_key(*, event_id: str, kind: str, file_name: str) -> str:
    """``events/<event>/<media|documents>/<random>-<name>``; the prefix keeps
    one event's files together and the random part avoids collisions."""
    return f"events/{event_id}/{kind}/{uuid.uuid4().hex}-{file_name}"


def upload_bytes(
    data: bytes,
    *,
    object_key: str,
    content_type: str | None,
    metadata: dict[str, str] | None = None,
) -> None:
    _client().put_object(
        Bucket=settings.r2_bucket_name,
        Key=object_key,
        Body=data,
        ContentType=content_type or "application/octet-stream",
        Metadata={k: str(v) for k, v in (metadata or {}).items()},
    )


def delete_object(object_key: str) -> None:
    try:
        _client().delete_object(Bucket=settings.r2_bucket_name, Key=object_key)
    except (BotoCoreError, ClientError):
        # A leftover object only costs storage; never fail the request for it.
        logger.exception("Could not delete R2 object %s", object_key)


def object_url(
    object_key: str,
    *,
    file_name: str | None = None,
    content_type: str | None = None,
) -> str:
    """A browser-usable URL for the object: public if a public base URL is
    configured, otherwise pre-signed for ``R2_SIGNED_URL_EXPIRY`` seconds."""
    if settings.r2_public_url:
        return f"{settings.r2_public_url.rstrip('/')}/{quote(object_key)}"

    params = {"Bucket": settings.r2_bucket_name, "Key": object_key}
    if file_name:
        params["ResponseContentDisposition"] = (
            f"inline; filename*=UTF-8''{quote(file_name)}"
        )
    if content_type:
        params["ResponseContentType"] = content_type

    return _client().generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=settings.r2_signed_url_expiry,
    )
