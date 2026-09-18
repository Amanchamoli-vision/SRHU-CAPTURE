import logging
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from pymongo import ASCENDING, DESCENDING

from app.database import (
    event_documents,
    event_media,
    events,
    notifications,
    users,
)
from app.models.documents import (
    ALLOWED_EVENT_TYPES,
    DEAN_PROGRESS_STAGES,
    TEACHER_EDITABLE_STATUSES,
    new_document_document,
    new_event_document,
    new_history_entry,
    new_media_document,
    new_notification_document,
)
from app.schemas.events import (
    EventCreateRequest,
    EventUpdateRequest,
    NotificationCreateRequest,
)
from app.services import email_service
from app.services.storage_service import (
    absolutize,
    delete_event_cascade,
    delete_file,
    file_route,
    media_type_for,
    read_upload,
    safe_file_name,
    store_file,
    validate_document,
)
from app.utils.auth import check_dean, get_current_user, require_role
from app.utils.serializers import serialize, serialize_many, to_object_id, utc_now


router = APIRouter(
    tags=["Events", "Dean", "Teacher"]
)
logger = logging.getLogger(__name__)


# ============================================================
# HELPERS
# ============================================================

EVENT_PUBLIC_FIELDS = (
    "id",
    "teacher_id",
    "event_name",
    "event_date",
    "event_type",
    "location",
    "description",
    "social_network_url",
    "status",
    "rejection_reason",
    "submitted_at",
    "reviewed_at",
    "created_at",
    "updated_at",
)


def find_event_or_404(event_id: str) -> dict:
    object_id = to_object_id(event_id)
    event = events.find_one({"_id": object_id}) if object_id else None

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    return event


def find_teacher_event_or_404(event_id: str, teacher_id: str) -> dict:
    event = find_event_or_404(event_id)

    if event.get("teacher_id") != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this event"
        )

    return event


def ensure_teacher_can_edit(event: dict) -> None:
    if event.get("status") not in TEACHER_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event has already been approved and can no longer be edited."
        )


def update_event(
    event_id: str,
    changes: dict,
    *,
    history: dict | None = None,
) -> dict | None:
    """Apply `changes`, and append `history` to the audit trail in the same
    update, so a status change and its record can never exist one without
    the other."""
    update: dict = {"$set": {**changes, "updated_at": utc_now()}}

    if history is not None:
        update["$push"] = {"history": history}

    return events.find_one_and_update(
        {"_id": to_object_id(event_id)},
        update,
        return_document=True,
    )


def list_media(request: Request, event_id: str) -> list[dict]:
    cursor = event_media.find({"event_id": event_id}).sort("created_at", ASCENDING)
    return [absolutize(request, item, "media_url") for item in serialize_many(cursor)]


def list_documents(request: Request, event_id: str) -> list[dict]:
    cursor = event_documents.find({"event_id": event_id}).sort("created_at", ASCENDING)
    return [absolutize(request, item, "file_url") for item in serialize_many(cursor)]


# ============================================================
# SAFE NOTIFICATION CREATOR
# Notification creation errors must never block event actions
# ============================================================

def safe_create_notification(
    user_id: str,
    event_id: str | None,
    notification_type: str,
    title: str,
    message: str,
    data: dict | None = None,
) -> dict | None:
    try:
        document = new_notification_document(
            user_id=user_id,
            event_id=event_id,
            notification_type=notification_type,
            title=title,
            message=message,
            data=data,
        )
        result = notifications.insert_one(document)
        document["_id"] = result.inserted_id
        return serialize(document)
    except Exception as err:
        print(
            "Notification creation warning"
            " (non-blocking):",
            err,
        )
        return None


def _send_status_email(
    to_email: str,
    name: str,
    event_name: str,
    email_status: str,
    remarks: str | None,
    event_id: str | None = None,
    stage: str | None = None,
) -> None:
    try:
        email_service.send_event_status_email(
            to_email, name, event_name, email_status, remarks, event_id=event_id, stage=stage
        )
    except email_service.EmailDeliveryError:
        logger.warning("event_status_email_failed status=%s", email_status)


