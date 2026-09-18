from datetime import date

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

    @field_validator("description", "social_network_url")
    @classmethod
    def clean_optional(cls, value: str | None) -> str | None:
        return _clean_optional(value)


class EventUpdateRequest(EventCreateRequest):
    """Same fields as creation; a teacher edit always resubmits the event."""


class NotificationCreateRequest(BaseModel):
    event_id: str | None = None
    notification_type: str = "reminder"
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    data: dict = Field(default_factory=dict)

    @field_validator("notification_type")
    @classmethod
    def check_type(cls, value: str) -> str:
        if value not in NOTIFICATION_TYPES:
            raise ValueError(
                "Invalid notification type. Allowed values: " + ", ".join(NOTIFICATION_TYPES)
            )
        return value
