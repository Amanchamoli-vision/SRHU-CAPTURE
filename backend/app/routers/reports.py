from datetime import datetime, timezone
from io import BytesIO
from typing import Callable

from fastapi import APIRouter, HTTPException, Header, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import ASCENDING

from app.config import settings
from app.database import event_documents, event_media, event_reports, events, fs, users
from app.models.documents import APPROVED_STAGES, new_report_document
from app.schemas.events import normalize_social_url
from app.services import report_files
from app.services.event_fields import with_legacy_metadata
from app.services.managed_report_pdf import (
    Attachment,
    ReportEntry,
    build_managed_report_pdf,
    prepare_photo,
)
from app.services.report_pdf import approval_record, report_reference, split_description
from app.services.storage_service import absolute_url, absolutize, content_disposition
from app.utils.file_names import report_file_name
from app.utils.auth import check_dean, check_event_viewer, get_current_user
from app.utils.serializers import serialize, serialize_many, to_object_id, utc_now


router = APIRouter(tags=["Reports", "Dean"])


# ============================================================
# REQUEST SCHEMA
# ============================================================

class SocialLinkRequest(BaseModel):
    # Optional so the Dean can also CLEAR a link that was set by mistake; the
    # report no longer depends on it (PRD 17).
    social_network_url: str | None = None


# ============================================================
# HELPERS
# ============================================================

# Statuses at or beyond approval. The report must remain generatable once the
# Dean advances an approved event through its delivery stages.

def is_approved(event) -> bool:
    return (event or {}).get("status") in APPROVED_STAGES


# The report is the record of an event that took place, so it exists only once
# the Dean has marked the event Completed -- approved alone is not enough.
REPORTABLE_STATUS = "completed"
NOT_COMPLETED_DETAIL = (
    "The report can be generated once the Dean has marked the event Completed."
)


def is_completed(event) -> bool:
    return (event or {}).get("status") == REPORTABLE_STATUS


def get_event(event_id: str):
    """The event by id; a draft is reported as missing, exactly like
    GET /dean/events/{id}, because drafts are never shown to a Dean.

    An archived event is hidden the same way -- a report asserts a live
    approval, so one must not be generated from the shelf (PRD 1).
    """
    object_id = to_object_id(event_id)
    event = events.find_one({"_id": object_id}) if object_id else None

    if not event or event.get("status") == "draft" or event.get("archived_at") is not None:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    return serialize(event)


