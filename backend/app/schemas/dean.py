"""Request bodies for the Dean's teacher-management routes (routers/dean_teachers.py)."""

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import normalize_phone


# Bulk credential sends are delivered synchronously so each teacher's real
# outcome can be reported back. A full SMTP session costs seconds, so a request
# is kept small enough to finish well inside a proxy timeout; the Dean panel
# sends a larger selection as several of these.
MAX_BULK_CREDENTIALS = 25


def _collapse(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    return cleaned or None


class DeanUpdateTeacherRequest(BaseModel):
    """The profile fields a Dean may change on a Teacher account.

    Role, activation, password and verification state are not here: each has
    its own audited route, and nothing system-level is editable at all. Only
    the fields actually sent are written (``model_fields_set``), so an explicit
    null clears an optional field while an omitted one is left alone.
    """

    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=24)
    department: str | None = Field(default=None, max_length=120)
    designation: str | None = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Name must not be empty")
        normalized = _collapse(value)
        if not normalized:
            raise ValueError("Name must not be empty")
        return normalized

    @field_validator("email")
    @classmethod
    def require_email(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Email must not be empty")
        return str(value).casefold()

    @field_validator("phone")
    @classmethod
    def normalize_phone_field(cls, value: str | None) -> str | None:
        return normalize_phone(value)

    @field_validator("department", "designation")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return _collapse(value)


class DeanSendCredentialsRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=MAX_BULK_CREDENTIALS)


# Matches teacher_import.MAX_ROWS: one file is imported in one request.
MAX_IMPORT_TEACHERS = 500


class DeanImportTeacherItem(BaseModel):
    """One teacher from an imported roster, as confirmed on the preview screen."""

    name: str | None = Field(default=None, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=24)
    department: str | None = Field(default=None, max_length=120)
    designation: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def fold_email(cls, value: str) -> str:
        return str(value).casefold()

    @field_validator("phone")
    @classmethod
    def normalize_phone_field(cls, value: str | None) -> str | None:
        return normalize_phone(value)

    @field_validator("name", "department", "designation")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return _collapse(value)


class DeanImportTeachersRequest(BaseModel):
    teachers: list[DeanImportTeacherItem] = Field(min_length=1, max_length=MAX_IMPORT_TEACHERS)
