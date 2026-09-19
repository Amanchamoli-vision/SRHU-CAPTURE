import logging
import re

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, status
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError

from app.database import events, upload_config, users
from app.models.documents import USER_PRIVATE_FIELDS, new_user_document
from app.routers.auth import find_user_by_email
from app.schemas.superadmin import CreateDeanRequest, UploadLimitsUpdateRequest
from app.services import email_service
from app.services.storage_service import delete_user_cascade
from app.services.upload_config_service import (
    CONFIG_KEY,
    DEFAULT_UPLOAD_LIMITS,
    get_public_upload_limits,
    reset_upload_limits,
    update_upload_limits,
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
def _safe_count(collection, query: dict) -> int:
    try:
        val = collection.count_documents(query)
        if isinstance(val, int):
            return val
    except Exception:
        pass
    return 0


def _page_cursor(cursor, skip: int | None, limit: int | None):
    if hasattr(cursor, "skip") and callable(cursor.skip):
        if skip:
            cursor = cursor.skip(skip)
        if limit:
            cursor = cursor.limit(limit)
        return cursor
    if skip:
        cursor = cursor[skip:]
    if limit:
        cursor = cursor[:limit]
    return cursor


@router.get("/users")
def get_all_users(
    authorization: str | None = Header(default=None),
    role: str | None = Query(default=None, max_length=50),
    q: str | None = Query(default=None, max_length=200),
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=1000),
):
    get_superadmin_user(authorization)

    query: dict = {}

    normalized_role = (role or "").strip().lower()
    if normalized_role and normalized_role != "all":
        query["role"] = normalized_role

    search = (q or "").strip()
    if search:
        pattern = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
        ]

    # Tab counts under the non-role filters (like search query `q`),
    # so tab numbers match what clicking each tab would display.
    count_base = {k: v for k, v in query.items() if k != "role"}
    counts = {
        "all": _safe_count(users, count_base),
        "teacher": _safe_count(users, {**count_base, "role": "teacher"}),
        "dean": _safe_count(users, {**count_base, "role": "dean"}),
        "superadmin": _safe_count(users, {**count_base, "role": "superadmin"}),
    }

    cursor = users.find(
        query,
        {field: 0 for field in USER_PRIVATE_FIELDS},
    ).sort("created_at", DESCENDING)

    total = _safe_count(users, query)

    if skip or limit:
        cursor = _page_cursor(cursor, skip, limit)

    user_list = serialize_many(cursor)

    if not (skip or limit) and total == 0 and len(user_list) > 0:
        total = len(user_list)
        counts["all"] = total

    return {
        "success": True,
        "users": user_list,
        "total": total,
        "count": len(user_list),
        "counts": counts,
        "has_more": (skip or 0) + len(user_list) < total if limit is not None else False,
        "skip": skip or 0,
        "limit": limit,
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
# UPLOAD LIMITS SETTINGS
# ============================================================

@router.get("/upload-limits")
def get_superadmin_upload_limits(
    authorization: str | None = Header(default=None)
):
    get_superadmin_user(authorization)

    limits = get_public_upload_limits()
    doc = upload_config.find_one({"key": CONFIG_KEY})

    return {
        "success": True,
        "limits": limits,
        "defaults": DEFAULT_UPLOAD_LIMITS,
        "updated_at": doc.get("updated_at") if doc else None,
        "updated_by": doc.get("updated_by") if doc else None,
    }


@router.put("/upload-limits")
def update_superadmin_upload_limits(
    payload: UploadLimitsUpdateRequest,
    authorization: str | None = Header(default=None)
):
    superadmin = get_superadmin_user(authorization)

    updated = update_upload_limits(payload.model_dump(), superadmin["id"])

    return {
        "success": True,
        "message": "Upload limits updated successfully",
        "limits": updated,
    }


@router.post("/upload-limits/reset")
def reset_superadmin_upload_limits(
    authorization: str | None = Header(default=None)
):
    superadmin = get_superadmin_user(authorization)

    reset_limits = reset_upload_limits(superadmin["id"])

    return {
        "success": True,
        "message": "Upload limits reset to system defaults",
        "limits": reset_limits,
    }

