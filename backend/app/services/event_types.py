"""The `event_types` collection: the one source of truth for event categories.

Before this, the list lived in three places that had already drifted -- a
backend tuple with eight entries, `frontend/src/utils/constants.js` with six,
and a third copy in the create-event wizard. A teacher could pick a category
the Dean's filter could not select. Categories now live in MongoDB, are served
to both roles by one endpoint, and teachers may add their own (PRD 4 / 14).

Lookups are by `key` (the case-folded name), which carries a unique index, so
"Hackathon" and "hackathon" resolve to a single row rather than two.
"""

from __future__ import annotations

import logging

from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.database import event_types
from app.models.documents import DEFAULT_EVENT_TYPES, new_event_type_document

logger = logging.getLogger(__name__)

# A category name is a label, not prose.
MAX_EVENT_TYPE_LENGTH = 60


def clean_event_type_name(value: str | None) -> str:
    """Validate the shape of a category name. Raises ValueError."""
    name = " ".join((value or "").split())
    if not name:
        raise ValueError("Event type must not be empty")
    if len(name) > MAX_EVENT_TYPE_LENGTH:
        raise ValueError(
            f"Event type must be at most {MAX_EVENT_TYPE_LENGTH} characters"
        )
    if any(ord(char) < 32 for char in name):
        raise ValueError("Event type contains invalid characters")
    return name


def list_event_type_names() -> list[str]:
    """Every category, defaults first then alphabetical.

    Falls back to the built-in tuple if the collection cannot be read, so a
    database hiccup degrades the dropdown rather than emptying it.
    """
    try:
        rows = list(event_types.find({}, {"name": 1, "is_default": 1}))
    except PyMongoError as error:
        logger.error("event_types_list_failed error=%s", error)
        return list(DEFAULT_EVENT_TYPES)

    if not rows:
        return list(DEFAULT_EVENT_TYPES)

    rows.sort(key=lambda row: (not row.get("is_default"), str(row.get("name") or "").casefold()))
    return [str(row["name"]) for row in rows if row.get("name")]


def find_event_type(name: str) -> dict | None:
    """The stored row for this name, matched case-insensitively."""
    try:
        return event_types.find_one({"key": name.casefold()})
    except PyMongoError as error:
        logger.error("event_types_find_failed error=%s", error)
        return None


def resolve_event_type(value: str | None, *, created_by: str | None = None,
                       create: bool = True) -> str:
    """Return the canonical stored spelling for `value`, adding it if new.

    With `create=False` an unknown name is returned cleaned but not stored --
    used by the Dean's filter, which must not create a category as a
    side-effect of someone typing in a search box.
    """
    name = clean_event_type_name(value)

    existing = find_event_type(name)
    if existing and existing.get("name"):
        return str(existing["name"])

    if not create:
        return name

    document = new_event_type_document(name=name, created_by=created_by)
    try:
        event_types.insert_one(document)
    except DuplicateKeyError:
        # Someone inserted the same name between the find and the insert.
        winner = find_event_type(name)
        if winner and winner.get("name"):
            return str(winner["name"])
    except PyMongoError as error:
        # A category that cannot be persisted must not fail the event creation
        # that triggered it -- the event keeps the name either way.
        logger.error("event_types_insert_failed name=%s error=%s", name, error)

    return name


def seed_default_event_types() -> None:
    """Ensure the built-in categories exist. Idempotent; safe on every boot."""
    for name in DEFAULT_EVENT_TYPES:
        try:
            event_types.update_one(
                {"key": name.casefold()},
                {
                    "$setOnInsert": new_event_type_document(name=name, is_default=True),
                },
                upsert=True,
            )
        except PyMongoError as error:
            logger.error("event_types_seed_failed name=%s error=%s", name, error)


def ensure_event_type_indexes() -> None:
    event_types.create_index([("key", ASCENDING)], unique=True, name="key_unique")
