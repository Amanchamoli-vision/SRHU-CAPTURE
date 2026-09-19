import csv
import io
import logging
import re
from datetime import datetime, timedelta

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from app.database import audit_logs, departments, event_media, events, upload_config, users
from app.models.documents import (
    USER_PRIVATE_FIELDS,
    new_department_document,
    new_user_document,
)
from app.routers.auth import find_user_by_email
from app.schemas.superadmin import (
    BulkOnboardTeacherItem,
    BulkOnboardTeachersRequest,
    CreateDeanRequest,
    CreateDepartmentRequest,
    ResetUserPasswordRequest,
    SendCredentialsRequest,
    UpdateDepartmentRequest,
    UpdateUserProfileRequest,
    UploadLimitsUpdateRequest,
)
from app.services import email_service
from app.services.audit_service import log_audit_event
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
from app.utils.serializers import serialize, serialize_many, to_object_id, utc_now


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
    superadmin = get_superadmin_user(authorization)

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

    log_audit_event(
        actor=superadmin,
        action="dean_created",
        target_type="user",
        target_id=str(result.inserted_id),
        details={"name": payload.name, "email": email, "email_sent": email_queued},
    )

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
    superadmin = get_superadmin_user(authorization)

    user = find_user_or_404(user_id)

    if user.get("role") != "teacher":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a teacher can be made Dean"
        )

    updated_user = set_role(user_id, "dean")

    log_audit_event(
        actor=superadmin,
        action="role_change",
        target_type="user",
        target_id=user_id,
        details={"old_role": "teacher", "new_role": "dean", "user_name": user.get("name")},
    )

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
    superadmin = get_superadmin_user(authorization)

    user = find_user_or_404(user_id)

    if user.get("role") != "dean":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a Dean can be changed to Teacher"
        )

    updated_user = set_role(user_id, "teacher")

    log_audit_event(
        actor=superadmin,
        action="role_change",
        target_type="user",
        target_id=user_id,
        details={"old_role": "dean", "new_role": "teacher", "user_name": user.get("name")},
    )

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

    log_audit_event(
        actor=superadmin_profile,
        action="user_deleted",
        target_type="user",
        target_id=canonical_id,
        details={"name": user.get("name"), "email": user.get("email"), "role": user.get("role")},
    )

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

    log_audit_event(
        actor=superadmin,
        action="upload_limits_updated",
        target_type="system_config",
        details=payload.model_dump(),
    )

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

    log_audit_event(
        actor=superadmin,
        action="upload_limits_reset",
        target_type="system_config",
        details={"limits": reset_limits},
    )

    return {
        "success": True,
        "message": "Upload limits reset to system defaults",
        "limits": reset_limits,
    }


# ============================================================
# USER MANAGEMENT EXTENSIONS (DEACTIVATION, PROFILE, RESET)
# ============================================================