def validate_social_url(url: str) -> str:
    # One rule for teacher and Dean input; see schemas.events.
    try:
        return normalize_social_url(url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


def report_download_name(event_name: str | None) -> str:
    """The event's title as the file name: "IEEE Conference.pdf"."""
    return report_file_name(event_name)


def get_event_media(event_id: str):
    cursor = event_media.find({"event_id": event_id}).sort("created_at", ASCENDING)
    return serialize_many(cursor)


def get_event_documents(event_id: str):
    cursor = event_documents.find({"event_id": event_id}).sort("created_at", ASCENDING)
    return serialize_many(cursor)


def get_teacher(event):
    teacher = users.find_one(
        {"_id": to_object_id(event.get("teacher_id"))},
        {"name": 1, "email": 1},
    )
    return serialize(teacher) or {}


def get_report(event_id: str):
    return serialize(event_reports.find_one({"event_id": event_id}))


# ============================================================
# GET REPORT STATUS
# ============================================================

@router.get("/dean/events/{event_id}/report-status")
def get_report_status(
    event_id: str,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_event_viewer(user)

    event = get_event(event_id)
    report = get_report(event["id"])

    return {
        "success": True,
        "event_id": event_id,
        "event_status": event.get("status"),
        "social_network_url": event.get("social_network_url"),
        "report_generated": bool(report),
        "generated_at": (
            report.get("generated_at")
            if report
            else None
        ),
    }


# ============================================================
# SAVE SOCIAL NETWORK LINK
# ============================================================

@router.patch("/dean/events/{event_id}/social-link")
def save_social_link(
    event_id: str,
    payload: SocialLinkRequest,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_dean(user)

    event = get_event(event_id)

    if not is_approved(event):
        raise HTTPException(
            status_code=400,
            detail="Social Network Link can only be added after event approval"
        )

    raw_social_url = (payload.social_network_url or "").strip()
    social_url = validate_social_url(raw_social_url) if raw_social_url else None

    result = events.update_one(
        {"_id": to_object_id(event_id), "status": {"$in": list(APPROVED_STAGES)}},
        {"$set": {"social_network_url": social_url, "updated_at": utc_now()}},
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=409,
            detail="This event is no longer approved."
        )

    # If the link changes, an old report should not remain valid.
    event_reports.delete_many({"event_id": event["id"]})

    return {
        "success": True,
        "message": "Social Network Link saved successfully",
        "social_network_url": social_url
    }


# ============================================================
# GET DOCUMENTS
# ============================================================

@router.get("/dean/events/{event_id}/documents")
def get_documents(
    event_id: str,
    request: Request,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_event_viewer(user)

    event = get_event(event_id)

    documents = [
        absolutize(request, document, "file_url")
        for document in get_event_documents(event["id"])
    ]

    return {
        "success": True,
        "event_id": event_id,
        "documents": documents,
        "total": len(documents)
    }


# ============================================================
# BUILD REPORT CONTENT
# ============================================================

def build_report_content(
    event,
    teacher,
    media,
    documents
):
    # PRD 17: the link is optional, so the report says so rather than
    # leaving an empty line under the heading.
    social_url = (event.get("social_network_url") or "").strip() or "Not provided"

    media_count = len(media)
    document_count = len(documents)

    description = (
        split_description(event.get("description"))[0]
        or "No description provided."
    )

    teacher_name = (
        teacher.get("name")
        or "Not available"
    )

    teacher_email = (
        teacher.get("email")
        or "Not available"
    )

    return f"""
Event Name: {event.get("event_name")}

Event Date: {event.get("event_date")}

Event Type: {event.get("event_type")}

Location: {event.get("location")}

Teacher: {teacher_name}

Teacher Email: {teacher_email}

Description:
{description}

Social Network Link:
{social_url}

Photos/Videos:
{media_count}

Supporting Documents:
{document_count}

Event Status:
Approved

This report was generated automatically by Campus Capture SRHU.
"""


# ============================================================
# GENERATE REPORT
# ============================================================

@router.post("/dean/events/{event_id}/generate-report")
def generate_report(
    event_id: str,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_dean(user)

    event = get_event(event_id)

    # --------------------------------------------------------
    # Event must be completed (approved alone is not enough)
    # --------------------------------------------------------

    if not is_completed(event):
        raise HTTPException(status_code=400, detail=NOT_COMPLETED_DETAIL)

    # --------------------------------------------------------
    # Collect event information
    # --------------------------------------------------------

    media = get_event_media(event["id"])
    documents = get_event_documents(event["id"])
    teacher = get_teacher(event)

    report_title = (
        f"Event Report - {event.get('event_name')}"
    )

    report_content = build_report_content(
        event,
        teacher,
        media,
        documents
    )

    # --------------------------------------------------------
    # Replace any old report
    # --------------------------------------------------------

    report = new_report_document(
        event_id=event["id"],
        report_title=report_title,
        report_content=report_content,
    )

    event_reports.replace_one(
        {"event_id": event["id"]},
        report,
        upsert=True,
    )

    generated_at = report["generated_at"].isoformat()

    return {
        "success": True,
        "message": "Report generated successfully",
        "event_id": event_id,
        "generated_at": generated_at,
        "download_available": True
    }


# ============================================================
# DOWNLOAD REPORT
# ============================================================

@router.get("/dean/events/{event_id}/report/download")
def download_report(
    event_id: str,
    request: Request,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_event_viewer(user)

    event = get_event(event_id)

    # Also refuses a report generated before this rule, while the event was
    # only approved.
    if not is_completed(event):
        raise HTTPException(status_code=400, detail=NOT_COMPLETED_DETAIL)

    report = get_report(event["id"])

    if not report:
        raise HTTPException(
            status_code=400,
            detail="Please generate the report first"
        )

    media = get_event_media(event["id"])
    documents = get_event_documents(event["id"])
    teacher = get_teacher(event)

    exp = report_files.links_expiry()

    def file_link(kind: str, file_id: str) -> str:
        sig = report_files.link_signature(LINK_SCOPE, kind, file_id, exp)
        return absolute_url(request, f"/reports/files/{kind}/{file_id}?exp={exp}&sig={sig}")

    pdf = build_dean_report(
        event, teacher, media, documents,
        file_link=file_link,
        links_valid_until=datetime.fromtimestamp(exp, tz=timezone.utc),
    )

    # ASCII fallback in filename=, the real (possibly Hindi) name in
    # filename*=UTF-8''..., so the latin-1 header can always be encoded.
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": content_disposition(
                "attachment",
                report_download_name(event.get("event_name")),
                fallback="Event_Report.pdf",
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        }
    )


# ============================================================
# THE REPORT DOCUMENT
# ============================================================

# Download links in a Dean report are signed with this scope, so they open
# only teacher-event files (the Event Manager's links use "managed").
LINK_SCOPE = "event"


def build_dean_report(
    event: dict,
    teacher: dict,
    media: list,
    documents: list,
    *,
    file_link: Callable[[str, str], str],
    links_valid_until: datetime | None = None,
) -> BytesIO:
    """The Dean's report, in the same design and structure as the Event
    Manager's (app/services/managed_report_pdf.py): event details, the
    description, the chosen photos laid out as one block, every file with a
    download link -- then the approval, which only this workflow has.

    ``event``, ``media`` and ``documents`` are serialized rows (``id``).
    """
    photo_rows = sorted(
        (row for row in media if row.get("media_type") == "image"), key=lambda row: row["id"]
    )
    by_id = {row["id"]: row for row in photo_rows}
    chosen = report_files.choose_photo_ids(event.get("report_photo_ids"), list(by_id))

    photos, failures = [], 0
    for pid in chosen:
        data = report_files.read_file_bytes(by_id[pid], fs)
        prepared = prepare_photo(data) if data else None
        del data
        if prepared:
            photos.append(prepared)
        else:
            failures += 1

    def name(row: dict) -> str:
        return row.get("original_name") or row.get("file_name") or "file"

    attachments = [
        Attachment(
            name=name(row),
            kind="photo" if row.get("media_type") == "image" else "video",
            size=row.get("file_size"),
            url=file_link("media", row["id"]),
        )
        for row in media
    ] + [
        Attachment(
            name=name(row),
            kind="document",
            size=row.get("file_size"),
            url=file_link("documents", row["id"]),
        )
        for row in documents
    ]

    # Department and expected participants stay in the description's metadata
    # blob (see services/event_fields.py); the other fields are real columns,
    # filled from the blob for events created before they existed.
    item = with_legacy_metadata(dict(event))
    description, meta = split_description(item.get("description"))
    item["description"] = description
    item["expected_participants"] = meta.get("expectedParticipants")
    item["department"] = meta.get("department") or settings.default_host_department

    entry = ReportEntry(
        event=item,
        photos=photos,
        photo_failures=failures,
        attachments=attachments,
        recorded_by={"name": teacher.get("name"), "email": teacher.get("email")},
        recorded_label="Submitted",
        show_recorded_on=False,
        approval=approval_record(event),
        reference=report_reference(event),
    )
    return build_managed_report_pdf(
        [entry], links_valid_until=links_valid_until, subject="Official event report"
    )


@router.get("/reports/files/{kind}/{file_id}")
def download_report_file(
    kind: str,
    file_id: str,
    exp: int = Query(...),
    sig: str = Query(..., max_length=128),
):
    """A file linked from a Dean report. The signature is the credential: the
    link is opened from a PDF, without the app's login token."""
    object_id = to_object_id(file_id)
    if not report_files.valid_link(LINK_SCOPE, kind, object_id, exp, sig):
        raise HTTPException(status_code=403, detail="This download link has expired or is invalid.")
    collection = event_media if kind == "media" else event_documents
    return report_files.download_response(collection.find_one({"_id": object_id}), fs)
