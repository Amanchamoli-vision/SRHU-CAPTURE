import logging
import re

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, status
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError

from app.database import events, users
from app.models.documents import ROLES, USER_PRIVATE_FIELDS, new_user_document
from app.routers.auth import find_user_by_email
from app.schemas.superadmin import CreateDeanRequest
from app.schemas.upload_limits import UploadLimitsRequest
from app.services import email_service
from app.services.storage_service import delete_user_cascade
from app.services.upload_limits import (
    LIMIT_BOUNDS,
    default_upload_limits,
    get_upload_limits_record,
    save_upload_limits,
)
from app.utils.auth import get_superadmin_user, public_user
from app.utils.security import generate_temporary_password, hash_password
from app.utils.serializers import serialize_many, to_object_id, utc_now


router = APIRouter(
    prefix="/superadmin",
    tags=["Superadmin"]
)
logger = logging.getLogger(__name__)


# ============================================================
# HELPERS
# ============================================================

def find_user_or_404(user_id: str) -> dict:
    object_id = to_object_id(user_id)
    user = users.find_one({"_id": object_id}) if object_id else None

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


def set_role(user_id: str, role: str) -> dict:
    updated = users.find_one_and_update(
        {"_id": to_object_id(user_id)},
        {"$set": {"role": role, "updated_at": utc_now()}},
        return_document=True,
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user role"
        )

    return public_user(updated)


# ============================================================
# SUPERADMIN DASHBOARD STATS
# ============================================================

@router.get("/dashboard/stats")
def get_dashboard_stats(
    authorization: str | None = Header(default=None)
):
    get_superadmin_user(authorization)

    role_counts = {
        row["_id"]: row["count"]
        for row in users.aggregate(
            [{"$group": {"_id": "$role", "count": {"$sum": 1}}}]
        )
    }

    return {
        "success": True,
        "total_users": sum(role_counts.values()),
        "teachers": role_counts.get("teacher", 0),
        "deans": role_counts.get("dean", 0),
        "superadmins": role_counts.get("superadmin", 0),
        "pending_events": events.count_documents({"status": "pending"}),
    }


# ============================================================
# GET ALL USERS
#
# Optional filters and paging, mirroring /dean/events so the two
# consoles behave the same way:
#
# /superadmin/users
# /superadmin/users?role=dean
# /superadmin/users?q=meera
# /superadmin/users?skip=25&limit=25
# ============================================================

@router.get("/users")
def get_all_users(
    authorization: str | None = Header(default=None),

    # One of the roles the console's tabs show, or "all".
    role: str | None = Query(default=None, max_length=20),

    # Free-text search over the name and the email address.
    q: str | None = Query(default=None, max_length=200),

    # Optional paging. No default cap, deliberately: the events list and the
    # single-event screen both read this endpoint only to map teacher ids to
    # names, and capping it by default would silently blank those names for
    # everyone past the first page. A caller that wants a page asks for one.
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=1000),
):
    get_superadmin_user(authorization)

    query: dict = {}

    selected_role = (role or "all").strip().lower()
    if selected_role and selected_role != "all":
        if selected_role not in ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown role filter.",
            )
        query["role"] = selected_role

    search = (q or "").strip()
    if search:
        # Escaped for the same reason the event search is: an unescaped "("
        # or "+" in the box would either mis-match or 500.
        pattern = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
        ]

    # Counts for the role tabs, under the search but not under the selected
    # role -- otherwise picking "Deans" would report every other tab as 0.
    count_query = {key: value for key, value in query.items() if key != "role"}
    counts = {name: users.count_documents({**count_query, "role": name}) for name in ROLES}
    counts["all"] = users.count_documents(count_query)

    total = users.count_documents(query)

    cursor = users.find(
        query,
        {field: 0 for field in USER_PRIVATE_FIELDS},
    ).sort("created_at", DESCENDING)
    if skip:
        cursor = cursor.skip(skip)
    if limit:
        cursor = cursor.limit(limit)

    user_list = serialize_many(cursor)

    return {
        "success": True,
        "users": user_list,
        # `total` is the size of the whole filtered set, not of the page: a
        # paging UI needs it to render "1-25 of 312" and to know whether a
        # next page exists. `count` is what is actually in this response.
        "total": total,
        "count": len(user_list),
        "counts": counts,
        "has_more": (skip or 0) + len(user_list) < total,
        "skip": skip or 0,
        "limit": limit,
        "filters": {"role": selected_role, "q": search or None},
    }


# ============================================================
# CREATE DEAN
# ============================================================

