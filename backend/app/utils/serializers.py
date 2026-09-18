"""Helpers that turn MongoDB documents into JSON-friendly dictionaries."""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: Any) -> ObjectId | None:
    """Convert a path/query value into an ObjectId, or None when it is not one."""
    if isinstance(value, ObjectId):
        return value
    if not isinstance(value, str):
        return None
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def _serialize_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize_value(item) for item in value]
    return value


def serialize(document: dict | None, *, exclude: tuple[str, ...] = ()) -> dict | None:
    """Return a copy of ``document`` with ``_id`` exposed as ``id``.

    ObjectIds become strings and datetimes become ISO-8601 strings so the
    result can be returned straight from a FastAPI route.
    """
    if document is None:
        return None

    result: dict[str, Any] = {}
    for key, value in document.items():
        if key in exclude:
            continue
        if key == "_id":
            result["id"] = str(value)
            continue
        result[key] = _serialize_value(value)
    return result


def serialize_many(documents, *, exclude: tuple[str, ...] = ()) -> list[dict]:
    return [serialize(document, exclude=exclude) for document in documents]