def notify_teacher(
    background_tasks: BackgroundTasks,
    event: dict,
    *,
    notification_type: str,
    title: str,
    message: str,
    data: dict | None = None,
    remarks: str | None = None,
    stage: str | None = None,
) -> None:
    """Create the in-app notification and queue the matching email."""
    teacher_id = event.get("teacher_id", "")

    safe_create_notification(
        user_id=teacher_id,
        event_id=event.get("id"),
        notification_type=notification_type,
        title=title,
        message=message,
        data=data,
    )

    if not email_service.is_configured():
        return

    teacher = users.find_one({"_id": to_object_id(teacher_id)}, {"email": 1, "name": 1})
    if teacher and teacher.get("email"):
        background_tasks.add_task(
            _send_status_email,
            teacher["email"],
            teacher.get("name") or "there",
            event.get("event_name") or "event",
            notification_type,
            remarks,
            event.get("id"),
            stage,
        )


def notify_deans(
    event: dict,
    *,
    notification_type: str,
    title: str,
    message: str,
) -> None:
    """Put an in-app notification in front of every Dean.

    In-app only, deliberately: a Dean reviews every submission on campus, and
    one email per submission would bury the decisions that matter. The bell
    and the dashboard's pending count are where the queue is watched.
    """
    event_id = event.get("id") or (str(event["_id"]) if event.get("_id") else None)

    for dean in users.find({"role": "dean"}, {"_id": 1}):
        safe_create_notification(
            user_id=str(dean["_id"]),
            event_id=event_id,
            notification_type=notification_type,
            title=title,
            message=message,
            data={
                "event_name": event.get("event_name", ""),
                "event_type": event.get("event_type", ""),
                "event_date": event.get("event_date", ""),
            },
        )


# What a Dean is told for each way an event can land in the review queue.
# Keyed by the history action the same request records.
_QUEUE_ANNOUNCEMENTS = {
    "submitted": ("submitted", "New event submitted", "submitted {event} for review."),
    "resubmitted": (
        "resubmitted",
        "Event resubmitted",
        "resubmitted {event} after the requested changes.",
    ),
    "updated": (
        "resubmitted",
        "Submission updated",
        "updated {event} while it was waiting for review.",
    ),
}


def announce_to_deans(event: dict, action: str, teacher: dict) -> None:
    """Tell every Dean an event has entered, or re-entered, their queue."""
    notification_type, title, sentence = _QUEUE_ANNOUNCEMENTS[action]
    who = teacher.get("name") or teacher.get("email") or "A teacher"

    notify_deans(
        event,
        notification_type=notification_type,
        title=title,
        message=f"{who} " + sentence.format(event=f'"{event.get("event_name", "an event")}"'),
    )


# ============================================================
# DEAN DASHBOARD STATS
# ============================================================

@router.get(
    "/dean/dashboard/stats"
)
def dean_dashboard_stats(
    authorization: str | None = Header(
        default=None
    )
):
    user = get_current_user(authorization)
    check_dean(user)

    # Exclude drafts from Dean view
    status_counts = {
        row["_id"]: row["count"]
        for row in events.aggregate(
            [
                {"$match": {"status": {"$ne": "draft"}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]
        )
    }

    def total(*statuses: str) -> int:
        return sum(status_counts.get(item, 0) for item in statuses)

    return {
        "success": True,
        "total_events": sum(status_counts.values()),
        "pending_events": total("pending", "submitted", "under_review"),
        "approved_events": total("approved", "published", "in_progress", "completed"),
        "rejected_events": total("rejected"),
    }


# ============================================================
# GET ALL DEAN EVENTS
#
# Optional filters:
#
# /dean/events
#
# /dean/events?event_date=2026-09-09
#
# /dean/events?event_type=Cultural
#
# /dean/events?event_date=2026-09-09&event_type=Cultural
#
# ============================================================

@router.get(
    "/dean/events"
)
def get_all_events(
    authorization: str | None = Header(
        default=None
    ),

    event_date: str | None = Query(
        default=None
    ),

    event_type: str | None = Query(
        default=None
    ),
):
    user = get_current_user(authorization)
    check_dean(user)

    # --------------------------------------------------------
    # VALIDATE DATE
    # --------------------------------------------------------

    if event_date:
        try:
            date.fromisoformat(event_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invalid date format. "
                    "Use YYYY-MM-DD."
                )
            )

    # --------------------------------------------------------
    # VALIDATE EVENT TYPE
    # --------------------------------------------------------

    normalized_event_type = None

    if event_type:
        normalized_event_type = event_type.strip()

        matching_type = next(
            (
                item
                for item in ALLOWED_EVENT_TYPES
                if item.lower() == normalized_event_type.lower()
            ),
            None
        )

        if not matching_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invalid event type. "
                    "Allowed values: "
                    + ", ".join(ALLOWED_EVENT_TYPES)
                    + "."
                )
            )

        normalized_event_type = matching_type

    # --------------------------------------------------------
    # BUILD QUERY
    # --------------------------------------------------------

    # Deans only review submitted events, never drafts
    query: dict = {"status": {"$ne": "draft"}}

    if event_date:
        query["event_date"] = event_date

    if normalized_event_type:
        query["event_type"] = normalized_event_type

    cursor = events.find(query).sort("created_at", DESCENDING)
    event_list = serialize_many(cursor)

    return {
        "success": True,
        "events": event_list,
        "total": len(event_list),

        "filters": {
            "event_date": event_date,
            "event_type": normalized_event_type,
        },
    }