@router.post("/create-dean", status_code=status.HTTP_201_CREATED)
def create_dean(
    payload: CreateDeanRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    """Create a verified Dean account with a temporary password.

    The password is returned to the superadmin and, when SMTP is configured, also
    emailed to the new Dean.
    """
    get_superadmin_user(authorization)

    email = str(payload.email).casefold()

    # Same lookup as registration and login, so a Gmail dot variant of an
    # existing account is caught too.
    if find_user_by_email(email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists."
        )

    temporary_password = generate_temporary_password()

    # must_change_password makes the frontend send the Dean to the
    # change-password screen on first sign-in; /users/me/change-password clears it.
    document = new_user_document(
        name=payload.name,
        email=email,
        password_hash=hash_password(temporary_password),
        role="dean",
        email_verified=True,
        must_change_password=True,
    )

    try:
        result = users.insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists."
        )

    document["_id"] = result.inserted_id

    email_queued = False
    if email_service.is_configured():
        background_tasks.add_task(
            _send_dean_credentials,
            email,
            payload.name,
            temporary_password,
        )
        email_queued = True

    logger.info("dean_created email_queued=%s", email_queued)

    # temporary_password stays in the response on purpose: it is the
    # superadmin's fallback for handing over the credentials when SMTP is not
    # configured or the email never arrives. It is single-use in practice --
    # the account carries must_change_password until the Dean replaces it.
    return {
        "success": True,
        "message": (
            f"Dean account created for {payload.name}."
            + (" Login details have been emailed." if email_queued else "")
        ),
        "temporary_password": temporary_password,
        "email_sent": email_queued,
        "user": public_user(document),
    }


def _send_dean_credentials(email: str, name: str, temporary_password: str) -> None:
    try:
        email_service.send_dean_credentials_email(email, name, temporary_password)
    except email_service.EmailDeliveryError:
        logger.warning("dean_credentials_email_failed")


# ============================================================
# MAKE TEACHER -> DEAN
# ============================================================

@router.patch("/users/{user_id}/make-dean")
def make_user_dean(
    user_id: str,
    authorization: str | None = Header(default=None)
):
    get_superadmin_user(authorization)

    user = find_user_or_404(user_id)

    if user.get("role") != "teacher":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a teacher can be made Dean"
        )

    updated_user = set_role(user_id, "dean")

    return {
        "success": True,
        "message": (
            f"{updated_user.get('name')} "
            f"has been made Dean successfully"
        ),
        "user": updated_user
    }


# ============================================================
# MAKE DEAN -> TEACHER
# ============================================================

@router.patch("/users/{user_id}/make-teacher")
def make_user_teacher(
    user_id: str,
    authorization: str | None = Header(default=None)
):
    get_superadmin_user(authorization)

    user = find_user_or_404(user_id)

    if user.get("role") != "dean":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a Dean can be changed to Teacher"
        )

    updated_user = set_role(user_id, "teacher")

    return {
        "success": True,
        "message": (
            f"{updated_user.get('name')} "
            f"has been changed to Teacher"
        ),
        "user": updated_user
    }


# ============================================================
# DELETE USER
# ============================================================

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    authorization: str | None = Header(default=None)
):
    superadmin_profile = get_superadmin_user(authorization)

    # Events and notifications reference their owner by the canonical
    # lower-case hex string, so an upper-case (or otherwise non-canonical) id
    # in the URL must be normalised before comparing or cascading -- otherwise
    # the user row goes but everything they own is left behind.
    object_id = to_object_id(user_id)
    canonical_id = str(object_id) if object_id is not None else user_id

    if superadmin_profile.get("id") == canonical_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own superadmin account"
        )

    user = find_user_or_404(canonical_id)

    if user.get("role") == "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin users cannot be deleted"
        )

    # Removes the user's events, media, documents, reports and notifications.
    delete_user_cascade(str(user["_id"]))

    return {
        "success": True,
        "message": (
            f"{user.get('name') or user.get('email')} "
            f"has been deleted successfully"
        ),
        "user": public_user(user)
    }


# ============================================================
# UPLOAD LIMITS
#
# The per-event photo and video caps a teacher's upload is measured
# against. One global configuration, not per teacher or department:
# every event is reviewed by the same Dean and stored in the same
# bucket, so a second dimension would only make "why was my file
# refused?" harder to answer.
# ============================================================

def _limits_response(record: dict, message: str | None = None) -> dict:
    """The record plus the bounds the console renders its hints from."""
    payload = {
        "success": True,
        "limits": record["limits"],
        "defaults": default_upload_limits(),
        "bounds": LIMIT_BOUNDS,
        "is_default": record["is_default"],
        "updated_at": record["updated_at"],
        "updated_by": record["updated_by"],
    }
    if message:
        payload["message"] = message
    return payload


@router.get("/upload-limits")
def get_upload_limits_settings(
    authorization: str | None = Header(default=None),
):
    """The limits in force, the built-in defaults, and the allowed ranges.

    `is_default` is true until the first save, which is how the console tells
    "nobody has configured this yet" from "someone configured it back to the
    default values".
    """
    get_superadmin_user(authorization)
    return _limits_response(get_upload_limits_record())


@router.put("/upload-limits")
def update_upload_limits_settings(
    payload: UploadLimitsRequest,
    authorization: str | None = Header(default=None),
):
    """Replace the limits. Takes effect on the next upload -- no deploy.

    The whole configuration is sent at once (see `UploadLimitsRequest`), so a
    save always leaves a complete, self-consistent row behind.
    """
    superadmin_profile = get_superadmin_user(authorization)

    record = save_upload_limits(
        payload.model_dump(),
        updated_by=superadmin_profile.get("id"),
    )
    logger.info("upload_limits_updated by=%s", superadmin_profile.get("id"))

    return _limits_response(record, "Upload limits saved.")
