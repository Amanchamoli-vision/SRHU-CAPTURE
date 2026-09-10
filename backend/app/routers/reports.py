from io import BytesIO
from datetime import datetime, timezone
from urllib.parse import urlparse
from xml.sax.saxutils import escape

from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.database import supabase
from app.routers.events import get_current_user, check_dean


router = APIRouter(tags=["Reports", "Dean"])


# ============================================================
# REQUEST SCHEMA
# ============================================================

class SocialLinkRequest(BaseModel):
    social_network_url: str


# ============================================================
# HELPERS
# ============================================================

def get_event(event_id: str):
    response = (
        supabase
        .table("events")
        .select(
            """
            id,
            teacher_id,
            event_name,
            event_date,
            event_type,
            location,
            description,
            social_network_url,
            status,
            rejection_reason,
            created_at,
            updated_at
            """
        )
        .eq("id", event_id)
        .maybe_single()
        .execute()
    )

    event = response.data

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    return event


def validate_social_url(url: str) -> str:
    url = url.strip()

    if not url:
        raise HTTPException(
            status_code=400,
            detail="Social Network Link is required"
        )

    # Allow user to enter www.example.com
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)

    if not parsed.netloc:
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid Social Network Link"
        )

    return url


def get_event_media(event_id: str):
    response = (
        supabase
        .table("event_media")
        .select(
            """
            id,
            media_url,
            media_type,
            created_at
            """
        )
        .eq("event_id", event_id)
        .order("created_at", desc=False)
        .execute()
    )

    return response.data or []


def get_event_documents(event_id: str):
    response = (
        supabase
        .table("event_documents")
        .select(
            """
            id,
            file_name,
            file_url,
            file_type,
            file_size,
            created_at
            """
        )
        .eq("event_id", event_id)
        .order("created_at", desc=False)
        .execute()
    )

    return response.data or []


def get_teacher(event):
    response = (
        supabase
        .table("users")
        .select("id, name, email")
        .eq("id", event["teacher_id"])
        .maybe_single()
        .execute()
    )

    return response.data or {}


# ============================================================
# GET REPORT STATUS
# ============================================================

