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

