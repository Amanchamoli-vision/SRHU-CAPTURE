import logging
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
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
    event_reports,
    events,
    notifications,
    users,
)
from app.models.documents import (
    ALLOWED_EVENT_TYPES,
    APPROVED_STAGES,
    DEAN_PROGRESS_STAGES,
    TEACHER_EDITABLE_STATUSES,
    new_document_document,
    new_event_document,
    new_history_entry,
    new_media_document,
    new_notification_document,
)
from app.schemas.events import (
    DeanDecisionBody,
    EventCreateRequest,
    EventUpdateRequest,
    NotificationCreateRequest,
)
from app.services import email_service
from app.services.storage_service import (
    MAX_EVENT_DOCUMENTS,
    MAX_EVENT_PHOTOS,
    MAX_EVENT_VIDEOS,
    absolutize,
    check_file_signature,
    delete_event_cascade,
    delete_stored,
    inspect_document,
    inspect_media,
    read_upload,
    safe_file_name,
    save_upload,
)
from app.utils.auth import check_dean, check_event_viewer, get_current_user, require_role
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


# Statuses a Dean decision (approve / reject / request changes) may start
# from. "pending" is what every submission is stored as; "submitted" and
# "under_review" are reserved lifecycle values that mean the same thing to a
# Dean (the dashboard counts all three as pending).
DEAN_REVIEWABLE_STATUSES = ("pending", "submitted", "under_review")

# Statuses from which /resubmit puts an event (back) in the review queue.
RESUBMITTABLE_STATUSES = ("rejected", "draft")

CHANGED_WHILE_EDITING = (
    "This event was changed by someone else while you were working on it. "
    "Please reload it and try again."
)


def conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def update_event(
    event_id: str,
    changes: dict,
    *,
    history: dict | None = None,
    expected_status: str | None = None,
) -> dict | None:
    """Apply `changes`, and append `history` to the audit trail in the same
    update, so a status change and its record can never exist one without
    the other.

    With `expected_status` the write only happens if the event still has that
    status, which makes check-then-write transitions atomic: a None result
    then means the status moved underneath the caller (or the event is gone).
    """
    update: dict = {"$set": {**changes, "updated_at": utc_now()}}

    if history is not None:
        update["$push"] = {"history": history}

    query: dict = {"_id": to_object_id(event_id)}
    if expected_status is not None:
        query["status"] = expected_status

    return events.find_one_and_update(
        query,
        update,
        return_document=True,
    )


def invalidate_report(event_id: str) -> None:
    """Drop a generated report: the event it described has changed."""
    event_reports.delete_many({"event_id": event_id})


def page(cursor, skip: int | None, limit: int | None):
    if skip:
        cursor = cursor.skip(skip)
    if limit:
        cursor = cursor.limit(limit)
    return cursor


def find_dean_visible_event_or_404(event_id: str) -> dict:
    """An event as a Dean may see it: drafts are reported as missing."""
    event = find_event_or_404(event_id)
    if event.get("status") == "draft":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    return event


def dean_transition(
    event_id: str,
    *,
    verb: str,
    changes: dict,
    history_action: str,
    new_status: str,
    user: dict,
    note: str | None = None,
) -> dict:
    """Move a pending event to `new_status`, atomically.

    Only an event awaiting review may be decided; anything else is a 409
    (a double-click, a second Dean, or a stale page). The write is filtered
    on the status that was checked, so two racing decisions cannot both win.
    """
    existing = find_dean_visible_event_or_404(event_id)
    current = existing.get("status")

    if current not in DEAN_REVIEWABLE_STATUSES:
        if verb == "approve" and current in APPROVED_STAGES:
            raise conflict("This event is already approved.")
        if verb == "reject" and current == "rejected":
            raise conflict("This event has already been rejected.")
        raise conflict({
            "approve": "Only pending events can be approved.",
            "reject": "Only pending events can be rejected.",
            "request changes": "Changes can only be requested on pending events.",
        }[verb])

    updated = update_event(
        event_id,
        changes,
        history=new_history_entry(
            action=history_action,
            status=new_status,
            from_status=current,
            actor=user,
            note=note,
        ),
        expected_status=current,
    )

    if not updated:
        find_event_or_404(event_id)  # 404 if it was deleted meanwhile
        raise conflict("This event was updated by someone else. Please reload it.")

    return serialize(updated)


