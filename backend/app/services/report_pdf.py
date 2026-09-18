"""The official event report PDF, as downloaded by the Dean.

Layout, top to bottom: an SRHU letterhead (the same crest the Landing page
shows), the report title and reference, the event details, the teacher's
description reproduced verbatim, the supporting material, the approval record,
and a signature block for the Dean. Every page carries a footer with the page
count.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    FrameBG,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "srhu-logo.png"

# The crest's own blue, so the letterhead and the logo read as one mark.
NAVY = colors.HexColor("#1D3F7A")
INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#5B6475")
RULE = colors.HexColor("#CBD2DE")
LABEL_FILL = colors.HexColor("#F1F4F9")
GOLD = colors.HexColor("#C8962E")

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 18 * mm
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN

# The event form tucks extra fields into the description behind this marker
# (see frontend/src/utils/draftStorage.js). It is not part of what the teacher
# wrote, so it is split off before the description is printed.
METADATA_PATTERN = re.compile(r"\s*<!--CC_METADATA:([\s\S]*?)-->")

METADATA_LABELS = (
    ("department", "Department"),
    ("organizer", "Organiser"),
    ("expectedParticipants", "Expected Participants"),
    ("contactInfo", "Contact"),
)


# ============================================================
# TEXT HELPERS
# ============================================================

def split_description(raw: str | None) -> tuple[str, dict]:
    """Return the teacher's own text and the form's hidden metadata."""
    raw = raw or ""
    meta: dict = {}
    match = METADATA_PATTERN.search(raw)
    if match:
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, dict):
                meta = _clean_metadata(parsed)
        except (ValueError, RecursionError):
            pass
    return METADATA_PATTERN.sub("", raw).strip(), meta


def _clean_metadata(parsed: dict) -> dict[str, str]:
    """Keep only scalar metadata values, as strings.

    The metadata is teacher-controlled JSON, so a value may be a number
    (``{"startTime": 930}``), a list or null. Numbers become strings;
    anything that is not a plain scalar is ignored.
    """
    cleaned: dict[str, str] = {}
    for key, value in parsed.items():
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, (str, int, float)):
            cleaned[str(key)] = str(value)
    return cleaned


def verbatim_markup(text: str) -> str:
    """Paragraph markup that keeps the text exactly as typed.

    A plain Paragraph collapses runs of spaces and drops line breaks; this
    escapes the text and pins both down, so only the line wrapping differs
    from what the teacher entered.
    """
    lines = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = escape(line.replace("\t", "    "))
        # Keep every space after the first in a run, and any leading indent.
        line = re.sub(r"(?<= ) ", "&nbsp;", line)
        line = re.sub(r"^ ", "&nbsp;", line)
        lines.append(line)
    return "<br/>".join(lines)


def format_date(value) -> str:
    """'2026-10-15' or an ISO timestamp -> '15 October 2026'."""
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return str(value)
    return f"{parsed.day} {parsed:%B %Y}"


def format_time_range(start, end) -> str:
    def to_12h(value: str) -> str:
        try:
            return datetime.strptime(value, "%H:%M").strftime("%I:%M %p").lstrip("0")
        except ValueError:
            return value

    def text(value) -> str:
        return "" if value is None else str(value).strip()

    start, end = text(start), text(end)
    if start and end:
        return f"{to_12h(start)} to {to_12h(end)}"
    return to_12h(start or end)


def approval_record(event: dict) -> tuple[str, str]:
    """(approved by, approved on) from the event's audit trail."""
    approvals = [
        entry for entry in (event.get("history") or [])
        if entry.get("action") == "approved"
    ]
    if approvals:
        latest = approvals[-1]
        return latest.get("actor_name") or "Dean", format_date(latest.get("created_at"))
    return "Dean", format_date(event.get("reviewed_at"))


def report_reference(event: dict) -> str:
    return f"CC/ER/{(event.get('id') or '')[-6:].upper() or 'NA'}"


# ============================================================
# STYLES
# ============================================================