# ============================================================
# GET SINGLE DEAN EVENT
# ============================================================

@router.get(
    "/dean/events/{event_id}"
)
def get_dean_event(
    event_id: str,
    authorization: str | None = Header(
        default=None
    )
):
    user = get_current_user(authorization)
    check_dean(user)

    event = find_event_or_404(event_id)

    if event.get("status") == "draft":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    return {
        "success": True,
        "event": serialize(event),
    }


# ============================================================
# GET EVENT MEDIA
# ============================================================

@router.get(
    "/dean/events/{event_id}/media"
)
def get_event_media(
    event_id: str,
    request: Request,
    authorization: str | None = Header(
        default=None
    )
):
    user = get_current_user(authorization)
    check_dean(user)

    event = find_event_or_404(event_id)

    media = list_media(request, str(event["_id"]))

    return {
        "success": True,
        "event_id": event_id,
        "media": media,
        "total": len(media),
    }


# ============================================================
# APPROVE EVENT
# ============================================================

@router.patch(
    "/dean/events/{event_id}/approve"
)
def approve_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(
        default=None
    )
):
    user = get_current_user(authorization)
    check_dean(user)

    existing = find_event_or_404(event_id)

    approved_event = serialize(
        update_event(
            event_id,
            {
                "status": "approved",
                "rejection_reason": None,
                "reviewed_at": utc_now(),
            },
            history=new_history_entry(
                action="approved",
                status="approved",
                from_status=existing.get("status"),
                actor=user,
            ),
        )
    )

    if not approved_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    # --- Notification Trigger ---
    notify_teacher(
        background_tasks,
        approved_event,
        notification_type="approved",
        title="Event Approved",
        message=(
            f'Your "{approved_event.get("event_name", "event")}"'
            " event has been approved by the Dean."
        ),
        data={
            "event_name": approved_event.get("event_name", ""),
            "event_date": approved_event.get("event_date", ""),
        },
    )

    return {
        "success": True,
        "message": "Event approved successfully",
        "event": approved_event,
    }


# ============================================================
# REJECT EVENT
# ============================================================

@router.patch(
    "/dean/events/{event_id}/reject"
)
def reject_event(
    event_id: str,
    rejection_reason: str,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(
        default=None
    )
):
    user = get_current_user(authorization)
    check_dean(user)

    if not rejection_reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required"
        )

    existing = find_event_or_404(event_id)

    rejected_event = serialize(
        update_event(
            event_id,
            {
                "status": "rejected",
                "rejection_reason": rejection_reason.strip(),
                "reviewed_at": utc_now(),
            },
            history=new_history_entry(
                action="rejected",
                status="rejected",
                from_status=existing.get("status"),
                actor=user,
                note=rejection_reason,
            ),
        )
    )

    if not rejected_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    # --- Notification Trigger ---
    notify_teacher(
        background_tasks,
        rejected_event,
        notification_type="rejected",
        title="Event Rejected",
        message=(
            f'Your "{rejected_event.get("event_name", "event")}"'
            " event was rejected by the Dean."
            f" Reason: {rejection_reason.strip()}"
        ),
        data={
            "event_name": rejected_event.get("event_name", ""),
            "rejection_reason": rejection_reason.strip(),
        },
        remarks=rejection_reason.strip(),
    )

    return {
        "success": True,
        "message": "Event rejected successfully",
        "event": rejected_event,
    }


# ============================================================
# DEAN UPDATE PROGRESS STAGE
#
# Post-approval delivery tracking only. Approve and reject keep
# their own endpoints; this moves an already-approved event
# between Approved -> In Progress -> Completed.
# ============================================================

