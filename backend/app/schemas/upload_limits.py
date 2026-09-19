"""Validation for the Super Admin's photo and video upload limits.

Bounds live in `app/services/upload_limits.py` (`LIMIT_BOUNDS`) and are applied
here rather than being restated, so the console's hint text, this schema and
the reader that sanitises a stored row can never disagree about what counts as
a sane value.

Nothing in here touches MongoDB: a validator that reads a collection cannot be
faked by the test suite. Shape is checked here, persistence happens in the
service.
"""

from __future__ import annotations

from pydantic import BaseModel, model_validator

from app.services.upload_limits import LIMIT_BOUNDS


def _label(field: str) -> str:
    """"max_photo_size_mb" -> "Maximum photo size"; used in error messages."""
    return {
        "max_photos_per_event": "Maximum number of photos per event",
        "max_photo_size_mb": "Maximum size per photo",
        "max_photo_total_mb": "Maximum combined photo size",
        "max_videos_per_event": "Maximum number of videos per event",
        "max_video_size_mb": "Maximum size per video",
        "max_video_total_mb": "Maximum combined video size",
    }[field]


class UploadLimitsRequest(BaseModel):
    """The whole configuration, sent as one payload.

    Every field is required so a save is a complete picture of the limits --
    a partial update would make "what is the combined photo budget now?"
    depend on what happened to be stored before. The two nullable fields take
    `null` to mean "no limit", which is what shipped before they existed.
    """

    max_photos_per_event: int
    max_photo_size_mb: int
    max_photo_total_mb: int | None = None
    max_videos_per_event: int | None = None
    max_video_size_mb: int
    max_video_total_mb: int

    @model_validator(mode="after")
    @classmethod
    def check_ranges(cls, model: "UploadLimitsRequest") -> "UploadLimitsRequest":
        for field, bounds in LIMIT_BOUNDS.items():
            value = getattr(model, field)

            if value is None:
                if bounds["nullable"]:
                    continue
                raise ValueError(f"{_label(field)} is required.")

            # bool is an int in Python, and `true` in JSON would otherwise be
            # silently accepted as 1.
            if isinstance(value, bool):
                raise ValueError(f"{_label(field)} must be a whole number.")

            if value < bounds["min"] or value > bounds["max"]:
                raise ValueError(
                    f"{_label(field)} must be between "
                    f"{bounds['min']} and {bounds['max']}."
                )

        # A per-file cap above the combined budget is not reachable: the first
        # file of that size would be refused by the total instead, and the
        # number shown to the teacher would be a lie.
        if (
            model.max_photo_total_mb is not None
            and model.max_photo_size_mb > model.max_photo_total_mb
        ):
            raise ValueError(
                "Maximum size per photo cannot be larger than the combined "
                "photo size."
            )

        if model.max_video_size_mb > model.max_video_total_mb:
            raise ValueError(
                "Maximum size per video cannot be larger than the combined "
                "video size."
            )

        return model