def _styles() -> dict[str, ParagraphStyle]:
    base = dict(fontName="Helvetica", textColor=INK)
    return {
        "university": ParagraphStyle(
            "University", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=NAVY
        ),
        "product": ParagraphStyle(
            "Product", fontName="Helvetica", fontSize=10, leading=13, textColor=MUTED
        ),
        "title": ParagraphStyle(
            "Title", fontName="Helvetica-Bold", fontSize=16, leading=20,
            alignment=TA_CENTER, textColor=NAVY,
        ),
        "reference": ParagraphStyle(
            "Reference", fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=MUTED,
            fontName="Helvetica",
        ),
        "section": ParagraphStyle(
            "Section", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
            textColor=NAVY, spaceBefore=12, spaceAfter=5,
            keepWithNext=1,  # never strand a heading at the foot of a page
        ),
        "label": ParagraphStyle(
            "Label", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=MUTED
        ),
        "value": ParagraphStyle("Value", fontSize=9.5, leading=13, **base),
        "body": ParagraphStyle("Body", fontSize=10, leading=15, **base),
        "sign_label": ParagraphStyle(
            "SignLabel", fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=INK
        ),
        "sign_value": ParagraphStyle("SignValue", fontSize=10, leading=14, **base),
    }


# ============================================================
# BLOCKS
# ============================================================

def _logo(height: float) -> Image:
    """The Landing page crest, flattened onto white.

    The PNG is palette-based with a transparent background, which some PDF
    viewers render black; flattening avoids that without altering the mark.
    """
    source = PILImage.open(LOGO_PATH).convert("RGBA")
    flat = PILImage.new("RGB", source.size, "white")
    flat.paste(source, mask=source.getchannel("A"))
    buffer = BytesIO()
    flat.save(buffer, format="PNG")
    buffer.seek(0)
    width = height * source.width / source.height
    return Image(buffer, width=width, height=height)


def _letterhead(styles) -> list:
    text = [
        Paragraph("Swami Rama Himalayan University", styles["university"]),
        Spacer(1, 2),
        Paragraph("Campus Capture &nbsp;·&nbsp; Event Documentation", styles["product"]),
    ]
    logo = _logo(20 * mm)
    table = Table(
        [[logo, text]],
        colWidths=[logo.drawWidth + 6 * mm, CONTENT_WIDTH - logo.drawWidth - 6 * mm],
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    rules = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[2.2])
    rules.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1.6, NAVY),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, GOLD),
    ]))
    return [table, Spacer(1, 4 * mm), rules]


def _key_value_table(rows, styles) -> Table:
    data = [
        [Paragraph(escape(label), styles["label"]), Paragraph(value, styles["value"])]
        for label, value in rows
    ]
    table = Table(data, colWidths=[48 * mm, CONTENT_WIDTH - 48 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), LABEL_FILL),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _boxed_text(text: str, style: ParagraphStyle) -> list:
    """The description in a ruled box that can run over as many pages as it
    needs.

    The text is plain Paragraph flowables (one per line of the teacher's
    text), which ReportLab splits across pages natively; the box is drawn by
    a FrameBG pair, which follows the flow onto every page. A table cell
    cannot do this: a one-cell table holding a long description raised
    LayoutError, and splitInRow tables can loop on long rows.
    """
    boxed_style = ParagraphStyle(
        f"{style.name}Boxed", parent=style, leftIndent=10, rightIndent=10
    )
    if text:
        lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        paragraphs = [Paragraph(verbatim_markup(line) or "&nbsp;", boxed_style) for line in lines]
    else:
        paragraphs = [Paragraph("<i>No description provided.</i>", boxed_style)]

    return [
        FrameBG(color=colors.white, strokeColor=RULE, strokeWidth=0.6, start=True),
        Spacer(1, 8),
        *paragraphs,
        Spacer(1, 9),
        FrameBG(start=False),
    ]


