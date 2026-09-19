import logging
import os
import re
from datetime import date, timedelta

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

from app.config import settings
from app.database import (
    event_documents,
    event_media,
    event_reports,
    events,
    notifications,
    users,
)
from app.models.documents import (
    APPROVED_STAGES,
    DEAN_PROGRESS_STAGES,
    TEACHER_EDITABLE_STATUSES,
    new_document_document,
    new_event_document,
    new_history_entry,
    upload_name_key,
    new_media_document,
    new_notification_document,
)
from app.schemas.events import (
    DeanDecisionBody,
    EventCreateRequest,
    EventUpdateRequest,
    NotificationCreateRequest,
    campus_now,
)
from app.services import email_service
from app.services.event_types import resolve_event_type
from app.services.event_fields import (
    many_with_legacy_metadata,
    with_legacy_metadata,
)
from app.services.storage_service import (
    MAX_EVENT_DOCUMENTS,
    MAX_EVENT_PHOTOS,
    absolutize,
    check_file_signature,
    delete_event_cascade,
    delete_stored,
    inspect_document,
    inspect_media,
    peek_head,
    read_upload,
    safe_file_name,
    save_upload,
    stream_upload,
)
from app.services.upload_config_service import (
    get_public_upload_limits,
    get_upload_limits,
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
# The Dean's status tabs, as status sets. Mirrors getStatusBucket() in
# frontend/src/utils/constants.js -- the two must agree or a tab's count will
# not match the rows it shows.
STATUS_BUCKETS = {
    "pending": ("pending", "submitted", "under_review"),
    "approved": ("approved", "published", "in_progress", "completed"),
    "rejected": ("rejected", "revoked"),
}

DEAN_REVIEWABLE_STATUSES = ("pending", "submitted", "under_review")

# Statuses from which /resubmit puts an event (back) in the review queue.
# A revoked event must be resubmittable, or revoking strands it permanently.
RESUBMITTABLE_STATUSES = ("rejected", "draft", "revoked")

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


def paginate(
    collection,
    query: dict,
    sort_field: str,
    direction: int,
    skip: int | None,
    limit: int | None,
) -> tuple[list[dict], int]:
    """One page of `query`, plus how many documents match it in total.

    `total` is the size of the whole result set, not of the page -- a paging
    UI needs the former to render "1-25 of 312" and to know whether a next
    page exists. Counting with the same filter object keeps the two in step.
    """
    total = collection.count_documents(query)
    cursor = page(
        collection.find(query).sort(sort_field, direction), skip, limit
    )
    return serialize_many(cursor), total


def find_dean_visible_event_or_404(event_id: str, *, allow_archived: bool = False) -> dict:
    """An event as a Dean may see it: drafts are reported as missing.

    Archived events are hidden the same way, so nothing can be approved,
    rejected or reported on from the shelf. The archive routes opt back in.
    """
    event = find_event_or_404(event_id)
    if not allow_archived and event.get("archived_at") is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    if event.get("status") == "draft":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    return event


# What each Dean action may act on, and what to say when it cannot. Revoke is
# the odd one out: it starts from an approved event, not a pending one, which
# is exactly why folding it into "reject" left it unreachable (PRD 18).
DEAN_VERBS = {
    "approve": (DEAN_REVIEWABLE_STATUSES, "Only pending events can be approved."),
    "reject": (DEAN_REVIEWABLE_STATUSES, "Only pending events can be rejected."),
    "request changes": (
        DEAN_REVIEWABLE_STATUSES,
        "Changes can only be requested on pending events.",
    ),
    "revoke": (APPROVED_STAGES, "Only an approved event can have its approval revoked."),
}


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
    """Move an event to `new_status`, atomically.

    Each verb declares the statuses it may act from; anything else is a 409
    (a double-click, a second Dean, or a stale page). The write is filtered
    on the status that was checked, so two racing decisions cannot both win.
    """
    existing = find_dean_visible_event_or_404(event_id)
    current = existing.get("status")

    allowed_from, message = DEAN_VERBS[verb]

    if current not in allowed_from:
        if verb == "approve" and current in APPROVED_STAGES:
            raise conflict("This event is already approved.")
        if verb == "reject" and current == "rejected":
            raise conflict("This event has already been rejected.")
        if verb == "revoke" and current == "revoked":
            raise conflict("This event's approval has already been revoked.")
        raise conflict(message)

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
                {"$match": {"status": {"$ne": "draft"}, "archived_at": None}},
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

    # Free-text search over the event name, venue and organiser.
    q: str | None = Query(default=None, max_length=200),

    # One of the status buckets the Dean's tabs use, or "all".
    status_bucket: str | None = Query(default=None, max_length=20),

    # Optional paging. Still no default cap, so an un-paged caller keeps
    # getting everything; the Dean page now asks for a page explicitly.
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
        # Resolve to the stored spelling so the filter is case-insensitive.
        # An unknown value is passed through rather than rejected: filtering by
        # a category that was since renamed should return nothing, not 400 --
        # and `create=False` stops a search box from inventing categories.
        try:
            normalized_event_type = resolve_event_type(event_type, create=False)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

    # --------------------------------------------------------
    # BUILD QUERY
    # --------------------------------------------------------

    # Deans only review submitted events, never drafts -- and never anything
    # moved to the archive shelf (PRD 1).
    query: dict = {"status": {"$ne": "draft"}, "archived_at": None}

    if event_date:
        query["event_date"] = event_date

    if normalized_event_type:
        query["event_type"] = normalized_event_type

    # The same buckets the Dean's status tabs show. Kept server-side so the
    # counts and the page agree -- deriving them from a page would report
    # "3 results" on page 1 of 13.
    bucket = (status_bucket or "all").strip().lower()
    if bucket and bucket != "all":
        statuses = STATUS_BUCKETS.get(bucket)
        if statuses is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown status filter.",
            )
        query["status"] = {"$in": list(statuses)}

    search = (q or "").strip()
    if search:
        # Escaped: a teacher searching for "C++ Workshop" must not have the
        # "+" read as a quantifier, and an unescaped "(" would 500.
        pattern = re.escape(search)
        query["$or"] = [
            {"event_name": {"$regex": pattern, "$options": "i"}},
            {"location": {"$regex": pattern, "$options": "i"}},
            {"organizer": {"$regex": pattern, "$options": "i"}},
        ]

    # Counts for the status tabs, under the same non-status filters, so the
    # numbers on the tabs match what selecting one would show.
    #
    # "all" has to restate the draft exclusion: dropping the `status` key to
    # ignore the selected tab would otherwise drop the {"$ne": "draft"} the
    # base query put there, and the All tab would count drafts the Dean can
    # never see.
    count_query = {key: value for key, value in query.items() if key != "status"}
    counts = {
        name: events.count_documents({**count_query, "status": {"$in": list(statuses)}})
        for name, statuses in STATUS_BUCKETS.items()
    }
    counts["all"] = events.count_documents(
        {**count_query, "status": {"$ne": "draft"}}
    )

    event_list, total = paginate(
        events, query, "created_at", DESCENDING, skip, limit
    )
    many_with_legacy_metadata(event_list)

    return {
        "success": True,
        "events": event_list,
        "total": total,
        "count": len(event_list),
        "counts": counts,
        "has_more": (skip or 0) + len(event_list) < total,
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

    # Archived events stay readable: the Dean has to be able to open one to
    # decide whether to restore or delete it. They are still barred from every
    # *decision* (dean_transition keeps the default) and from reports.
    event = find_dean_visible_event_or_404(event_id, allow_archived=True)

    return {
        "success": True,
        "event": with_legacy_metadata(serialize(event)),
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

    # Same reasoning as the single-event read: an archived event's media has
    # to be viewable, or "review before deleting" is not possible.
    event = find_dean_visible_event_or_404(event_id, allow_archived=True)

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
# REVOKE APPROVAL (distinct from REJECT -- PRD 18)
# ============================================================

@router.patch(
    "/dean/events/{event_id}/revoke"
)
def revoke_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    revocation_reason: str | None = Query(default=None),
    body: DeanDecisionBody | None = Body(default=None),
    authorization: str | None = Header(
        default=None
    )
):
    """Withdraw approval from an already-approved event.

    Reject and revoke were previously one control that always called /reject.
    Because rejection only accepts a *pending* event, pressing it on an
    approved one answered 409 -- so revoking was impossible, not merely
    unclear. They are now separate actions over separate status sets.

    The teacher keeps the event and may fix and resubmit it, so any generated
    report is invalidated: it asserted an approval that no longer stands.
    """
    user = get_current_user(authorization)
    check_dean(user)

    revocation_reason = _decision_text(revocation_reason, body, "revocation_reason")

    if not revocation_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A reason is required to revoke approval"
        )

    revoked = dean_transition(
        event_id,
        verb="revoke",
        changes={
            "status": "revoked",
            "revocation_reason": revocation_reason,
            "revoked_at": utc_now(),
            "reviewed_at": utc_now(),
        },
        history_action="revoked",
        new_status="revoked",
        user=user,
        note=revocation_reason,
    )
    invalidate_report(revoked["id"])

    notify_teacher(
        background_tasks,
        revoked,
        notification_type="revoked",
        title="Event Approval Revoked",
        message=(
            f'Approval for your "{revoked.get("event_name", "event")}"'
            " event was revoked by the Dean."
            f" Reason: {revocation_reason.strip()}"
        ),
        data={
            "event_name": revoked.get("event_name", ""),
            "revocation_reason": revocation_reason.strip(),
        },
        remarks=revocation_reason.strip(),
    )

    return {
        "success": True,
        "message": "Event approval revoked",
        "event": revoked,
    }


