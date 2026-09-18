from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import ASCENDING

from app.database import event_documents, event_media, event_reports, events, users
from app.models.documents import APPROVED_STAGES, new_report_document
from app.schemas.events import normalize_social_url
from app.services.report_pdf import build_event_report_pdf, split_description
from app.services.storage_service import absolutize, content_disposition
from app.utils.auth import check_dean, check_event_viewer, get_current_user
from app.utils.serializers import serialize, serialize_many, to_object_id, utc_now


router = APIRouter(tags=["Reports", "Dean"])


# ============================================================
# REQUEST SCHEMA
# ============================================================

class SocialLinkRequest(BaseModel):
    social_network_url: str


# ============================================================
# HELPERS
# ============================================================

# Statuses at or beyond approval. The report must remain generatable once the
# Dean advances an approved event through its delivery stages.

def is_approved(event) -> bool:
    return (event or {}).get("status") in APPROVED_STAGES


def get_event(event_id: str):
    """The event by id; a draft is reported as missing, exactly like
    GET /dean/events/{id}, because drafts are never shown to a Dean."""
    object_id = to_object_id(event_id)
    event = events.find_one({"_id": object_id}) if object_id else None

    if not event or event.get("status") == "draft":
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
    return f"{(event_name or '').strip() or 'Event'}_Report.pdf"


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

    social_url = validate_social_url(
        payload.social_network_url
    )

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
    social_url = event.get("social_network_url") or ""

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
    # Event must be approved
    # --------------------------------------------------------

    if not is_approved(event):
        raise HTTPException(
            status_code=400,
            detail="Report can only be generated for approved events"
        )

    # --------------------------------------------------------
    # Social link is mandatory for report
    # --------------------------------------------------------

    social_url = (
        event.get("social_network_url")
        or ""
    ).strip()

    if not social_url:
        raise HTTPException(
            status_code=400,
            detail="Social Network Link is required before generating the report"
        )

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
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_event_viewer(user)

    event = get_event(event_id)

    if not is_approved(event):
        raise HTTPException(
            status_code=400,
            detail="Only approved events can have a report"
        )

    if not (
        event.get("social_network_url")
        or ""
    ).strip():
        raise HTTPException(
            status_code=400,
            detail="Social Network Link is required"
        )

    report = get_report(event["id"])

    if not report:
        raise HTTPException(
            status_code=400,
            detail="Please generate the report first"
        )

    media = get_event_media(event["id"])
    documents = get_event_documents(event["id"])
    teacher = get_teacher(event)

    pdf = build_event_report_pdf(event, teacher, media, documents)

    # ASCII fallback in filename=, the real (possibly Hindi) name in
    # filename*=UTF-8''..., so the latin-1 header can always be encoded.
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": content_disposition(
                "attachment",
                report_download_name(event.get("event_name")),
                fallback="Event_Report",
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        }
    )