def _decision_text(query_value: str | None, body: DeanDecisionBody | None, field: str) -> str:
    """The reason/remarks from the query string, else from the JSON body."""
    if query_value and query_value.strip():
        return query_value.strip()
    body_value = getattr(body, field, None) if body is not None else None
    return (body_value or "").strip()


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

    # Optional paging. No default cap: the Dean pages filter the whole list
    # client-side, and a silent cap would hide events from them.
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=1000),
):
    user = get_current_user(authorization)
    check_event_viewer(user)

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

    cursor = page(events.find(query).sort("created_at", DESCENDING), skip, limit)
    event_list = serialize_many(cursor)

    return {
        "success": True,
        "events": event_list,
        "total": len(event_list),
        "skip": skip or 0,
        "limit": limit,

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
    check_event_viewer(user)

    event = find_dean_visible_event_or_404(event_id)

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
    check_event_viewer(user)

    event = find_dean_visible_event_or_404(event_id)

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

    approved_event = dean_transition(
        event_id,
        verb="approve",
        changes={
            "status": "approved",
            "rejection_reason": None,
            "reviewed_at": utc_now(),
        },
        history_action="approved",
        new_status="approved",
        user=user,
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
    background_tasks: BackgroundTasks,
    rejection_reason: str | None = Query(default=None),
    body: DeanDecisionBody | None = Body(default=None),
    authorization: str | None = Header(
        default=None
    )
):
    """Reject a pending event. The reason may come as the
    `rejection_reason` query parameter or as a JSON body
    `{"rejection_reason": "..."}` (preferred: no URL length limit, and it
    stays out of access logs)."""
    user = get_current_user(authorization)
    check_dean(user)

    rejection_reason = _decision_text(rejection_reason, body, "rejection_reason")

    if not rejection_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required"
        )

    rejected_event = dean_transition(
        event_id,
        verb="reject",
        changes={
            "status": "rejected",
            "rejection_reason": rejection_reason,
            "reviewed_at": utc_now(),
        },
        history_action="rejected",
        new_status="rejected",
        user=user,
        note=rejection_reason,
    )
    invalidate_report(rejected_event["id"])

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
        expected_status=existing.get("status"),
    )

    if not updated:
        find_event_or_404(event_id)
        raise conflict("This event was updated by someone else. Please reload it.")

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
    body: DeanDecisionBody | None = Body(default=None),
    authorization: str | None = Header(
        default=None
    ),
):
    """Send a pending event back to the teacher. Stored as "rejected" (the
    status in which the teacher can edit and resubmit) with a
    "changes_requested" history entry. `remarks` may come from the query
    string or a JSON body `{"remarks": "..."}`."""
    user = get_current_user(authorization)
    check_dean(user)

    remarks = _decision_text(remarks, body, "remarks")

    if not remarks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Remarks are required"
        )

    changed_event = dean_transition(
        event_id,
        verb="request changes",
        changes={
            "status": "rejected",
            "rejection_reason": remarks,
            "reviewed_at": utc_now(),
        },
        history_action="changes_requested",
        new_status="rejected",
        user=user,
        note=remarks,
    )
    invalidate_report(changed_event["id"])

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
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=1000),
):
    user = get_current_user(authorization)
    require_role(user, "teacher")

    cursor = page(
        events.find({"teacher_id": user["id"]}).sort("created_at", DESCENDING), skip, limit
    )
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
    already_queued = previous_status in DEAN_REVIEWABLE_STATUSES

    if payload.save_as_draft:
        changes["status"] = "draft"
        changes["submitted_at"] = None
        # Draft saves are the wizard autosaving while the teacher types; they
        # are not steps anyone needs to see in the trail.
    else:
        changes["status"] = "pending"
        # An edit while waiting keeps the event's place in the queue.
        if not already_queued or not event.get("submitted_at"):
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

    # Filtered on the status just checked: if a Dean decided in between, the
    # edit must not silently undo the decision.
    updated = update_event(
        event_id, changes, history=history, expected_status=previous_status
    )

    if not updated:
        find_teacher_event_or_404(event_id, user["id"])
        raise conflict(CHANGED_WHILE_EDITING)

    invalidate_report(str(event["_id"]))

    # Deans hear about an event when it enters their queue, not on every
    # save of an event already in it.
    if history is not None and not already_queued:
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

    # Remove the event itself first, and only if it still has the status just
    # checked, so a Dean's approval in between cannot be deleted away.
    result = events.delete_one(
        {"_id": event["_id"], "teacher_id": user["id"], "status": event.get("status")}
    )
    if result.deleted_count == 0:
        find_teacher_event_or_404(event_id, user["id"])
        raise conflict(CHANGED_WHILE_EDITING)

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

    previous_status = event.get("status")

    # Only an event that is out of the queue can be (re)submitted; resubmitting
    # one that is already waiting would just notify every Dean again.
    if previous_status not in RESUBMITTABLE_STATUSES:
        raise conflict("This event is already waiting for the Dean's review.")

    action = "resubmitted" if previous_status == "rejected" else "submitted"

    updated = update_event(
        event_id,
        {
            "status": "pending",
            "rejection_reason": None,
            "submitted_at": utc_now(),
        },
        history=new_history_entry(
            action=action,
            status="pending",
            from_status=previous_status,
            actor=user,
        ),
        expected_status=previous_status,
    )

    if not updated:
        find_teacher_event_or_404(event_id, user["id"])
        raise conflict(CHANGED_WHILE_EDITING)

    invalidate_report(str(event["_id"]))
    announce_to_deans(serialize(updated), action, user)

    return {
        "success": True,
        "message": "Event resubmitted for approval",
        "event": serialize(updated),
    }


