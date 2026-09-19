from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class CreateDeanRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Name must not be empty")
        return normalized


class UploadLimitsUpdateRequest(BaseModel):
    max_photos_per_event: int = Field(
        ge=1, le=100, description="Max number of photos allowed per event"
    )
    max_photo_size_mb: int = Field(
        ge=1, le=100, description="Max size per photo in MB"
    )
    max_photo_total_mb: int | None = Field(
        default=None, ge=1, le=1000, description="Max total combined size for photos in MB"
    )
    max_videos_per_event: int | None = Field(
        default=None, ge=1, le=50, description="Max number of videos allowed per event"
    )
    max_video_size_mb: int = Field(
        ge=1, le=1000, description="Max size per video in MB"
    )
    max_video_total_mb: int = Field(
        ge=1, le=2000, description="Max total combined size for videos in MB"
    )

    @model_validator(mode="after")
    def validate_relationships(self) -> "UploadLimitsUpdateRequest":
        if (
            self.max_photo_total_mb is not None
            and self.max_photo_total_mb < self.max_photo_size_mb
        ):
            raise ValueError(
                "Max total photo size cannot be less than single photo size limit"
            )
        if self.max_video_size_mb > self.max_video_total_mb:
            raise ValueError(
                "Max single video size cannot be greater than total video size limit"
            )
        return self


class UpdateUserProfileRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=24)
    department: str | None = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Name must not be empty")
        return normalized

    @field_validator("phone")
    @classmethod
    def normalize_phone_field(cls, value: str | None) -> str | None:
        from app.schemas.common import normalize_phone
        return normalize_phone(value)


class ResetUserPasswordRequest(BaseModel):
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


class CreateDepartmentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=20)
    school: str | None = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Department name must not be empty")
        return normalized

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Department code must not be empty")
        return normalized


class UpdateDepartmentRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=20)
    school: str | None = Field(default=None, max_length=120)
    is_active: bool | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Department name must not be empty")
        return normalized

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Department code must not be empty")
        return normalized


class BulkOnboardTeacherItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    department: str | None = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Name must not be empty")
        return normalized


class BulkOnboardTeachersRequest(BaseModel):
    teachers: list[BulkOnboardTeacherItem] = Field(min_length=1, max_length=500)
    send_email: bool = Field(default=True)


class SendCredentialsRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=500)


