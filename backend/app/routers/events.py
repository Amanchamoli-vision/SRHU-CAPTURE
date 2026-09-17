from datetime import date

from fastapi import APIRouter, HTTPException, Header, Query

from app.database import supabase


router = APIRouter(
    tags=["Events", "Dean"]
)


# ============================================================
# GET CURRENT USER
# ============================================================

def get_current_user(
    authorization: str | None
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization token required"
        )

    token = authorization.replace(
        "Bearer ",
        ""
    ).strip()

    try:
        response = supabase.auth.get_user(
            token
        )

        if not response or not response.user:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )

        return response.user

    except HTTPException:
        raise

    except Exception as error:
        print(
            "Authentication error:",
            error
        )

        raise HTTPException(
            status_code=401,
            detail="Authentication failed"
        )


# ============================================================
# CHECK DEAN
# ============================================================

def check_dean(
    user_id: str
):
    response = (
        supabase
        .table("users")
        .select(
            "id, name, email, role"
        )
        .eq(
            "id",
            user_id
        )
        .single()
        .execute()
    )

    profile = response.data

    if not profile:
        raise HTTPException(
            status_code=404,
            detail="User profile not found"
        )

    if profile.get("role") != "dean":
        raise HTTPException(
            status_code=403,
            detail="Dean access required"
        )

    return profile


# ============================================================
# SAFE NOTIFICATION CREATOR
# Notification creation errors must never block event actions
# ============================================================

def safe_create_notification(
    user_id: str,
    event_id: str,
    notification_type: str,
    title: str,
    message: str,
    data: dict | None = None,
):
    try:
        supabase.table("notifications").insert(
            {
                "user_id": user_id,
                "event_id": event_id,
                "notification_type": notification_type,
                "title": title,
                "message": message,
                "data": data or {},
            }
        ).execute()
    except Exception as err:
        print(
            "Notification creation warning"
            " (non-blocking):",
            err,
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

    user = get_current_user(
        authorization
    )

    check_dean(
        user.id
    )

    response = (
        supabase
        .table("events")
        .select(
            "id, status"
        )
        .execute()
    )

    events = response.data or []

    # Exclude drafts from Dean view
    submitted_events = [e for e in events if e.get("status") != "draft"]
    total_events = len(submitted_events)

    pending_events = sum(
        1
        for event in submitted_events
        if event.get("status") in ("pending", "submitted", "under_review")
    )

    approved_events = sum(
        1
        for event in submitted_events
        if event.get("status") in ("approved", "published")
    )

    rejected_events = sum(
        1
        for event in submitted_events
        if event.get("status") == "rejected"
    )

    return {
        "success": True,
        "total_events": total_events,
        "pending_events": pending_events,
        "approved_events": approved_events,
        "rejected_events": rejected_events,
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

    # --------------------------------------------------------
    # AUTHENTICATION
    # --------------------------------------------------------

    user = get_current_user(
        authorization
    )

    check_dean(
        user.id
    )

    # --------------------------------------------------------
    # VALIDATE DATE
    # --------------------------------------------------------

    if event_date:

        try:
            date.fromisoformat(
                event_date
            )

        except ValueError:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid date format. "
                    "Use YYYY-MM-DD."
                )
            )

    # --------------------------------------------------------
    # VALIDATE EVENT TYPE
    # --------------------------------------------------------

    allowed_event_types = {
        "Cultural",
        "Sports",
        "Academic",
        "Workshop",
        "Seminar",
        "Other",
    }

    normalized_event_type = None

    if event_type:

        normalized_event_type = (
            event_type.strip()
        )

        matching_type = next(
            (
                item
                for item in allowed_event_types
                if item.lower()
                == normalized_event_type.lower()
            ),
            None
        )

        if not matching_type:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid event type. "
                    "Allowed values: "
                    "Cultural, Sports, Academic, "
                    "Workshop, Seminar, Other."
                )
            )

        normalized_event_type = matching_type

    # --------------------------------------------------------
    # BUILD QUERY
    # --------------------------------------------------------

    query = (
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
    )

    # --------------------------------------------------------
    # DATE FILTER
    # --------------------------------------------------------

    if event_date:

        query = query.eq(
            "event_date",
            event_date
        )

    # --------------------------------------------------------
    # EVENT TYPE FILTER
    # --------------------------------------------------------

    if normalized_event_type:

        query = query.eq(
            "event_type",
            normalized_event_type
        )

    # --------------------------------------------------------
    # SORT
    # --------------------------------------------------------

    query = query.order(
        "created_at",
        desc=True
    )

    # --------------------------------------------------------
    # EXECUTE
    # --------------------------------------------------------

    response = query.execute()

    raw_events = response.data or []
    # Deans only review submitted events, never drafts
    events = [e for e in raw_events if e.get("status") != "draft"]

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {
        "success": True,
        "events": events,
        "total": len(events),

        "filters": {
            "event_date": event_date,
            "event_type": normalized_event_type,
        },
    }


# ============================================================
# GET EVENT MEDIA
# ============================================================