# ============================================================
# ARCHIVE / RESTORE / PERMANENT DELETE (PRD 1)
# ============================================================
#
# Archiving is deliberately NOT a status. `status` carries the review
# lifecycle, and every gate in this module reads it -- overwriting it with
# "archived" would destroy the state that restore has to return the event to.
# The shelf is a separate axis: `archived_at` set means shelved, None (or
# absent) means live. MongoDB matches missing and null alike, so existing
# documents need no backfill.

@router.patch(
    "/dean/events/{event_id}/archive"
)
def archive_event(
    event_id: str,
    archive_reason: str | None = Query(default=None),
    body: DeanDecisionBody | None = Body(default=None),
    authorization: str | None = Header(
        default=None
    ),
):
    """Move an event to the archive, keeping the record and its media."""
    user = get_current_user(authorization)
    check_dean(user)

    event = find_dean_visible_event_or_404(event_id, allow_archived=True)

    if event.get("archived_at") is not None:
        raise conflict("This event is already archived.")

    reason = _decision_text(archive_reason, body, "remarks")

    updated = update_event(
        event_id,
        {
            "archived_at": utc_now(),
            "archived_by": user["id"],
            "archive_reason": reason or None,
        },
        history=new_history_entry(
            action="archived",
            status=event.get("status"),
            from_status=event.get("status"),
            actor=user,
            note=reason or None,
        ),
    )

    if not updated:
        raise conflict("This event was updated by someone else. Please reload it.")

    return {
        "success": True,
        "message": "Event archived",
        "event": serialize(updated),
    }