@router.patch("/users/{user_id}/toggle-active")
def toggle_user_active(
    user_id: str,
    authorization: str | None = Header(default=None),
):
    superadmin = get_superadmin_user(authorization)
    user = find_user_or_404(user_id)

    if superadmin.get("id") == str(user["_id"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    if user.get("role") == "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin accounts cannot be deactivated",
        )

    current_status = user.get("is_active", True)
    new_status = not current_status

    update_fields: dict[str, Any] = {
        "is_active": new_status,
        "updated_at": utc_now(),
    }
    # When deactivating, increment token_version to invalidate active sessions immediately
    if not new_status:
        update_fields["token_version"] = int(user.get("token_version", 0)) + 1

    updated = users.find_one_and_update(
        {"_id": user["_id"]},
        {"$set": update_fields},
        return_document=True,
    )

    action_label = "activated" if new_status else "deactivated"
    log_audit_event(
        actor=superadmin,
        action=f"user_{action_label}",
        target_type="user",
        target_id=str(user["_id"]),
        details={"name": user.get("name"), "email": user.get("email"), "is_active": new_status},
    )

    return {
        "success": True,
        "message": f"User {user.get('name') or user.get('email')} has been {action_label} successfully.",
        "user": public_user(updated),
    }


@router.patch("/users/{user_id}/profile")
def update_user_profile(
    user_id: str,
    payload: UpdateUserProfileRequest,
    authorization: str | None = Header(default=None),
):
    superadmin = get_superadmin_user(authorization)
    user = find_user_or_404(user_id)

    update_fields: dict[str, Any] = {"updated_at": utc_now()}
    if payload.name is not None:
        update_fields["name"] = payload.name
    if payload.phone is not None:
        update_fields["phone"] = payload.phone
    if payload.department is not None:
        update_fields["department"] = payload.department

    updated = users.find_one_and_update(
        {"_id": user["_id"]},
        {"$set": update_fields},
        return_document=True,
    )

    log_audit_event(
        actor=superadmin,
        action="user_profile_updated",
        target_type="user",
        target_id=str(user["_id"]),
        details={
            "name": payload.name,
            "phone": payload.phone,
            "department": payload.department,
        },
    )

    return {
        "success": True,
        "message": "User profile updated successfully.",
        "user": public_user(updated),
    }


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    payload: ResetUserPasswordRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    superadmin = get_superadmin_user(authorization)
    user = find_user_or_404(user_id)

    new_password = payload.new_password or generate_temporary_password()
    password_hash = hash_password(new_password)

    # Invalidate existing sessions by incrementing token_version and require password change
    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": password_hash,
                "must_change_password": True,
                "updated_at": utc_now(),
            },
            "$inc": {"token_version": 1},
        },
    )

    email_queued = False
    if email_service.is_configured():
        background_tasks.add_task(
            email_service.send_password_reset_email,
            user["email"],
            user.get("name") or "there",
            new_password,
        )
        email_queued = True

    log_audit_event(
        actor=superadmin,
        action="user_password_reset",
        target_type="user",
        target_id=str(user["_id"]),
        details={"email": user.get("email"), "email_sent": email_queued},
    )

    return {
        "success": True,
        "message": f"Password reset for {user.get('name') or user.get('email')}." + (" Notification email queued." if email_queued else ""),
        "temporary_password": new_password,
        "email_sent": email_queued,
    }


# ============================================================
# AUDIT LOGS
# ============================================================

@router.get("/audit-logs")
def get_audit_logs(
    authorization: str | None = Header(default=None),
    action: str | None = Query(default=None, max_length=50),
    q: str | None = Query(default=None, max_length=200),
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=500),
):
    get_superadmin_user(authorization)

    query: dict[str, Any] = {}
    if action and action.strip().lower() != "all":
        query["action"] = action.strip()

    search = (q or "").strip()
    if search:
        pattern = re.escape(search)
        query["$or"] = [
            {"actor_name": {"$regex": pattern, "$options": "i"}},
            {"actor_email": {"$regex": pattern, "$options": "i"}},
            {"action": {"$regex": pattern, "$options": "i"}},
            {"target_type": {"$regex": pattern, "$options": "i"}},
        ]

    total = _safe_count(audit_logs, query)
    cursor = audit_logs.find(query).sort("created_at", DESCENDING)

    if skip or limit:
        cursor = _page_cursor(cursor, skip, limit)

    log_list = serialize_many(cursor)

    return {
        "success": True,
        "logs": log_list,
        "total": total,
        "count": len(log_list),
        "has_more": (skip or 0) + len(log_list) < total if limit is not None else False,
        "skip": skip or 0,
        "limit": limit,
    }


# ============================================================
# DEPARTMENTS MASTER REGISTRY (CRUD)
# ============================================================