@router.patch(
    "/dean/events/{event_id}/stage"
)
def update_event_stage(
    event_id: str,
    background_tasks: BackgroundTasks,
    stage: str = Query(...),
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    check_dean(user)

    normalized_stage = (stage or "").strip().lower()

    if normalized_stage not in DEAN_PROGRESS_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid stage. Allowed values: "
                "approved, in_progress, completed."
            ),
        )

    existing = find_event_or_404(event_id)

    # Delivery stages only make sense once the event has been approved.
    if existing.get("status") not in DEAN_PROGRESS_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only an approved event can be moved through the "
                "progress stages."
            ),
        )

    updated = update_event(
        event_id,
        {"status": normalized_stage},
        history=new_history_entry(
            action="stage_changed",
            status=normalized_stage,
            from_status=existing.get("status"),
            actor=user,
        ),
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    staged_event = serialize(updated)

    # A no-op move (already at that stage) changes nothing the teacher needs
    # to hear about.
    if existing.get("status") != normalized_stage:
        stage_text = {
            "in_progress": "marked in progress",
            "completed": "marked completed",
            "approved": "moved back to approved",
        }[normalized_stage]

        notify_teacher(
            background_tasks,
            staged_event,
            notification_type="progress",
            title=f"Event {stage_text}",
            message=(
                f'Your "{staged_event.get("event_name", "event")}"'
                f" event was {stage_text} by the Dean."
            ),
            data={
                "event_name": staged_event.get("event_name", ""),
                "stage": normalized_stage,
            },
            stage=normalized_stage,
        )

    return {
        "success": True,
        "message": "Event stage updated successfully",
        "event": staged_event,
    }


# ============================================================
# DEAN REQUEST CHANGES ON EVENT
# ============================================================

@router.patch(
    "/dean/events/{event_id}/request-changes"
)
def request_changes_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    remarks: str = Query(default=""),
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    check_dean(user)

    if not remarks.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Remarks are required"
        )

    existing = find_event_or_404(event_id)

    changed_event = serialize(
        update_event(
            event_id,
            {
                "status": "rejected",
                "rejection_reason": remarks.strip(),
                "reviewed_at": utc_now(),
            },
            history=new_history_entry(
                action="changes_requested",
                status="rejected",
                from_status=existing.get("status"),
                actor=user,
                note=remarks,
            ),
        )
    )

    if not changed_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )

    notify_teacher(
        background_tasks,
        changed_event,
        notification_type="needs_changes",
        title="Event Needs Changes",
        message=(
            f'Your "{changed_event.get("event_name", "event")}"'
            " event needs changes before approval."
            f" Remarks: {remarks.strip()}"
        ),
        data={
            "event_name": changed_event.get("event_name", ""),
            "remarks": remarks.strip(),
        },
        remarks=remarks.strip(),
    )

    return {
        "success": True,
        "message": "Changes requested for event",
        "event": changed_event,
    }


# ============================================================
# TEACHER EVENTS
# ============================================================