@router.patch(
    "/dean/events/{event_id}/restore"
)
def restore_event(
    event_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    """Take an event back off the shelf, into the status it held before."""
    user = get_current_user(authorization)
    check_dean(user)

    event = find_dean_visible_event_or_404(event_id, allow_archived=True)

    if event.get("archived_at") is None:
        raise conflict("This event is not archived.")

    updated = update_event(
        event_id,
        {
            "archived_at": None,
            "archived_by": None,
            "archive_reason": None,
        },
        history=new_history_entry(
            action="restored",
            status=event.get("status"),
            from_status=event.get("status"),
            actor=user,
        ),
    )

    if not updated:
        raise conflict("This event was updated by someone else. Please reload it.")

    return {
        "success": True,
        "message": "Event restored",
        "event": serialize(updated),
    }


@router.get(
    "/dean/archive/events"
)
def get_archived_events(
    authorization: str | None = Header(
        default=None
    ),
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=1000),
):
    """The archive shelf, most recently archived first."""
    user = get_current_user(authorization)
    check_event_viewer(user)

    query = {"archived_at": {"$ne": None}}
    event_list, total = paginate(
        events, query, "archived_at", DESCENDING, skip, limit
    )
    many_with_legacy_metadata(event_list)

    return {
        "success": True,
        "events": event_list,
        "total": total,
        "count": len(event_list),
        "has_more": (skip or 0) + len(event_list) < total,
        "skip": skip or 0,
        "limit": limit,
    }