@router.get("/departments")
def get_departments(
    authorization: str | None = Header(default=None),
    q: str | None = Query(default=None, max_length=100),
    is_active: bool | None = Query(default=None),
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=500),
):
    get_superadmin_user(authorization)

    query: dict[str, Any] = {}
    if is_active is not None:
        query["is_active"] = is_active

    search = (q or "").strip()
    if search:
        pattern = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"code": {"$regex": pattern, "$options": "i"}},
            {"school": {"$regex": pattern, "$options": "i"}},
        ]

    total = _safe_count(departments, query)
    cursor = departments.find(query).sort("name", ASCENDING)

    if skip or limit:
        cursor = _page_cursor(cursor, skip, limit)

    dept_list = serialize_many(cursor)

    return {
        "success": True,
        "departments": dept_list,
        "total": total,
        "count": len(dept_list),
        "has_more": (skip or 0) + len(dept_list) < total if limit is not None else False,
        "skip": skip or 0,
        "limit": limit,
    }


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(
    payload: CreateDepartmentRequest,
    authorization: str | None = Header(default=None),
):
    superadmin = get_superadmin_user(authorization)

    existing = departments.find_one({
        "$or": [
            {"name": {"$regex": f"^{re.escape(payload.name)}$", "$options": "i"}},
            {"code": payload.code.upper()},
        ]
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A department with this name or code already exists.",
        )

    doc = new_department_document(
        name=payload.name,
        code=payload.code,
        school=payload.school,
    )
    try:
        res = departments.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A department with this name or code already exists.",
        )

    doc["_id"] = res.inserted_id
    dept = serialize(doc)

    log_audit_event(
        actor=superadmin,
        action="department_created",
        target_type="department",
        target_id=str(res.inserted_id),
        details={"name": payload.name, "code": payload.code, "school": payload.school},
    )

    return {
        "success": True,
        "message": f"Department '{payload.name}' created successfully.",
        "department": dept,
    }


@router.put("/departments/{dept_id}")
def update_department(
    dept_id: str,
    payload: UpdateDepartmentRequest,
    authorization: str | None = Header(default=None),
):
    superadmin = get_superadmin_user(authorization)
    obj_id = to_object_id(dept_id)
    if not obj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    dept = departments.find_one({"_id": obj_id})
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    # If renaming or changing code, check collision
    collision_or = []
    if payload.name and payload.name.lower() != dept["name"].lower():
        collision_or.append({"name": {"$regex": f"^{re.escape(payload.name)}$", "$options": "i"}})
    if payload.code and payload.code.upper() != dept.get("code"):
        collision_or.append({"code": payload.code.upper()})

    if collision_or:
        collision = departments.find_one({"_id": {"$ne": obj_id}, "$or": collision_or})
        if collision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another department with this name or code already exists.",
            )

    update_fields: dict[str, Any] = {"updated_at": utc_now()}
    if payload.name is not None:
        update_fields["name"] = payload.name
    if payload.code is not None:
        update_fields["code"] = payload.code
    if payload.school is not None:
        update_fields["school"] = payload.school
    if payload.is_active is not None:
        update_fields["is_active"] = payload.is_active

    updated = departments.find_one_and_update(
        {"_id": obj_id},
        {"$set": update_fields},
        return_document=True,
    )

    log_audit_event(
        actor=superadmin,
        action="department_updated",
        target_type="department",
        target_id=dept_id,
        details=update_fields,
    )

    return {
        "success": True,
        "message": "Department updated successfully.",
        "department": serialize(updated),
    }


@router.delete("/departments/{dept_id}")
def delete_department(
    dept_id: str,
    authorization: str | None = Header(default=None),
):
    superadmin = get_superadmin_user(authorization)
    obj_id = to_object_id(dept_id)
    if not obj_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    dept = departments.find_one({"_id": obj_id})
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    # Soft delete by marking is_active=False
    departments.find_one_and_update(
        {"_id": obj_id},
        {"$set": {"is_active": False, "updated_at": utc_now()}},
    )

    log_audit_event(
        actor=superadmin,
        action="department_deactivated",
        target_type="department",
        target_id=dept_id,
        details={"name": dept.get("name"), "code": dept.get("code")},
    )

    return {
        "success": True,
        "message": f"Department '{dept.get('name')}' has been deactivated.",
    }


