"""Request bodies for the Event Manager role (routers/event_manager.py).

Event fields use the teacher schemas (EventCreateRequest / EventUpdateRequest):
the Event Manager fills in the Teacher form.
"""

from pydantic import BaseModel, Field

from app.schemas.reports import ReportCustomizationOptions

# Photos per event in a report. The Event Manager picks them as they upload;
# app/services/managed_report_pdf.py lays out at most this many.
MAX_REPORT_PHOTOS = 4

# Events per consolidated report. Each one can carry MAX_REPORT_PHOTOS photos,
# so this bounds both the work of one request and the size of the PDF.
MAX_EVENTS_PER_REPORT = 50


class ReportPhotosRequest(BaseModel):
    """Which photos go into the event's report, in order. Empty means none."""

    photo_ids: list[str] = Field(default_factory=list, max_length=MAX_REPORT_PHOTOS)


class ManagedReportRequest(BaseModel):
    event_ids: list[str] = Field(min_length=1, max_length=MAX_EVENTS_PER_REPORT)
    customization: ReportCustomizationOptions | None = None


# Events one bulk delete may cover (the same ceiling as the Dean's).
MAX_BULK_DELETE_EVENTS = 5000


class ManagedBulkDeleteRequest(BaseModel):
    event_ids: list[str] = Field(min_length=1, max_length=MAX_BULK_DELETE_EVENTS)
