import json
from datetime import date
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from app.models.documents import ALLOWED_EVENT_TYPES, NOTIFICATION_TYPES


def _validate_event_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("event_date must use the YYYY-MM-DD format") from error
    return value


def _validate_event_type(value: str) -> str:
    normalized = value.strip()
    match = next(
        (item for item in ALLOWED_EVENT_TYPES if item.lower() == normalized.lower()),
        None,
    )
    if not match:
        raise ValueError(
            "Invalid event type. Allowed values: " + ", ".join(ALLOWED_EVENT_TYPES)
        )
    return match


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_social_url(url: str) -> str:
    """The one rule for social-post links, used for teacher and Dean input.

    ``www.example.com`` becomes ``https://www.example.com``; the result must be
    an http(s) URL with a host. Anything else -- ``javascript:``, ``data:``,
    a bare word with spaces -- is rejected with ValueError. The link is shown
    as an ``href`` on the Dean page and in the report PDF.
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("Social Network Link is required")

    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    try:
        parsed.port  # raises ValueError for a non-numeric port ("javascript:alert(1)")
    except ValueError as error:
        raise ValueError("Please enter a valid Social Network Link") from error

    host = parsed.hostname or ""
    if (
        parsed.scheme.lower() not in ("http", "https")
        or not host
        or any(char.isspace() or char in "<>\"`" for char in url)
    ):
        raise ValueError("Please enter a valid Social Network Link")
    return url


class EventCreateRequest(BaseModel):
    event_name: str = Field(min_length=1, max_length=200)
    event_date: str
    event_type: str
    location: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    social_network_url: str | None = Field(default=None, max_length=2048)

    # A draft is parked on the server so its photos, videos and documents can be
    # uploaded before the teacher is ready to submit. Drafts are excluded from
    # every dean view, so this never puts an unfinished event in front of them.
    save_as_draft: bool = False

    @field_validator("event_name", "location")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field must not be empty")
        return cleaned

    @field_validator("event_date")
    @classmethod
    def check_date(cls, value: str) -> str:
        return _validate_event_date(value)

    @field_validator("event_type")
    @classmethod
    def check_type(cls, value: str) -> str:
        return _validate_event_type(value)

    @field_validator("description")
    @classmethod
    def clean_optional(cls, value: str | None) -> str | None:
        return _clean_optional(value)

    @field_validator("social_network_url")
    @classmethod
    def check_social_url(cls, value: str | None) -> str | None:
        cleaned = _clean_optional(value)
        return None if cleaned is None else normalize_social_url(cleaned)


class EventUpdateRequest(EventCreateRequest):
    """Same fields as creation; a teacher edit always resubmits the event."""


# The only notifications a client may create for itself: the event-day
# reminders built by frontend/src/utils/notificationService.js. Every other
# type is raised by the server as the result of a real action.
CLIENT_NOTIFICATION_TYPES = ("reminder",)

# Serialized size cap for a client notification's `data`.
MAX_NOTIFICATION_DATA_BYTES = 4 * 1024


class NotificationCreateRequest(BaseModel):
    event_id: str | None = Field(default=None, max_length=64)
    notification_type: str = "reminder"
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    data: dict = Field(default_factory=dict)

    @field_validator("notification_type")
    @classmethod
    def check_type(cls, value: str) -> str:
        if value not in CLIENT_NOTIFICATION_TYPES or value not in NOTIFICATION_TYPES:
            raise ValueError(
                "Invalid notification type. Allowed values: " + ", ".join(CLIENT_NOTIFICATION_TYPES)
            )
        return value

    @field_validator("data")
    @classmethod
    def check_data_size(cls, value: dict) -> dict:
        try:
            size = len(json.dumps(value, default=str).encode("utf-8"))
        except (TypeError, ValueError, RecursionError) as error:
            raise ValueError("Notification data must be plain JSON") from error
        if size > MAX_NOTIFICATION_DATA_BYTES:
            raise ValueError(
                f"Notification data must be at most {MAX_NOTIFICATION_DATA_BYTES} bytes"
            )
        return value


class DeanDecisionBody(BaseModel):
    """Optional JSON body for reject / request-changes; the query string
    parameters are still accepted."""

    rejection_reason: str | None = Field(default=None, max_length=5000)
    remarks: str | None = Field(default=None, max_length=5000)