# ============================================================
# ACCREDITATION CSV EXPORT (NAAC / NIRF)
# ============================================================

@router.get("/events/export")
def export_events_csv(
    authorization: str | None = Header(default=None),
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
):
    superadmin = get_superadmin_user(authorization)

    query: dict[str, Any] = {}
    if status and status.strip().lower() != "all":
        query["status"] = status.strip().lower()
    if event_type and event_type.strip().lower() != "all":
        query["event_type"] = event_type.strip()
    if from_date or to_date:
        date_q = {}
        if from_date:
            date_q["$gte"] = from_date
        if to_date:
            date_q["$lte"] = to_date
        query["event_date"] = date_q

    event_docs = list(events.find(query).sort("event_date", DESCENDING))

    # Preload teachers map for name/email/department
    teacher_ids = {to_object_id(e.get("teacher_id")) for e in event_docs if e.get("teacher_id")}
    valid_tids = [tid for tid in teacher_ids if tid is not None]
    teacher_map = {}
    if valid_tids:
        for t in users.find({"_id": {"$in": valid_tids}}):
            teacher_map[str(t["_id"])] = t

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Event ID",
        "Event Name",
        "Event Type",
        "Status",
        "Start Date",
        "End Date",
        "Start Time",
        "End Time",
        "Location",
        "Organizer",
        "Coordinator Name",
        "Coordinator Mobile",
        "Faculty / Teacher Name",
        "Faculty Email",
        "Department",
        "Created At",
        "Description",
    ])

    for ev in event_docs:
        teacher = teacher_map.get(str(ev.get("teacher_id")), {})
        writer.writerow([
            str(ev.get("_id", "")),
            ev.get("event_name", ""),
            ev.get("event_type", ""),
            ev.get("status", ""),
            ev.get("event_date", ""),
            ev.get("end_date", "") or "",
            ev.get("start_time", "") or "",
            ev.get("end_time", "") or "",
            ev.get("location", "") or "",
            ev.get("organizer", "") or "",
            ev.get("coordinator_name", "") or "",
            ev.get("coordinator_contact", "") or "",
            teacher.get("name", ""),
            teacher.get("email", ""),
            teacher.get("department", "") or "",
            str(ev.get("created_at", "")),
            ev.get("description", "") or "",
        ])

    csv_content = output.getvalue()
    filename = f"events_naac_nirf_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    log_audit_event(
        actor=superadmin,
        action="events_exported",
        target_type="events",
        details={"count": len(event_docs), "filename": filename},
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================
# EXECUTIVE ANALYTICS DASHBOARD
# ============================================================

