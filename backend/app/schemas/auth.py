from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import normalize_phone
from app.utils.security import password_byte_error


def _normalize_name(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("Name must not be empty")
    return normalized


def _check_new_password(value: str) -> str:
    """Reject a new password bcrypt would silently truncate (over 72 UTF-8 bytes).

    Only applied where a password is *chosen*. Fields that check an existing
    password (login, verify-email, current_password) accept up to 128
    characters, because accounts created before this rule may have one.
    """
    error = password_byte_error(value)
    if error:
        raise ValueError(error)
    return value


class RegistrationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return _check_new_password(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    # The account's password, proving the person confirming the address is
    # the person who registered it (see /auth/verify-email).
    password: str = Field(min_length=1, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=6, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return _check_new_password(value)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return _check_new_password(value)


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # Optional. Setting it lists this person in the coordinator directory.
    phone: str | None = Field(default=None, max_length=24)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("phone")
    @classmethod
    def normalize_phone_field(cls, value: str | None) -> str | None:
        return normalize_phone(value)
