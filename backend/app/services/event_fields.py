"""Read-fallback for event fields promoted out of the description blob.

Start time, end time, organiser and coordinator contact used to be smuggled
into `description` as an `<!--CC_METADATA:{...}-->` JSON comment written by the
create-event wizard. They are now real fields on the event document.

Events created before that change still carry their values only in the blob,
so every read path runs them through `with_legacy_metadata()`. That keeps the
migration free -- there is no backfill to run, and no window where an old event
renders with blank times -- while new writes populate the real fields.

`department` and `expected_participants` deliberately stay in the blob: nothing
validates, queries or sorts on them, so promoting them would be churn.
"""

from __future__ import annotations

from app.services.report_pdf import split_description

# Promoted field -> the blob keys that may hold it. The wizard wrote camelCase;
# a couple of older payloads used snake_case, so both are accepted.
_FIELD_SOURCES: dict[str, tuple[str, ...]] = {
    "start_time": ("startTime", "start_time"),
    "end_time": ("endTime", "end_time"),
    "organizer": ("organizer",),
    "coordinator_contact": ("contactInfo", "contact_info", "coordinator_contact"),
}


def legacy_metadata(event: dict) -> dict:
    """The raw metadata blob carried in this event's description, if any."""
    _, meta = split_description(event.get("description"))
    return meta


def with_legacy_metadata(event: dict | None) -> dict | None:
    """Fill any promoted field this event is missing from its description blob.

    Mutates and returns `event`. A field already set on the document always
    wins -- the blob is only ever a fallback, never an override, so a teacher
    editing an old event through the new form is not silently reverted.
    """
    if not event:
        return event

    if all(event.get(field) for field in _FIELD_SOURCES):
        return event

    meta = legacy_metadata(event)
    if not meta:
        return event

    for field, keys in _FIELD_SOURCES.items():
        if event.get(field):
            continue
        value = next(
            (str(meta[key]).strip() for key in keys if str(meta.get(key) or "").strip()),
            None,
        )
        if value:
            event[field] = value

    return event


def many_with_legacy_metadata(events: list[dict]) -> list[dict]:
    """`with_legacy_metadata` across a list, in place."""
    for event in events:
        with_legacy_metadata(event)
    return events