@router.get("/dashboard/analytics")
def get_dashboard_analytics(
    authorization: str | None = Header(default=None),
):
    get_superadmin_user(authorization)

    # 1. Total counts / KPIs
    total_events = events.count_documents({})
    approved_events = events.count_documents({"status": "approved"})
    pending_events = events.count_documents({"status": "pending"})
    rejected_events = events.count_documents({"status": "rejected"})
    total_users = users.count_documents({})
    total_teachers = users.count_documents({"role": "teacher"})
    total_deans = users.count_documents({"role": "dean"})
    total_media = event_media.count_documents({})

    # 2. Monthly Trend (last 12 months)
    pipeline_monthly = [
        {
            "$match": {
                "event_date": {"$exists": True, "$type": "string", "$regex": r"^\d{4}-\d{2}"}
            }
        },
        {
            "$group": {
                "_id": {
                    "month": {"$substr": ["$event_date", 0, 7]},
                    "status": "$status",
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.month": ASCENDING}},
    ]
    monthly_data: dict[str, dict[str, Any]] = {}
    for row in events.aggregate(pipeline_monthly):
        m = row["_id"].get("month")
        st = row["_id"].get("status")
        if not m:
            continue
        if m not in monthly_data:
            monthly_data[m] = {"month": m, "approved": 0, "pending": 0, "rejected": 0, "total": 0}
        monthly_data[m][st] = monthly_data[m].get(st, 0) + row["count"]
        monthly_data[m]["total"] += row["count"]

    monthly_trends = sorted(monthly_data.values(), key=lambda x: x["month"])[-12:]

    # 3. Category distribution (Top event types)
    pipeline_cat = [
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": DESCENDING}},
        {"$limit": 8},
    ]
    category_distribution = [
        {"name": row["_id"] or "Uncategorized", "value": row["count"]}
        for row in events.aggregate(pipeline_cat)
    ]

    # 4. Department Participation Leaderboard
    teachers_cursor = users.find({"role": "teacher"}, {"_id": 1, "department": 1})
    teacher_dept_map = {str(t["_id"]): t.get("department") or "Unassigned" for t in teachers_cursor}

    dept_counts: dict[str, int] = {}
    for ev in events.find({}, {"teacher_id": 1}):
        tid = str(ev.get("teacher_id", ""))
        dept = teacher_dept_map.get(tid, "Unassigned")
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

    department_leaderboard = [
        {"department": dept, "events": count}
        for dept, count in sorted(dept_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    return {
        "success": True,
        "kpis": {
            "total_events": total_events,
            "approved_events": approved_events,
            "pending_events": pending_events,
            "rejected_events": rejected_events,
            "total_users": total_users,
            "total_teachers": total_teachers,
            "total_deans": total_deans,
            "total_media": total_media,
        },
        "monthly_trends": monthly_trends,
        "category_distribution": category_distribution,
        "department_leaderboard": department_leaderboard,
    }


# ============================================================
# BULK TEACHER ONBOARDING & CREDENTIAL DELIVERY
# ============================================================

def _parse_teachers_csv(content: str) -> list[dict]:
    """Parse CSV text into a list of {name, email, department} dictionaries."""
    f = io.StringIO(content.strip())
    reader = csv.reader(f)
    rows = list(reader)
    if not rows:
        return []

    header = [str(col).strip().lower() for col in rows[0]]
    name_idx = -1
    email_idx = -1
    dept_idx = -1

    for idx, col in enumerate(header):
        if col in ("name", "teacher name", "teacher_name", "full name", "fullname", "faculty name"):
            name_idx = idx
        elif col in ("email", "email id", "email_id", "email address", "username", "mail"):
            email_idx = idx
        elif col in ("department", "dept", "department name", "dept name"):
            dept_idx = idx

    start_row = 1
    if name_idx == -1 and email_idx == -1:
        start_row = 0
        name_idx = 0
        email_idx = 1
        dept_idx = 2 if len(rows[0]) > 2 else -1
    elif name_idx == -1:
        name_idx = 0 if email_idx != 0 else 1
    elif email_idx == -1:
        email_idx = 1 if name_idx != 1 else 0

    teachers = []
    for row in rows[start_row:]:
        if not row or not any(cell.strip() for cell in row):
            continue
        name = row[name_idx].strip() if name_idx < len(row) else ""
        email = row[email_idx].strip().casefold() if email_idx < len(row) else ""
        dept = row[dept_idx].strip() if dept_idx != -1 and dept_idx < len(row) else None
        if name and email:
            teachers.append({"name": name, "email": email, "department": dept or None})

    return teachers


@router.post("/teachers/bulk-onboard")
def bulk_onboard_teachers(
    payload: BulkOnboardTeachersRequest,
    authorization: str | None = Header(default=None),
):
    """Bulk create teacher accounts with auto-generated temporary passwords and send credentials."""
    superadmin_user = get_superadmin_user(authorization)

    created_count = 0
    skipped: list[dict] = []
    email_failures: list[dict] = []
    email_sent_count = 0
    created_teachers: list[dict] = []

    for item in payload.teachers:
        email = str(item.email).strip().casefold()
        name = str(item.name).strip()
        dept = str(item.department).strip() if item.department else None

        existing = find_user_by_email(email)
        if existing:
            skipped.append({
                "email": email,
                "name": name,
                "reason": "An account with this email already exists",
            })
            continue

        temp_password = generate_temporary_password(12)
        doc = new_user_document(
            name=name,
            email=email,
            password_hash=hash_password(temp_password),
            role="teacher",
            email_verified=True,
            must_change_password=True,
            department=dept,
            is_active=True,
        )

        try:
            users.insert_one(doc)
        except DuplicateKeyError:
            skipped.append({
                "email": email,
                "name": name,
                "reason": "An account with this email already exists",
            })
            continue

        created_count += 1
        created_teachers.append({
            "name": name,
            "email": email,
            "department": dept,
            "temporary_password": temp_password,
        })

        if payload.send_email:
            try:
                email_service.send_teacher_credentials_email(email, name, temp_password)
                email_sent_count += 1
            except Exception as e:
                logger.warning("bulk_teacher_email_failed recipient=%s error=%s", email, e)
                email_failures.append({
                    "email": email,
                    "name": name,
                    "reason": str(e),
                })

    log_audit_event(
        actor=superadmin_user,
        action="teachers_bulk_onboarded",
        target_type="teachers_batch",
        target_id=f"batch_{created_count}",
        details={
            "created_count": created_count,
            "skipped_count": len(skipped),
            "email_sent_count": email_sent_count,
            "email_failed_count": len(email_failures),
        },
    )

    return {
        "success": True,
        "total_processed": len(payload.teachers),
        "created_count": created_count,
        "skipped_count": len(skipped),
        "email_sent_count": email_sent_count,
        "email_failed_count": len(email_failures),
        "skipped": skipped,
        "email_failures": email_failures,
        "created_teachers": created_teachers,
    }


@router.post("/teachers/bulk-onboard-file")
async def bulk_onboard_teachers_file(
    file: UploadFile = File(...),
    send_email: bool = Form(default=True),
    authorization: str | None = Header(default=None),
):
    """Accept a CSV file directly for bulk teacher onboarding."""
    get_superadmin_user(authorization)

    content_bytes = await file.read()
    try:
        content_text = content_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        content_text = content_bytes.decode("latin-1")

    parsed = _parse_teachers_csv(content_text)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid teacher records found in the uploaded CSV file. Ensure it has Name and Email columns.",
        )

    payload = BulkOnboardTeachersRequest(
        teachers=[BulkOnboardTeacherItem(**t) for t in parsed],
        send_email=send_email,
    )
    return bulk_onboard_teachers(payload, authorization)


@router.post("/teachers/send-credentials")
def send_credentials_to_teachers(
    payload: SendCredentialsRequest,
    authorization: str | None = Header(default=None),
):
    """Regenerate a unique temporary password and send login credentials email for selected teachers."""
    superadmin_user = get_superadmin_user(authorization)

    sent_count = 0
    failures: list[dict] = []
    updated_teachers: list[dict] = []

    for user_id in payload.user_ids:
        doc = find_user_or_404(user_id)
        if doc.get("role") != "teacher":
            continue

        temp_password = generate_temporary_password(12)
        users.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "password_hash": hash_password(temp_password),
                    "must_change_password": True,
                    "updated_at": utc_now(),
                },
                "$inc": {"token_version": 1},
            },
        )

        email = doc["email"]
        name = doc.get("name") or "Teacher"
        updated_teachers.append({
            "name": name,
            "email": email,
            "temporary_password": temp_password,
        })

        try:
            email_service.send_teacher_credentials_email(email, name, temp_password)
            sent_count += 1
        except Exception as e:
            logger.warning("send_credentials_failed recipient=%s error=%s", email, e)
            failures.append({"email": email, "name": name, "reason": str(e)})

    log_audit_event(
        actor=superadmin_user,
        action="teachers_credentials_sent",
        target_type="teachers_batch",
        target_id=f"batch_{len(payload.user_ids)}",
        details={"sent_count": sent_count, "failed_count": len(failures)},
    )

    return {
        "success": True,
        "sent_count": sent_count,
        "failed_count": len(failures),
        "failures": failures,
        "teachers": updated_teachers,
    }