@router.get("/dean/events/{event_id}/report-status")
def get_report_status(
    event_id: str,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_dean(user.id)

    event = get_event(event_id)

    report_response = (
        supabase
        .table("event_reports")
        .select(
            """
            id,
            event_id,
            generated_at
            """
        )
        .eq("event_id", event_id)
        .maybe_single()
        .execute()
    )

    report = report_response.data

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
    check_dean(user.id)

    event = get_event(event_id)

    if event.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Social Network Link can only be added after event approval"
        )

    social_url = validate_social_url(
        payload.social_network_url
    )

    response = (
        supabase
        .table("events")
        .update({
            "social_network_url": social_url
        })
        .eq("id", event_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    # If the link changes, an old report should not remain valid.
    (
        supabase
        .table("event_reports")
        .delete()
        .eq("event_id", event_id)
        .execute()
    )

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
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_dean(user.id)

    event = get_event(event_id)

    documents = get_event_documents(event["id"])

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
        event.get("description")
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
    check_dean(user.id)

    event = get_event(event_id)

    # --------------------------------------------------------
    # Event must be approved
    # --------------------------------------------------------

    if event.get("status") != "approved":
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

    media = get_event_media(event_id)
    documents = get_event_documents(event_id)
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

    generated_at = datetime.now(
        timezone.utc
    ).isoformat()

    # --------------------------------------------------------
    # Remove old report
    # --------------------------------------------------------

    (
        supabase
        .table("event_reports")
        .delete()
        .eq("event_id", event_id)
        .execute()
    )

    # --------------------------------------------------------
    # Save new report
    # --------------------------------------------------------

    response = (
        supabase
        .table("event_reports")
        .insert({
            "event_id": event_id,
            "report_title": report_title,
            "report_content": report_content,
            "generated_at": generated_at,
        })
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate report"
        )

    return {
        "success": True,
        "message": "Report generated successfully",
        "event_id": event_id,
        "generated_at": generated_at,
        "download_available": True
    }


# ============================================================
# BUILD PDF
# ============================================================

def build_pdf(
    event,
    teacher,
    media,
    documents
):
    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontSize=20,
        spaceAfter=8,
    )

    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=10,
        spaceAfter=18,
    )

    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontSize=13,
        spaceBefore=12,
        spaceAfter=7,
    )

    normal_style = ParagraphStyle(
        "NormalReport",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=14,
        spaceAfter=5,
    )

    story = []

    story.append(
        Paragraph(
            "Campus Capture",
            title_style
        )
    )

    story.append(
        Paragraph(
            "Swami Rama Himalayan University",
            subtitle_style
        )
    )

    story.append(
        Paragraph(
            "EVENT REPORT",
            heading_style
        )
    )

    event_name = escape(
        str(event.get("event_name") or "")
    )

    event_date = escape(
        str(event.get("event_date") or "")
    )

    event_type = escape(
        str(event.get("event_type") or "")
    )

    location = escape(
        str(event.get("location") or "")
    )

    teacher_name = escape(
        str(teacher.get("name") or "Not available")
    )

    teacher_email = escape(
        str(teacher.get("email") or "Not available")
    )

    social_url = escape(
        str(event.get("social_network_url") or "")
    )

    rows = [
        ["Event Name", event_name],
        ["Event Date", event_date],
        ["Event Type", event_type],
        ["Location", location],
        ["Teacher", teacher_name],
        ["Teacher Email", teacher_email],
        ["Social Network Link", social_url],
        ["Status", "Approved"],
        ["Photos / Videos", str(len(media))],
        ["Supporting Documents", str(len(documents))],
    ]

    table_data = []

    for key, value in rows:
        table_data.append([
            Paragraph(
                escape(key),
                normal_style
            ),
            Paragraph(
                value,
                normal_style
            ),
        ])

    table = Table(
        table_data,
        colWidths=[48 * mm, 125 * mm]
    )

    table.setStyle(
        TableStyle([
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.5,
                colors.grey
            ),
            (
                "BACKGROUND",
                (0, 0),
                (0, -1),
                colors.whitesmoke
            ),
            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP"
            ),
            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                6
            ),
            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                6
            ),
            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                6
            ),
            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                6
            ),
        ])
    )

    story.append(table)

    story.append(
        Paragraph(
            "Event Description",
            heading_style
        )
    )

    description = escape(
        str(
            event.get("description")
            or "No description provided."
        )
    )

    story.append(
        Paragraph(
            description,
            normal_style
        )
    )

    story.append(
        Paragraph(
            "Report Summary",
            heading_style
        )
    )

    story.append(
        Paragraph(
            f"This report was automatically generated for "
            f"the approved event <b>{event_name}</b>. "
            f"The event contains {len(media)} photo/video "
            f"files and {len(documents)} supporting documents.",
            normal_style
        )
    )

    story.append(
        Spacer(1, 10)
    )

    story.append(
        Paragraph(
            "Generated automatically by Campus Capture SRHU.",
            subtitle_style
        )
    )

    document.build(story)

    buffer.seek(0)

    return buffer


# ============================================================
# DOWNLOAD REPORT
# ============================================================

@router.get("/dean/events/{event_id}/report/download")
def download_report(
    event_id: str,
    authorization: str | None = Header(default=None)
):
    user = get_current_user(authorization)
    check_dean(user.id)

    event = get_event(event_id)

    if event.get("status") != "approved":
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

    report_response = (
        supabase
        .table("event_reports")
        .select("id, event_id, generated_at")
        .eq("event_id", event_id)
        .maybe_single()
        .execute()
    )

    report = report_response.data

    if not report:
        raise HTTPException(
            status_code=400,
            detail="Please generate the report first"
        )

    media = get_event_media(event_id)
    documents = get_event_documents(event_id)
    teacher = get_teacher(event)

    pdf = build_pdf(
        event,
        teacher,
        media,
        documents
    )

    safe_name = (
        event.get("event_name")
        or "event"
    )

    safe_name = "".join(
        char
        if char.isalnum()
        else "_"
        for char in safe_name
    )

    filename = f"{safe_name}_Report.pdf"

    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="{filename}"'
        }
    )