# ============================================================
# UPLOAD BOOKKEEPING
# ============================================================

_CAP_LABELS = {"image": "photos", "video": "videos", "document": "documents"}


def _cap_error(cap: int, kind: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"An event can have at most {cap} {_CAP_LABELS.get(kind, 'files')}.",
    )


def _ensure_under_cap(collection, cap_query: dict, cap: int, kind: str) -> None:
    """Refuse an upload up front when the event already has `cap` of them."""
    if collection.count_documents(cap_query) >= cap:
        raise _cap_error(cap, kind)


def _event_still_editable(event: dict) -> bool:
    return bool(events.find_one(
        {"_id": event["_id"], "status": {"$in": list(TEACHER_EDITABLE_STATUSES)}},
        {"_id": 1},
    ))


def _record_upload(
    collection,
    document: dict,
    stored: dict,
    event: dict,
    cap_query: dict,
    cap: int,
    kind: str,
) -> None:
    """Insert the metadata record for bytes that were just stored, keeping
    the two consistent.

    - If the insert fails, the stored object is deleted (no orphan).
    - If the event was deleted or approved while the file was uploading, the
      record and object are removed again and the request is a 409.
    - If concurrent uploads pushed the event past its cap, the later ones
      (by insertion order) are removed and get a 400.
    """
    try:
        result = collection.insert_one(document)
    except Exception:
        delete_stored(stored)
        raise
    document["_id"] = result.inserted_id

    def roll_back() -> None:
        collection.delete_one({"_id": result.inserted_id})
        delete_stored(stored)

    if not _event_still_editable(event):
        roll_back()
        raise conflict(
            "This event was approved or deleted while the file was uploading, "
            "so the file was not added."
        )

    past_cap = [
        item["_id"]
        for item in collection.find(cap_query, {"_id": 1}).sort("_id", ASCENDING)
    ][cap:]
    if result.inserted_id in past_cap:
        roll_back()
        raise _cap_error(cap, kind)