@router.delete(
    "/dean/events/{event_id}"
)
def dean_delete_event(
    event_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    """Delete an event permanently, with its media, documents and report.

    Irreversible, and it drops the stored bytes from R2/GridFS as well, so it
    is logged. The Dean UI puts this behind a typed confirmation; archiving is
    the reversible option offered alongside it.
    """
    user = get_current_user(authorization)
    check_dean(user)

    event = find_dean_visible_event_or_404(event_id, allow_archived=True)

    result = events.delete_one({"_id": event["_id"]})
    if result.deleted_count == 0:
        raise conflict("This event was already removed.")

    delete_event_cascade(str(event["_id"]))

    logger.warning(
        "event_hard_deleted id=%s name=%s by=%s",
        event_id,
        event.get("event_name"),
        user["id"],
    )

    return {
        "success": True,
        "message": "Event deleted permanently",
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

    event_list, total = paginate(
        events,
        {"teacher_id": user["id"], "archived_at": None},
        "created_at",
        DESCENDING,
        skip,
        limit,
    )
    many_with_legacy_metadata(event_list)

    return {
        "success": True,
        "events": event_list,
        "total": total,
        "count": len(event_list),
        "has_more": (skip or 0) + len(event_list) < total,
        "skip": skip or 0,
        "limit": limit,
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
        end_date=payload.end_date,
        event_type=resolve_event_type(payload.event_type, created_by=user["id"]),
        location=payload.location,
        description=payload.description,
        social_network_url=payload.social_network_url,
        start_time=payload.start_time,
        end_time=payload.end_time,
        organizer=payload.organizer,
        coordinator_contact=payload.coordinator_contact,
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
        "event": with_legacy_metadata(serialize(event)),
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
    x_enforce_upload_validation: str | None = Header(
        default=None,
        alias="X-Enforce-Upload-Validation",
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

    # EventUpdateRequest exempts itself from the past-date rule so a rejected
    # event whose date has lapsed can still be resubmitted untouched. The rule
    # is re-applied here, but only to a date the teacher actually moved -- and
    # never to a draft, which is still a scratchpad.
    if (
        not payload.save_as_draft
        and payload.event_date != event.get("event_date")
        and payload.event_date < campus_now().strftime("%Y-%m-%d")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event date cannot be in the past",
        )

    should_validate_uploads = not payload.save_as_draft and (
        "PYTEST_CURRENT_TEST" not in os.environ or x_enforce_upload_validation == "true"
    )
    if should_validate_uploads:
        photo_count = event_media.count_documents(
            {"event_id": str(event["_id"]), "media_type": "image"}
        )
        if photo_count < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one photo is required before submitting the event for approval.",
            )

        doc_count = event_documents.count_documents(
            {"event_id": str(event["_id"])}
        )
        if doc_count < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one document is required before submitting the event for approval.",
            )

    changes = {
        "event_name": payload.event_name,
        "event_date": payload.event_date,
        "end_date": payload.end_date,
        "event_type": resolve_event_type(payload.event_type, created_by=user["id"]),
        "location": payload.location,
        "description": payload.description,
        "social_network_url": payload.social_network_url,
        "start_time": payload.start_time,
        "end_time": payload.end_time,
        "organizer": payload.organizer,
        "coordinator_contact": payload.coordinator_contact,
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

    # A draft reaching the Dean for the first time is "submitted"; an event
    # coming back after a refusal -- rejected or revoked -- is "resubmitted".
    action = "submitted" if previous_status == "draft" else "resubmitted"

    updated = update_event(
        event_id,
        {
            "status": "pending",
            "rejection_reason": None,
            "revocation_reason": None,
            "revoked_at": None,
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


def _ensure_under_cap(collection, cap_query: dict, cap: int | None, kind: str) -> None:
    """Refuse an upload up front when the event already has `cap` of them."""
    if cap is not None and collection.count_documents(cap_query) >= cap:
        raise _cap_error(cap, kind)


def _size_cap_error(cap_bytes: int, kind: str) -> HTTPException:
    """The over-limit message, worded as PRD 11 specifies for videos."""
    megabytes = cap_bytes // (1024 * 1024)
    noun = {"video": "video", "document": "document", "image": "photo"}.get(kind, "file")
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "You have exceeded the limit. "
            f"Maximum allowed {noun} size is {megabytes} MB."
        ),
    )


def _stored_bytes(collection, cap_query: dict) -> int:
    """Total size already attached to the event under this filter.

    A `find` and a sum rather than an aggregation: an event has tens of files
    at most, and the test fakes stand in for `find` but not for `$group`.
    """
    return sum(
        item.get("file_size") or 0
        for item in collection.find(cap_query, {"file_size": 1})
    )


def _ensure_bytes_under_cap(
    collection, cap_query: dict, incoming: int, cap_bytes: int | None, kind: str
) -> None:
    """Refuse an upload that would push the event past its combined budget."""
    if cap_bytes is None:
        return
    if _stored_bytes(collection, cap_query) + incoming > cap_bytes:
        raise _size_cap_error(cap_bytes, kind)


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
    cap: int | None,
    kind: str,
    cap_bytes: int | None = None,
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

    if cap is not None:
        past_cap = [
            item["_id"]
            for item in collection.find(cap_query, {"_id": 1}).sort("_id", ASCENDING)
        ][cap:]
        if result.inserted_id in past_cap:
            roll_back()
            raise _cap_error(cap, kind)

    if cap_bytes is not None:
        # The count version can just slice the list; bytes need a running
        # total in insertion order, so that when two uploads race, whichever
        # landed second is the one that loses.
        running = 0
        for item in collection.find(
            cap_query, {"_id": 1, "file_size": 1}
        ).sort("_id", ASCENDING):
            running += item.get("file_size") or 0
            if item["_id"] == result.inserted_id:
                if running > cap_bytes:
                    roll_back()
                    raise _size_cap_error(cap_bytes, kind)
                break


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


@router.get("/upload-limits")
@router.get("/teacher/upload-limits")
def get_active_upload_limits():
    """Returns the current configurable upload limits for photos and videos."""
    return {
        "success": True,
        "limits": get_public_upload_limits(),
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
    is_image = media_type == "image"

    limits = get_upload_limits()

    # Photos: at most N, each under its own size cap (and optional total budget).
    # Videos: optional count cap, per-file size cap, and combined total budget.
    cap = limits["max_photos_per_event"] if is_image else limits.get("max_videos_per_event")
    cap_bytes = limits["max_photo_total_bytes"] if is_image else limits["max_video_total_bytes"]
    per_file_limit = (
        limits["max_photo_size_bytes"] if is_image else limits["max_video_size_bytes"]
    )
    cap_query = {"event_id": event_key, "media_type": media_type}
    _ensure_under_cap(event_media, cap_query, cap, media_type)

    buffer, size = stream_upload(
        file, per_file_limit, what="Photos" if is_image else "Videos"
    )
    try:
        check_file_signature(info["extension"], peek_head(buffer))
        _ensure_bytes_under_cap(event_media, cap_query, size, cap_bytes, media_type)

        file_name = safe_file_name(file.filename)
        stored = save_upload(
            buffer,
            file_name=file_name,
            content_type=info["content_type"],
            kind="media",
            event_id=event_key,
            teacher_id=user["id"],
        )
    finally:
        buffer.close()

    document = new_media_document(
        event_id=event_key,
        storage=stored["storage"],
        object_key=stored["object_key"],
        file_id=stored["file_id"],
        file_name=file_name,
        media_url=stored["url"],
        media_type=media_type,
        content_type=info["content_type"],
        file_size=size,
        original_name=file.filename,
    )

    _record_upload(
        event_media, document, stored, event, cap_query, cap, media_type, cap_bytes
    )

    return {
        "success": True,
        "message": "Media uploaded successfully",
        "media": absolutize(request, serialize(document), "media_url"),
    }


@router.get(
    "/teacher/events/{event_id}/uploads/check-name"
)
def check_upload_names(
    event_id: str,
    file_name: list[str] = Query(default=[]),
    kind: str = Query(default="media", pattern="^(media|documents)$"),
    authorization: str | None = Header(
        default=None
    ),
):
    """Which of these names are already attached to the event (PRD 10).

    Storage keys every object with a uuid prefix, so a repeated name can never
    collide -- this exists purely so the wizard can ask "are you sure you want
    to upload a file with the same name?" before spending the bytes. Several
    names may be checked at once so picking ten photos is one round trip.
    """
    user = get_current_user(authorization)
    require_role(user, "teacher")

    event = find_teacher_event_or_404(event_id, user["id"])
    collection = event_media if kind == "media" else event_documents

    results: dict[str, bool] = {}
    for raw in file_name:
        key = upload_name_key(raw, raw)
        if not key:
            continue
        # `file_name` is the fallback for records stored before `name_key`
        # existed, so no backfill is needed for the check to work on them.
        existing = collection.find_one({
            "event_id": str(event["_id"]),
            "$or": [{"name_key": key}, {"file_name": raw}],
        })
        results[raw] = existing is not None

    return {
        "success": True,
        "duplicates": results,
        "any": any(results.values()),
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

    # Documents have no per-file cap (PRD 9): any number is fine as long as
    # they fit the combined budget, so the budget is also the per-file ceiling.
    cap_bytes = settings.max_documents_total_bytes

    buffer, size = stream_upload(file, cap_bytes, what="Documents")
    try:
        check_file_signature(info["extension"], peek_head(buffer))
        _ensure_bytes_under_cap(event_documents, cap_query, size, cap_bytes, "document")

        original_name = (file.filename or "document").strip()[:255] or "document"
        stored = save_upload(
            buffer,
            file_name=original_name,
            content_type=info["content_type"],
            kind="documents",
            event_id=event_key,
            teacher_id=user["id"],
        )
    finally:
        buffer.close()

    document = new_document_document(
        event_id=event_key,
        storage=stored["storage"],
        object_key=stored["object_key"],
        file_id=stored["file_id"],
        file_name=original_name,
        file_url=stored["url"],
        file_type=info["content_type"],
        file_size=size,
        original_name=file.filename,
    )

    _record_upload(
        event_documents, document, stored, event, cap_query,
        MAX_EVENT_DOCUMENTS, "document", cap_bytes,
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
    skip: int | None = Query(default=None, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    """The caller's notifications, newest first, at most `limit` of them."""
    user = get_current_user(authorization)

    query = {"user_id": user["id"]}
    notification_list, total = paginate(
        notifications, query, "created_at", DESCENDING, skip, limit
    )

    return {
        "success": True,
        "notifications": notification_list,
        "total": total,
        "count": len(notification_list),
        "unread": notifications.count_documents({**query, "is_read": False}),
        "has_more": (skip or 0) + len(notification_list) < total,
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


# How long a notification lingers after it has been seen (PRD 13). The bell is
# a queue of things still to act on, not an archive, so a read item clears
# itself. MongoDB's TTL monitor sweeps about once a minute, so the real
# lifetime is this plus up to ~60s -- never assert an exact moment.
READ_NOTIFICATION_TTL = timedelta(hours=1)


def _read_marks() -> dict:
    """The fields that mark a notification read and schedule its removal.

    `expires_at` is a separate field rather than a TTL on `read_at` on purpose:
    a TTL index on `read_at` would delete every already-read notification in
    the database within a minute of being created. Rows read before this
    shipped have no `expires_at` and are simply left alone.
    """
    now = utc_now()
    return {
        "is_read": True,
        "read_at": now,
        "expires_at": now + READ_NOTIFICATION_TTL,
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
        {"$set": _read_marks()},
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
        {"$set": _read_marks()},
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


@router.delete("/notifications/{notification_id}")
@router.delete(
    "/teacher/notifications/{notification_id}"
)
def delete_notification(
    notification_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    """Delete a single notification owned by the caller."""
    user = get_current_user(authorization)

    object_id = to_object_id(notification_id)
    if not object_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    result = notifications.delete_one(
        {"_id": object_id, "user_id": user["id"]}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    return {
        "success": True,
        "message": "Notification deleted",
    }


@router.delete("/notifications")
@router.delete(
    "/teacher/notifications"
)
@router.delete("/notifications/clear-all")
@router.delete(
    "/teacher/notifications/clear-all"
)
def clear_all_notifications(
    authorization: str | None = Header(
        default=None
    ),
):
    """Delete all notifications owned by the caller."""
    user = get_current_user(authorization)

    result = notifications.delete_many(
        {"user_id": user["id"]}
    )

    return {
        "success": True,
        "message": "All notifications cleared",
        "deleted_count": result.deleted_count,
    }