@router.get(
    "/teacher/events"
)
def get_teacher_events(
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    cursor = events.find({"teacher_id": user["id"]}).sort("created_at", DESCENDING)
    event_list = serialize_many(cursor)

    return {
        "success": True,
        "events": event_list,
        "total": len(event_list),
    }


@router.post(
    "/teacher/events",
    status_code=status.HTTP_201_CREATED,
)
def create_teacher_event(
    payload: EventCreateRequest,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    # A draft is held back from the dean until the teacher submits it; anything
    # else goes straight into the review queue.
    new_status = "draft" if payload.save_as_draft else "pending"

    document = new_event_document(
        teacher_id=user["id"],
        event_name=payload.event_name,
        event_date=payload.event_date,
        event_type=payload.event_type,
        location=payload.location,
        description=payload.description,
        social_network_url=payload.social_network_url,
        status=new_status,
        history=[
            new_history_entry(
                action="created" if payload.save_as_draft else "submitted",
                status=new_status,
                actor=user,
            ),
        ],
    )

    result = events.insert_one(document)
    document["_id"] = result.inserted_id

    if not payload.save_as_draft:
        announce_to_deans(document, "submitted", user)

    return {
        "success": True,
        "message": (
            "Draft saved"
            if payload.save_as_draft
            else "Event submitted successfully for Dean approval"
        ),
        "event": serialize(document),
    }


@router.get(
    "/teacher/events/{event_id}"
)
def get_teacher_event(
    event_id: str,
    request: Request,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    event_key = str(event["_id"])

    return {
        "success": True,
        "event": serialize(event),
        "media": list_media(request, event_key),
        "documents": list_documents(request, event_key),
    }


@router.patch(
    "/teacher/events/{event_id}"
)
def update_teacher_event(
    event_id: str,
    payload: EventUpdateRequest,
    authorization: str | None = Header(
        default=None
    ),
):
    """Edit an event that is still in the teacher's hands.

    By default the edit resubmits the event for approval. With `save_as_draft`
    the event stays a draft, which is what the create-event wizard uses while
    the teacher is still filling it in.
    """
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    ensure_teacher_can_edit(event)

    # Only an event that is already a draft may stay one. Without this, a
    # teacher could pull an event back out of the dean's queue after submitting
    # it and the dean would never know it had gone.
    if payload.save_as_draft and event.get("status") != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event has already been submitted and can no longer be saved as a draft.",
        )

    changes = {
        "event_name": payload.event_name,
        "event_date": payload.event_date,
        "event_type": payload.event_type,
        "location": payload.location,
        "description": payload.description,
        "social_network_url": payload.social_network_url,
        "rejection_reason": None,
    }

    history = None
    previous_status = event.get("status")

    if payload.save_as_draft:
        changes["status"] = "draft"
        changes["submitted_at"] = None
        # Draft saves are the wizard autosaving while the teacher types; they
        # are not steps anyone needs to see in the trail.
    else:
        changes["status"] = "pending"
        changes["submitted_at"] = utc_now()

        if previous_status == "draft":
            action = "submitted"
        elif previous_status == "rejected":
            action = "resubmitted"
        else:
            action = "updated"  # edited while still waiting in the queue

        history = new_history_entry(
            action=action,
            status="pending",
            from_status=previous_status,
            actor=user,
        )

    updated = update_event(event_id, changes, history=history)

    if history is not None and updated:
        announce_to_deans(serialize(updated), history["action"], user)

    return {
        "success": True,
        "message": (
            "Draft saved"
            if payload.save_as_draft
            else "Event updated and resubmitted for approval"
        ),
        "event": serialize(updated),
    }


@router.delete(
    "/teacher/events/{event_id}"
)
def delete_teacher_event(
    event_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])

    if event.get("status") not in TEACHER_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An approved event can no longer be deleted."
        )

    delete_event_cascade(str(event["_id"]))

    return {
        "success": True,
        "message": "Event deleted successfully",
    }


# ============================================================
# TEACHER RESUBMIT EVENT
# ============================================================

