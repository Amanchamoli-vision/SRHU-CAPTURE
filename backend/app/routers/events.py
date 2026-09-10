from fastapi import APIRouter, HTTPException, Header
from app.database import supabase

router = APIRouter(tags=["Events", "Dean"])


# ============================================================
# AUTHENTICATION
# ============================================================

def get_current_user(authorization: str | None):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization token required"
        )

    token = authorization.replace("Bearer ", "").strip()

    try:
        response = supabase.auth.get_user(token)

        if not response or not response.user:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )

        return response.user

    except HTTPException:
        raise

    except Exception as error:
        print("Authentication error:", error)

        raise HTTPException(
            status_code=401,
            detail="Authentication failed"
        )


# ============================================================
# CHECK DEAN
# ============================================================

def check_dean(user_id: str):

    response = (
        supabase
        .table("users")
        .select("id, name, email, role")
        .eq("id", user_id)
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
# DEAN DASHBOARD STATS
# ============================================================

@router.get("/dean/dashboard/stats")
def dean_dashboard_stats(
    authorization: str | None = Header(default=None)
):

    user = get_current_user(authorization)

    check_dean(user.id)

    response = (
        supabase
        .table("events")
        .select("id, status")
        .execute()
    )

    events = response.data or []

    total_events = len(events)

    pending_events = sum(
        1
        for event in events
        if event.get("status") == "pending"
    )

    approved_events = sum(
        1
        for event in events
        if event.get("status") == "approved"
    )

    rejected_events = sum(
        1
        for event in events
        if event.get("status") == "rejected"
    )

    return {
        "success": True,
        "total_events": total_events,
        "pending_events": pending_events,
        "approved_events": approved_events,
        "rejected_events": rejected_events
    }


# ============================================================
# GET ALL EVENTS FOR DEAN
# ============================================================

@router.get("/dean/events")
def get_all_events(
    authorization: str | None = Header(default=None)
):

    user = get_current_user(authorization)

    check_dean(user.id)

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
        .order("created_at", desc=True)
        .execute()
    )

    events = response.data or []

    return {
        "success": True,
        "events": events,
        "total": len(events)
    }


# ============================================================
# GET MEDIA FOR PARTICULAR EVENT
# ============================================================

@router.get("/dean/events/{event_id}/media")
def get_event_media(
    event_id: str,
    authorization: str | None = Header(default=None)
):

    # Authenticate
    user = get_current_user(authorization)

    # Make sure user is Dean
    check_dean(user.id)

    # --------------------------------------------------------
    # Check event exists
    # --------------------------------------------------------

    event_response = (
        supabase
        .table("events")
        .select("id, event_name, teacher_id")
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

    # --------------------------------------------------------
    # Get event media
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
        .eq("event_id", event_id)
        .order("created_at", desc=False)
        .execute()
    )

    media = media_response.data or []

    return {
        "success": True,
        "event_id": event_id,
        "media": media,
        "total": len(media)
    }


# ============================================================
# APPROVE EVENT
# ============================================================

@router.patch("/dean/events/{event_id}/approve")
def approve_event(
    event_id: str,
    authorization: str | None = Header(default=None)
):

    user = get_current_user(authorization)

    check_dean(user.id)

    response = (
        supabase
        .table("events")
        .update(
            {
                "status": "approved",
                "rejection_reason": None
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

    return {
        "success": True,
        "message": "Event approved successfully",
        "event": response.data[0]
    }


# ============================================================
# REJECT EVENT
# ============================================================

@router.patch("/dean/events/{event_id}/reject")
def reject_event(
    event_id: str,
    rejection_reason: str,
    authorization: str | None = Header(default=None)
):

    user = get_current_user(authorization)

    check_dean(user.id)

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
                "rejection_reason": rejection_reason.strip()
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

    return {
        "success": True,
        "message": "Event rejected successfully",
        "event": response.data[0]
    }