@router.get(
    "/dean/events/{event_id}/media"
)
def get_event_media(
    event_id: str,
    authorization: str | None = Header(
        default=None
    )
):

    user = get_current_user(
        authorization
    )

    check_dean(
        user.id
    )

    # --------------------------------------------------------
    # EVENT
    # --------------------------------------------------------

    event_response = (
        supabase
        .table("events")
        .select(
            "id, event_name, teacher_id"
        )
        .eq(
            "id",
            event_id
        )
        .maybe_single()
        .execute()
    )

    event = event_response.data

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    # --------------------------------------------------------
    # MEDIA
    # --------------------------------------------------------

    media_response = (
        supabase
        .table("event_media")
        .select(
            """
            id,
            event_id,
            media_url,
            media_type,
            cloudinary_public_id,
            created_at
            """
        )
        .eq(
            "event_id",
            event_id
        )
        .order(
            "created_at",
            desc=False
        )
        .execute()
    )

    media = media_response.data or []

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
    authorization: str | None = Header(
        default=None
    )
):

    user = get_current_user(
        authorization
    )

    check_dean(
        user.id
    )

    response = (
        supabase
        .table("events")
        .update(
            {
                "status": "approved",
                "rejection_reason": None,
            }
        )
        .eq(
            "id",
            event_id
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    approved_event = response.data[0]

    # --- Notification Trigger ---
    safe_create_notification(
        user_id=approved_event.get("teacher_id", ""),
        event_id=event_id,
        notification_type="approved",
        title="Event Approved",
        message=(
            f'Your "{approved_event.get("event_name", "event")}"'
            " event has been approved by the Dean."
        ),
        data={
            "event_name": approved_event.get(
                "event_name", ""
            ),
            "event_date": approved_event.get(
                "event_date", ""
            ),
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
    authorization: str | None = Header(
        default=None
    )
):

    user = get_current_user(
        authorization
    )

    check_dean(
        user.id
    )

    if not rejection_reason.strip():

        raise HTTPException(
            status_code=400,
            detail="Rejection reason is required"
        )

    response = (
        supabase
        .table("events")
        .update(
            {
                "status": "rejected",
                "rejection_reason":
                    rejection_reason.strip(),
            }
        )
        .eq(
            "id",
            event_id
        )
        .execute()
    )

    if not response.data:

        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    rejected_event = response.data[0]

    # --- Notification Trigger ---
    safe_create_notification(
        user_id=rejected_event.get("teacher_id", ""),
        event_id=event_id,
        notification_type="rejected",
        title="Event Rejected",
        message=(
            f'Your "{rejected_event.get("event_name", "event")}"'
            " event was rejected by the Dean."
            f" Reason: {rejection_reason.strip()}"
        ),
        data={
            "event_name": rejected_event.get(
                "event_name", ""
            ),
            "rejection_reason": rejection_reason.strip(),
        },
    )

    return {
        "success": True,
        "message": "Event rejected successfully",
        "event": rejected_event,
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

    event_response = (
        supabase
        .table("events")
        .select("id, teacher_id, status")
        .eq("id", event_id)
        .maybe_single()
        .execute()
    )

    event = event_response.data
    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    if event.get("teacher_id") != user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to resubmit this event"
        )

    update_response = (
        supabase
        .table("events")
        .update({
            "status": "pending",
            "rejection_reason": None,
        })
        .eq("id", event_id)
        .execute()
    )

    return {
        "success": True,
        "message": "Event resubmitted for approval",
        "event": update_response.data[0] if update_response.data else event,
    }


# ============================================================
# DEAN REQUEST CHANGES ON EVENT
# ============================================================

@router.patch(
    "/dean/events/{event_id}/request-changes"
)
def request_changes_event(
    event_id: str,
    remarks: str = Query(default=""),
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)
    check_dean(user.id)

    if not remarks.strip():
        raise HTTPException(
            status_code=400,
            detail="Remarks are required"
        )

    response = (
        supabase
        .table("events")
        .update(
            {
                "status": "rejected",
                "rejection_reason": remarks.strip(),
            }
        )
        .eq("id", event_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    changed_event = response.data[0]

    safe_create_notification(
        user_id=changed_event.get("teacher_id", ""),
        event_id=event_id,
        notification_type="needs_changes",
        title="Event Needs Changes",
        message=(
            f'Your "{changed_event.get("event_name", "event")}"'
            " event needs changes before approval."
            f" Remarks: {remarks.strip()}"
        ),
        data={
            "event_name": changed_event.get(
                "event_name", ""
            ),
            "remarks": remarks.strip(),
        },
    )

    return {
        "success": True,
        "message": "Changes requested for event",
        "event": changed_event,
    }


# ============================================================
# TEACHER NOTIFICATIONS
# ============================================================

@router.get(
    "/teacher/notifications"
)
def get_teacher_notifications(
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)

    response = (
        supabase
        .table("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )

    return {
        "success": True,
        "notifications": response.data or [],
        "total": len(response.data or []),
    }


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

    response = (
        supabase
        .table("notifications")
        .update(
            {
                "is_read": True,
                "read_at": "now()",
            }
        )
        .eq("id", notification_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    return {
        "success": True,
        "message": "Notification marked as read",
    }


@router.patch(
    "/teacher/notifications/read-all"
)
def mark_all_notifications_read(
    authorization: str | None = Header(
        default=None
    ),
):
    user = get_current_user(authorization)

    supabase.table("notifications").update(
        {
            "is_read": True,
            "read_at": "now()",
        }
    ).eq(
        "user_id", user.id
    ).eq(
        "is_read", False
    ).execute()

    return {
        "success": True,
        "message": "All notifications marked as read",
    }