def _signature_block(styles) -> KeepTogether:
    line = "_" * 34
    rows = [
        ("Signature:", line),
        ("Date:", line),
        ("Signed by:", "Dean"),
    ]
    data = [
        [Paragraph(label, styles["sign_label"]), Paragraph(value, styles["sign_value"])]
        for label, value in rows
    ]
    table = Table(data, colWidths=[26 * mm, 80 * mm], hAlign="RIGHT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    # No heading of its own: a right-aligned block at the foot of the record
    # already reads as the sign-off, and the space keeps typical reports on
    # a single page.
    return KeepTogether([Spacer(1, 8 * mm), table])


# ============================================================
# PAGE FURNITURE
# ============================================================

class _NumberedCanvas(pdf_canvas.Canvas):
    """Draws the footer once the total page count is known."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self._draw_footer(total)
            super().showPage()
        super().save()

    def _draw_footer(self, total: int) -> None:
        y = 11 * mm
        self.setStrokeColor(RULE)
        self.setLineWidth(0.5)
        self.line(MARGIN, y + 4 * mm, PAGE_WIDTH - MARGIN, y + 4 * mm)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(MUTED)
        self.drawString(
            MARGIN, y, "Campus Capture  ·  Swami Rama Himalayan University  ·  Official event record"
        )
        self.drawRightString(PAGE_WIDTH - MARGIN, y, f"Page {self._pageNumber} of {total}")


# ============================================================
# ENTRY POINT
# ============================================================

def build_event_report_pdf(event: dict, teacher: dict, media: list, documents: list) -> BytesIO:
    styles = _styles()
    description, meta = split_description(event.get("description"))
    approved_by, approved_on = approval_record(event)

    story = _letterhead(styles)
    story += [
        Spacer(1, 5 * mm),
        Paragraph("EVENT REPORT", styles["title"]),
        Spacer(1, 1.5 * mm),
        Paragraph(
            f"Ref. {escape(report_reference(event))} &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"Issued {escape(format_date(datetime.now().isoformat()))}",
            styles["reference"],
        ),
    ]

    # 1. Event details
    details = [
        ("Event Name", escape(str(event.get("event_name") or ""))),
        ("Event Type", escape(str(event.get("event_type") or ""))),
        ("Event Date", escape(format_date(event.get("event_date")))),
    ]
    time_range = format_time_range(meta.get("startTime", ""), meta.get("endTime", ""))
    if time_range:
        details.append(("Time", escape(time_range)))
    details.append(("Venue", escape(str(event.get("location") or ""))))
    for key, label in METADATA_LABELS:
        value = str(meta.get(key) or "").strip()
        if value:
            details.append((label, escape(value)))
    details.append((
        "Submitted by",
        escape(str(teacher.get("name") or "Not available"))
        + (f"<br/><font color='#5B6475'>{escape(teacher['email'])}</font>" if teacher.get("email") else ""),
    ))
    story += [Paragraph("1. Event Details", styles["section"]), _key_value_table(details, styles)]

    # 2. Description, exactly as the teacher entered it
    story += [
        Paragraph("2. Event Description", styles["section"]),
        *_boxed_text(description, styles["body"]),
    ]

    # 3. Supporting material
    social_url = str(event.get("social_network_url") or "").strip()
    if not social_url:
        link = "Not provided"
    elif social_url.lower().startswith(("http://", "https://")):
        link = (
            f"<link href='{escape(social_url, {chr(39): '&#39;'})}' color='#1D3F7A'>"
            f"{escape(social_url)}</link>"
        )
    else:
        # Never make a javascript:, data: or other scheme clickable.
        link = escape(social_url)
    story += [
        Paragraph("3. Supporting Material", styles["section"]),
        _key_value_table([
            ("Photos / Videos", f"{len(media)} file{'s' if len(media) != 1 else ''}"),
            ("Documents", f"{len(documents)} file{'s' if len(documents) != 1 else ''}"),
            ("Social Media Post", link),
        ], styles),
    ]

    # 4. Approval
    story += [
        Paragraph("4. Approval", styles["section"]),
        _key_value_table([
            ("Status", "<b>Approved</b>"),
            ("Approved by", escape(f"{approved_by} (Dean)" if approved_by != "Dean" else "Dean")),
            ("Approved on", escape(approved_on or "Not recorded")),
        ], styles),
        _signature_block(styles),
    ]

    buffer = BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=16 * mm,
        bottomMargin=22 * mm,
        title=f"Event Report - {event.get('event_name') or ''}",
        author="Campus Capture, Swami Rama Himalayan University",
        subject="Official event report",
    ).build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    return buffer
