"""Document shapes for each MongoDB collection.

MongoDB has no schema, so the builders here are the single place that decides
which fields a freshly inserted document carries.
"""

from __future__ import annotations

from typing import Any

from app.utils.serializers import utc_now


ROLES = ("teacher", "dean", "superadmin")

# Full event lifecycle. Drafts live in the teacher's browser, but the value is
# reserved so that dean views can always exclude it.
EVENT_STATUSES = (
    "draft",
    "submitted",
    "pending",
    "under_review",
    "approved",
    "in_progress",
    "completed",
    "rejected",
    "published",
)

# Statuses in which the owning teacher may still edit or withdraw an event.
TEACHER_EDITABLE_STATUSES = ("draft", "submitted", "pending", "under_review", "rejected")

# Post-approval delivery stages the Dean moves an event through.
DEAN_PROGRESS_STAGES = ("approved", "in_progress", "completed")

# Statuses at or beyond approval.
APPROVED_STAGES = ("approved", "published", "in_progress", "completed")

ALLOWED_EVENT_TYPES = (
    "Academic",
    "Cultural",
    "Sports",
    "Workshop",
    "Seminar",
    "Conference",
    "Celebration",
    "Other",
)

NOTIFICATION_TYPES = (
    # To the teacher, about their own event
    "approved",
    "rejected",
    "needs_changes",
    "progress",      # the Dean moved it to In Progress / Completed / back
    "published",
    "reminder",
    # To every Dean, about the review queue
    "submitted",
    "resubmitted",
)

# The teacher-visible audit trail, embedded on the event as `history`.
#
# Every status transition appends one entry, because none of what a teacher
# needs to see in "Event progress" is recoverable from the current status: a
# rejection that was later approved leaves no trace of the rejection, and a
# Dean's remarks are overwritten by the next decision. Embedded rather than a
# collection of its own — an event's history is a handful of entries, only ever
# read with the event, and appending it in the same update as the status change
# means one can never exist without the other.
HISTORY_ACTIONS = (
    "created",
    "submitted",
    "updated",
    "resubmitted",
    "approved",
    "rejected",
    "changes_requested",
    "stage_changed",
)

# Fields that must never leave the server.
USER_PRIVATE_FIELDS = (
    "password_hash",
    "verification_token_hash",
    "verification_expires_at",
    "reset_token_hash",
    "reset_expires_at",
)


def new_user_document(
    *,
    name: str,
    email: str,
    password_hash: str,
    role: str = "teacher",
    email_verified: bool = False,
) -> dict[str, Any]:
    now = utc_now()
    return {
        "name": name,
        "email": email,
        "password_hash": password_hash,
        "role": role,
        "email_verified": email_verified,
        "email_verified_at": now if email_verified else None,
        "verification_token_hash": None,
        "verification_expires_at": None,
        "reset_token_hash": None,
        "reset_expires_at": None,
        "last_sign_in_at": None,
        "created_at": now,
        "updated_at": now,
    }


def new_history_entry(
    *,
    action: str,
    status: str,
    actor: dict,
    from_status: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """One step of an event's audit trail.

    The actor's name and role are copied in rather than looked up on read, so
    the trail still says who decided even if that account is later renamed,
    demoted or deleted.
    """
    return {
        "action": action,
        "status": status,
        "from_status": from_status,
        "actor_id": actor.get("id"),
        "actor_name": actor.get("name") or actor.get("email"),
        "actor_role": actor.get("role"),
        "note": (note or "").strip() or None,
        "created_at": utc_now(),
    }


def new_event_document(
    *,
    teacher_id: str,
    event_name: str,
    event_date: str,
    event_type: str,
    location: str,
    description: str | None,
    social_network_url: str | None,
    status: str = "pending",
    history: list[dict] | None = None,
) -> dict[str, Any]:
    now = utc_now()
    return {
        "teacher_id": teacher_id,
        "event_name": event_name,
        "event_date": event_date,
        "event_type": event_type,
        "location": location,
        "description": description,
        "social_network_url": social_network_url,
        "status": status,
        "rejection_reason": None,
        "submitted_at": now if status != "draft" else None,
        "reviewed_at": None,
        "history": history or [],
        "created_at": now,
        "updated_at": now,
    }


def new_media_document(
    *,
    event_id: str,
    file_id: str,
    file_name: str,
    media_url: str,
    media_type: str,
    content_type: str | None,
    file_size: int,
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "file_id": file_id,
        "file_name": file_name,
        "media_url": media_url,
        "media_type": media_type,
        "content_type": content_type,
        "file_size": file_size,
        "created_at": utc_now(),
    }


def new_document_document(
    *,
    event_id: str,
    file_id: str,
    file_name: str,
    file_url: str,
    file_type: str | None,
    file_size: int,
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "file_id": file_id,
        "file_name": file_name,
        "file_url": file_url,
        "file_type": file_type,
        "file_size": file_size,
        "created_at": utc_now(),
    }


def new_notification_document(
    *,
    user_id: str,
    event_id: str | None,
    notification_type: str,
    title: str,
    message: str,
    data: dict | None = None,
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "event_id": event_id,
        "notification_type": notification_type,
        "title": title,
        "message": message,
        "data": data or {},
        "is_read": False,
        "created_at": utc_now(),
        "read_at": None,
    }


def new_report_document(
    *,
    event_id: str,
    report_title: str,
    report_content: str,
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "report_title": report_title,
        "report_content": report_content,
        "generated_at": utc_now(),
    }