def _delete_attachment(collection, record_id: str, event: dict, not_found: str) -> None:
    """Delete one media/document record and its bytes, unless the event left
    the editable statuses in the meantime (then the record is restored)."""
    record = collection.find_one_and_delete(
        {"_id": to_object_id(record_id), "event_id": str(event["_id"])}
    )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found
        )

    if not _event_still_editable(event):
        collection.insert_one(record)
        raise conflict(CHANGED_WHILE_EDITING)

    delete_stored(record)


# ============================================================
# TEACHER MEDIA (photos / videos, stored in R2 or GridFS)
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
    event_key = str(event["_id"])

    info = inspect_media(file)
    media_type = info["kind"]
    cap = MAX_EVENT_PHOTOS if media_type == "image" else MAX_EVENT_VIDEOS
    cap_query = {"event_id": event_key, "media_type": media_type}
    _ensure_under_cap(event_media, cap_query, cap, media_type)

    data = read_upload(file)
    check_file_signature(info["extension"], data)
    file_name = safe_file_name(file.filename)

    stored = save_upload(
        data,
        file_name=file_name,
        content_type=info["content_type"],
        kind="media",
        event_id=event_key,
        teacher_id=user["id"],
    )

    document = new_media_document(
        event_id=event_key,
        storage=stored["storage"],
        object_key=stored["object_key"],
        file_id=stored["file_id"],
        file_name=file_name,
        media_url=stored["url"],
        media_type=media_type,
        content_type=info["content_type"],
        file_size=len(data),
    )

    _record_upload(event_media, document, stored, event, cap_query, cap, media_type)

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

    _delete_attachment(event_media, media_id, event, "Media not found")

    return {
        "success": True,
        "message": "Media deleted successfully",
    }


# ============================================================
# TEACHER DOCUMENTS (stored in R2 or GridFS)
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
    event_key = str(event["_id"])

    info = inspect_document(file)
    cap_query = {"event_id": event_key}
    _ensure_under_cap(event_documents, cap_query, MAX_EVENT_DOCUMENTS, "document")

    data = read_upload(file)
    check_file_signature(info["extension"], data)
    original_name = (file.filename or "document").strip()[:255] or "document"

    stored = save_upload(
        data,
        file_name=original_name,
        content_type=info["content_type"],
        kind="documents",
        event_id=event_key,
        teacher_id=user["id"],
    )

    document = new_document_document(
        event_id=event_key,
        storage=stored["storage"],
        object_key=stored["object_key"],
        file_id=stored["file_id"],
        file_name=original_name,
        file_url=stored["url"],
        file_type=info["content_type"],
        file_size=len(data),
    )

    _record_upload(
        event_documents, document, stored, event, cap_query, MAX_EVENT_DOCUMENTS, "document"
    )

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

    _delete_attachment(event_documents, document_id, event, "Document not found")

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
    limit: int = Query(default=100, ge=1, le=500),
):
    """The caller's notifications, newest first, at most `limit` of them."""
    user = get_current_user(authorization)

    cursor = (
        notifications.find({"user_id": user["id"]})
        .sort("created_at", DESCENDING)
        .limit(limit)
    )
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
    """Client-generated notifications: only the event-date reminders the
    frontend builds (type and `data` size are checked by the schema). A
    reminder may only point at one of the caller's own events."""
    user = get_current_user(authorization)

    if payload.event_id:
        object_id = to_object_id(payload.event_id)
        event = (
            events.find_one({"_id": object_id}, {"teacher_id": 1}) if object_id else None
        )
        if not event or event.get("teacher_id") != user["id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A notification can only refer to one of your own events."
            )

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