@router.patch(
    "/teacher/events/{event_id}/resubmit"
)
def teacher_resubmit_event(
    event_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    ensure_teacher_can_edit(event)

    updated = update_event(
        event_id,
        {
            "status": "pending",
            "rejection_reason": None,
            "submitted_at": utc_now(),
        },
        history=new_history_entry(
            action="resubmitted" if event.get("status") == "rejected" else "submitted",
            status="pending",
            from_status=event.get("status"),
            actor=user,
        ),
    )

    if updated:
        announce_to_deans(
            serialize(updated),
            "resubmitted" if event.get("status") == "rejected" else "submitted",
            user,
        )

    return {
        "success": True,
        "message": "Event resubmitted for approval",
        "event": serialize(updated or event),
    }


# ============================================================
# TEACHER MEDIA (photos / videos stored in GridFS)
# ============================================================

@router.get(
    "/teacher/events/{event_id}/media"
)
def get_teacher_event_media(
    event_id: str,
    request: Request,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    media = list_media(request, str(event["_id"]))

    return {
        "success": True,
        "event_id": event_id,
        "media": media,
        "total": len(media),
    }


@router.post(
    "/teacher/events/{event_id}/media",
    status_code=status.HTTP_201_CREATED,
)
def upload_teacher_event_media(
    event_id: str,
    request: Request,
    file: UploadFile = File(...),
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    ensure_teacher_can_edit(event)

    media_type = media_type_for(file)
    data = read_upload(file)
    file_name = safe_file_name(file.filename)

    file_id = store_file(
        data,
        filename=file_name,
        content_type=file.content_type,
        kind="media",
        event_id=str(event["_id"]),
        teacher_id=user["id"],
    )

    document = new_media_document(
        event_id=str(event["_id"]),
        file_id=str(file_id),
        file_name=file_name,
        media_url=file_route(file_id),
        media_type=media_type,
        content_type=file.content_type,
        file_size=len(data),
    )

    result = event_media.insert_one(document)
    document["_id"] = result.inserted_id

    return {
        "success": True,
        "message": "Media uploaded successfully",
        "media": absolutize(request, serialize(document), "media_url"),
    }


@router.delete(
    "/teacher/events/{event_id}/media/{media_id}"
)
def delete_teacher_event_media(
    event_id: str,
    media_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    ensure_teacher_can_edit(event)

    media = event_media.find_one_and_delete(
        {"_id": to_object_id(media_id), "event_id": str(event["_id"])}
    )

    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )

    delete_file(media.get("file_id"))

    return {
        "success": True,
        "message": "Media deleted successfully",
    }


# ============================================================
# TEACHER DOCUMENTS (stored in GridFS)
# ============================================================

@router.get(
    "/teacher/events/{event_id}/documents"
)
def get_teacher_event_documents(
    event_id: str,
    request: Request,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    documents = list_documents(request, str(event["_id"]))

    return {
        "success": True,
        "event_id": event_id,
        "documents": documents,
        "total": len(documents),
    }


@router.post(
    "/teacher/events/{event_id}/documents",
    status_code=status.HTTP_201_CREATED,
)
def upload_teacher_event_document(
    event_id: str,
    request: Request,
    file: UploadFile = File(...),
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    ensure_teacher_can_edit(event)

    validate_document(file)
    data = read_upload(file)
    original_name = (file.filename or "document").strip() or "document"

    file_id = store_file(
        data,
        filename=original_name,
        content_type=file.content_type,
        kind="document",
        event_id=str(event["_id"]),
        teacher_id=user["id"],
    )

    document = new_document_document(
        event_id=str(event["_id"]),
        file_id=str(file_id),
        file_name=original_name,
        file_url=file_route(file_id),
        file_type=file.content_type,
        file_size=len(data),
    )

    result = event_documents.insert_one(document)
    document["_id"] = result.inserted_id

    return {
        "success": True,
        "message": "Document uploaded successfully",
        "document": absolutize(request, serialize(document), "file_url"),
    }


@router.delete(
    "/teacher/events/{event_id}/documents/{document_id}"
)
def delete_teacher_event_document(
    event_id: str,
    document_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    ensure_teacher_can_edit(event)

    document = event_documents.find_one_and_delete(
        {"_id": to_object_id(document_id), "event_id": str(event["_id"])}
    )

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    delete_file(document.get("file_id"))

    return {
        "success": True,
        "message": "Document deleted successfully",
    }


# ============================================================
# NOTIFICATIONS
#
# Every signed-in role reads and clears its own notifications here:
# every query is scoped to the caller's user id, so a Dean sees queue
# updates and a teacher sees decisions on their own events. The
# /teacher/... paths are the original ones, kept so existing clients
# keep working; /notifications is the role-neutral name.
# ============================================================

@router.get("/notifications")
@router.get(
    "/teacher/notifications"
)
def get_teacher_notifications(
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)

    cursor = notifications.find({"user_id": user["id"]}).sort("created_at", DESCENDING)
    notification_list = serialize_many(cursor)

    return {
        "success": True,
        "notifications": notification_list,
        "total": len(notification_list),
    }


@router.post("/notifications", status_code=status.HTTP_201_CREATED)
@router.post(
    "/teacher/notifications",
    status_code=status.HTTP_201_CREATED,
)
def create_teacher_notification(
    payload: NotificationCreateRequest,
    authorization: str | None = Header(
        default=None
    ),
):
    """Client-generated notifications, such as event-date reminders."""
    user = get_current_user(authorization)

    notification = safe_create_notification(
        user_id=user["id"],
        event_id=payload.event_id,
        notification_type=payload.notification_type,
        title=payload.title,
        message=payload.message,
        data=payload.data,
    )

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create notification"
        )

    return {
        "success": True,
        "notification": notification,
    }


@router.patch("/notifications/read-all")
@router.patch(
    "/teacher/notifications/read-all"
)
def mark_all_notifications_read(
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)

    notifications.update_many(
        {"user_id": user["id"], "is_read": False},
        {"$set": {"is_read": True, "read_at": utc_now()}},
    )

    return {
        "success": True,
        "message": "All notifications marked as read",
    }


@router.patch("/notifications/{notification_id}/read")
@router.patch(
    "/teacher/notifications/{notification_id}/read"
)
def mark_notification_read(
    notification_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)

    result = notifications.update_one(
        {"_id": to_object_id(notification_id), "user_id": user["id"]},
        {"$set": {"is_read": True, "read_at": utc_now()}},
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    return {
        "success": True,
        "message": "Notification marked as read",
    }
