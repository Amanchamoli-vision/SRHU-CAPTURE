"""The Dean's Teacher-account management.

Every route here acts on **Teacher accounts only**. The target is always looked
up with ``role: "teacher"`` in the filter -- and every write repeats that
condition -- so a Dean can never reach a superadmin, another Dean or their own
account, and a teacher promoted or deleted between the read and the write is
not modified by a stale request.

What deliberately differs from the superadmin equivalents in superadmin.py:

* No password is ever returned. The superadmin's credential and reset routes
  hand the temporary password back as an out-of-band fallback; a Dean only
  ever triggers an email.
* "Reset password" issues the same one-time link as /auth/forgot-password
  rather than setting a temporary password, and leaves the current password
  working until the teacher chooses a new one.
* Emails are sent synchronously, so the Dean sees each teacher's real outcome.
  A new credential is written only after its email was accepted by the SMTP
  server: a failed delivery therefore never replaces a password nobody knows.

Audit entries reuse the superadmin's action names where the action is the
same (so the superadmin's existing audit filters include Dean actions) and all
carry ``details.via = "dean_panel"`` so the Dean panel can list its own.
"""

import logging
import re
import secrets
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.database import audit_logs, users
from app.models.documents import USER_PRIVATE_FIELDS, new_user_document
from app.routers.auth import find_user_by_email
from app.schemas.dean import (
    DeanImportTeachersRequest,
    DeanSendCredentialsRequest,
    DeanUpdateTeacherRequest,
)
from app.services import email_service, teacher_import
from app.services.audit_service import log_audit_event
from app.services.storage_service import delete_user_cascade
from app.utils.auth import dean_dep, public_user
from app.utils.security import (
    generate_one_time_token,
    generate_temporary_password,
    hash_one_time_token,
    hash_password,
)
from app.utils.serializers import serialize_many, to_object_id, utc_now


router = APIRouter(
    prefix="/dean/teachers",
    tags=["Dean Teacher Management"],
    dependencies=[Depends(dean_dep)],
)
logger = logging.getLogger(__name__)

VIA = "dean_panel"

# Two sends to the same teacher inside this window are almost always a double
# click or two Deans acting at once; the second would silently invalidate the
# password the first one just delivered.
CREDENTIALS_RESEND_COOLDOWN_MINUTES = 10

STATUS_FILTERS = ("all", "active", "inactive", "pending")
VERIFIED_FILTERS = ("all", "verified", "unverified")
SOURCE_FILTERS = ("all", "imported", "registered")

# Marks an account created from a Dean's Excel import.
IMPORT_SOURCE = "dean_import"
SORTS = {
    "newest": [("created_at", DESCENDING), ("_id", DESCENDING)],
    "oldest": [("created_at", ASCENDING), ("_id", ASCENDING)],
    "name": [("name", ASCENDING), ("_id", ASCENDING)],
    "last_login": [("last_sign_in_at", DESCENDING), ("_id", DESCENDING)],
}

EMAIL_NOT_CONFIGURED = "Email delivery is not configured on the server, so no email can be sent."

_email_adapter = TypeAdapter(EmailStr)


# ============================================================
# HELPERS
# ============================================================

def _canonical_id(user_id: str) -> str:
    object_id = to_object_id(user_id)
    return str(object_id) if object_id is not None else user_id


def find_teacher_or_404(user_id: str, actor: dict) -> dict:
    """The Teacher account with this id, or 404 for anything else.

    A superadmin or Dean id answers exactly like an unknown one, so these
    routes cannot be used to probe or touch accounts outside a Dean's remit.
    """
    if _canonical_id(user_id) == actor.get("id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot manage your own account from here.",
        )

    object_id = to_object_id(user_id)
    teacher = users.find_one({"_id": object_id, "role": "teacher"}) if object_id else None
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found",
        )
    return teacher


def _label(doc: dict) -> str:
    return doc.get("name") or doc.get("email") or "this teacher"


def _domain(email: str) -> str:
    return (email or "").rsplit("@", 1)[-1]


def _audit(actor: dict, action: str, target: dict | None, details: dict[str, Any]) -> None:
    log_audit_event(
        actor=actor,
        action=action,
        target_type="user" if target is not None else "teachers_batch",
        target_id=str(target["_id"]) if target is not None else None,
        details={
            "via": VIA,
            **(
                {
                    "target_name": target.get("name"),
                    "target_email": target.get("email"),
                    "target_role": "teacher",
                }
                if target is not None
                else {}
            ),
            **details,
        },
    )


def _valid_email(value: str | None) -> bool:
    if not value:
        return False
    try:
        _email_adapter.validate_python(value)
    except ValidationError:
        return False
    return True


def _is_active(doc: dict) -> bool:
    return doc.get("is_active") is not False


# ============================================================
# LIST
# ============================================================

@router.get("")
def list_teachers(
    q: str | None = Query(default=None, max_length=200),
    # Named account_status, not status: `status` would shadow fastapi.status.
    account_status: str = Query(default="all", alias="status", max_length=20),
    verified: str = Query(default="all", max_length=20),
    source: str = Query(default="all", max_length=20),
    sort: str = Query(default="newest", max_length=20),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
):
    base: dict[str, Any] = {"role": "teacher"}

    search = (q or "").strip()
    if search:
        pattern = re.escape(search)
        base["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
            {"phone": {"$regex": pattern, "$options": "i"}},
            {"department": {"$regex": pattern, "$options": "i"}},
        ]

    verified_key = verified.strip().lower()
    if verified_key == "verified":
        base["email_verified"] = True
    elif verified_key == "unverified":
        base["email_verified"] = {"$ne": True}

    source_key = source.strip().lower()
    if source_key == "imported":
        base["onboarded_via"] = IMPORT_SOURCE
    elif source_key == "registered":
        base["onboarded_via"] = {"$ne": IMPORT_SOURCE}

    # Tab counts under every other filter, so each number is what clicking
    # that tab would show.
    status_queries = {
        "all": {},
        "active": {"is_active": {"$ne": False}},
        "inactive": {"is_active": False},
        # Never signed in: the people credentials are for.
        "pending": {"last_sign_in_at": None},
    }
    counts = {key: users.count_documents({**base, **extra}) for key, extra in status_queries.items()}

    status_key = account_status.strip().lower()
    if status_key not in STATUS_FILTERS:
        status_key = "all"
    query = {**base, **status_queries[status_key]}

    total = counts[status_key]
    cursor = (
        users.find(query, {field: 0 for field in USER_PRIVATE_FIELDS})
        .sort(SORTS.get(sort, SORTS["newest"]))
        .skip(skip)
        .limit(limit)
    )
    # Excluded twice on purpose: by the projection, and again on the way out,
    # so no credential field can reach a Dean even if the projection changes.
    teachers = serialize_many(cursor, exclude=USER_PRIVATE_FIELDS)

    return {
        "success": True,
        "teachers": teachers,
        "total": total,
        "count": len(teachers),
        "has_more": skip + len(teachers) < total,
        "skip": skip,
        "limit": limit,
        "counts": counts,
        "email_configured": email_service.is_configured(),
        "credentials_cooldown_minutes": CREDENTIALS_RESEND_COOLDOWN_MINUTES,
    }


@router.get("/activity")
def teacher_management_activity(limit: int = Query(default=20, ge=1, le=100)):
    """Recent teacher-management actions taken from the Dean panel, by any Dean."""
    cursor = (
        audit_logs.find({"details.via": VIA})
        .sort([("created_at", DESCENDING)])
        .limit(limit)
    )
    return {"success": True, "logs": serialize_many(cursor)}


# ============================================================
# IMPORT FROM EXCEL / CSV
# ============================================================

@router.post("/import/preview")
async def preview_teacher_import(file: UploadFile = File(...)):
    """Read a roster file and say what importing each row would do.

    Nothing is written. Every row comes back with a status: ``new`` (an
    account will be created), ``exists`` (an account with that email is
    already there -- of any role, so a Dean or superadmin address is never
    turned into a Teacher), ``duplicate`` (repeated in the file) or
    ``invalid`` (with why).
    """
    # One byte over the limit is enough to know it is too large, without
    # reading an arbitrarily large upload into memory.
    content = await file.read(teacher_import.MAX_FILE_BYTES + 1)
    try:
        rows = teacher_import.read_rows(file.filename, content)
        entries, truncated = teacher_import.parse_roster(rows)
    except teacher_import.ImportFileError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))

    if not entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No teachers were found in this file. It needs at least an Email column.",
        )

    for entry in entries:
        if entry["status"] != "ok":
            continue
        existing = find_user_by_email(entry["email"])
        if existing:
            entry["status"] = "exists"
            entry["reason"] = (
                "Already in the teacher list."
                if existing.get("role") == "teacher"
                else "This email belongs to an account that is not a Teacher."
            )
        else:
            entry["status"] = "new"

    counts = {key: 0 for key in ("new", "exists", "duplicate", "invalid")}
    for entry in entries:
        counts[entry["status"]] += 1

    return {
        "success": True,
        "filename": file.filename,
        "rows": entries,
        "total": len(entries),
        "counts": counts,
        "truncated": truncated,
        "max_rows": teacher_import.MAX_ROWS,
        "email_configured": email_service.is_configured(),
    }


@router.post("/import")
def import_teachers(payload: DeanImportTeachersRequest, dean: dict = Depends(dean_dep)):
    """Create Teacher accounts for the rows the Dean confirmed.

    Every row is checked again here -- the preview is advisory, and time has
    passed since it. An address with any existing account is skipped, never
    overwritten.

    The accounts have no usable password: the hash below is of a random
    secret that is discarded at once, so nobody can sign in until the Dean
    sends credentials (POST /dean/teachers/send-credentials, which the panel
    does straight after when "send email" is on) or the teacher uses Forgot
    password. It is a real bcrypt hash rather than none so that signing in to
    one of these accounts costs the same time as any other and does not reveal
    that it exists. One hash is shared by the whole batch: hashing 500 would
    take minutes, and the secret behind it is unknowable either way.
    """
    unusable_hash = hash_password(secrets.token_urlsafe(32))
    now = utc_now()

    results: list[dict] = []
    seen: set[str] = set()
    for item in payload.teachers:
        email = item.email
        if email in seen:
            results.append({"email": email, "name": item.name, "status": "skipped",
                            "reason": "Repeated in this import.", "user_id": None})
            continue
        seen.add(email)

        if find_user_by_email(email):
            results.append({"email": email, "name": item.name, "status": "skipped",
                            "reason": "An account with this email already exists.", "user_id": None})
            continue

        name = item.name or teacher_import.name_from_email(email)
        document = new_user_document(
            name=name,
            email=email,
            password_hash=unusable_hash,
            role="teacher",
            # Nothing has proved this mailbox yet. Delivering credentials, or
            # completing a password reset, marks it verified.
            email_verified=False,
            must_change_password=True,
            phone=item.phone,
            department=item.department,
            designation=item.designation,
        )
        document.update({
            "onboarded_via": IMPORT_SOURCE,
            "imported_by": dean.get("id"),
            "imported_at": now,
        })

        try:
            inserted = users.insert_one(document)
        except DuplicateKeyError:
            results.append({"email": email, "name": name, "status": "skipped",
                            "reason": "An account with this email already exists.", "user_id": None})
            continue

        results.append({"email": email, "name": name, "status": "created",
                        "reason": None, "user_id": str(inserted.inserted_id)})

    created = [r for r in results if r["status"] == "created"]
    skipped = [r for r in results if r["status"] == "skipped"]

    _audit(dean, "teachers_imported", None, {
        "result": "success" if created else "failed",
        "requested_count": len(results),
        "created_count": len(created),
        "skipped_count": len(skipped),
        "results": [
            {"user_id": r["user_id"], "email": r["email"], "status": r["status"], "reason": r["reason"]}
            for r in results
        ],
    })

    return {
        "success": True,
        "requested_count": len(results),
        "created_count": len(created),
        "skipped_count": len(skipped),
        "results": results,
    }


# ============================================================
# EDIT
# ============================================================

EDITABLE_FIELDS = ("name", "email", "phone", "department", "designation")


@router.patch("/{user_id}")
def update_teacher(
    user_id: str,
    payload: DeanUpdateTeacherRequest,
    dean: dict = Depends(dean_dep),
):
    teacher = find_teacher_or_404(user_id, dean)

    sent = payload.model_fields_set
    changes: dict[str, Any] = {}
    for field in EDITABLE_FIELDS:
        if field in sent:
            value = getattr(payload, field)
            if value != teacher.get(field):
                changes[field] = value

    if not changes:
        return {
            "success": True,
            "message": "Nothing to update.",
            "teacher": public_user(teacher),
        }

    update: dict[str, Any] = {**changes, "updated_at": utc_now()}

    if "email" in changes:
        # Same lookup as registration and login, so a Gmail dot variant of
        # another account is caught too.
        existing = find_user_by_email(changes["email"])
        if existing and existing["_id"] != teacher["_id"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another account already uses this email address.",
            )
        # Any reset or verification link still outstanding went to the old
        # address; it must not keep working once that address is no longer
        # the account's.
        update.update({
            "reset_token_hash": None,
            "reset_expires_at": None,
            "verification_token_hash": None,
            "verification_expires_at": None,
        })

    updated = users.find_one_and_update(
        {"_id": teacher["_id"], "role": "teacher"},
        {"$set": update},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

    _audit(dean, "user_profile_updated", teacher, {
        "result": "success",
        "changed": {field: {"from": teacher.get(field), "to": value} for field, value in changes.items()},
    })

    return {
        "success": True,
        "message": f"{_label(updated)}'s profile was updated.",
        "teacher": public_user(updated),
    }


# ============================================================
# ACTIVATE / DEACTIVATE
# ============================================================

def _set_active(user_id: str, dean: dict, active: bool) -> dict:
    teacher = find_teacher_or_404(user_id, dean)
    word = "active" if active else "inactive"

    if _is_active(teacher) == active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{_label(teacher)}'s account is already {word}.",
        )

    update: dict[str, Any] = {"$set": {"is_active": active, "updated_at": utc_now()}}
    if not active:
        # Ends every session now rather than at the next token check.
        # authenticate() refuses an inactive account as well.
        update["$inc"] = {"token_version": 1}

    updated = users.find_one_and_update(
        {"_id": teacher["_id"], "role": "teacher"},
        update,
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

    action = "user_activated" if active else "user_deactivated"
    _audit(dean, action, teacher, {"result": "success", "is_active": active})

    return {
        "success": True,
        "message": (
            f"{_label(teacher)} can sign in again."
            if active
            else f"{_label(teacher)} was deactivated and signed out everywhere."
        ),
        "teacher": public_user(updated),
    }


@router.post("/{user_id}/activate")
def activate_teacher(user_id: str, dean: dict = Depends(dean_dep)):
    return _set_active(user_id, dean, True)


@router.post("/{user_id}/deactivate")
def deactivate_teacher(user_id: str, dean: dict = Depends(dean_dep)):
    return _set_active(user_id, dean, False)


# ============================================================
# DELETE
# ============================================================

@router.delete("/{user_id}")
def delete_teacher(user_id: str, dean: dict = Depends(dean_dep)):
    """Delete a Teacher with the application's standard cascade.

    Same rule as the superadmin's delete: the teacher's events, media,
    documents, reports and notifications go with the account.
    """
    teacher = find_teacher_or_404(user_id, dean)

    delete_user_cascade(str(teacher["_id"]))

    _audit(dean, "user_deleted", teacher, {"result": "success", "role": "teacher"})

    return {
        "success": True,
        "message": f"{_label(teacher)}'s account was deleted.",
        "teacher": public_user(teacher),
    }


# ============================================================
# PROMOTE TO DEAN
# ============================================================

@router.post("/{user_id}/promote")
def promote_teacher(user_id: str, dean: dict = Depends(dean_dep)):
    teacher = find_teacher_or_404(user_id, dean)

    if not _is_active(teacher):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Activate this account before promoting it to Dean.",
        )

    # token_version is bumped so the promoted user's open sessions end and
    # their next sign-in lands in the Dean panel, instead of a browser still
    # holding the Teacher screens against an account that is now a Dean.
    updated = users.find_one_and_update(
        {"_id": teacher["_id"], "role": "teacher"},
        {"$set": {"role": "dean", "updated_at": utc_now()}, "$inc": {"token_version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is no longer a Teacher.",
        )

    _audit(dean, "role_change", teacher, {
        "result": "success",
        "old_role": "teacher",
        "new_role": "dean",
        "user_name": teacher.get("name"),
    })

    return {
        "success": True,
        "message": f"{_label(teacher)} is now a Dean. They will be asked to sign in again.",
        "teacher": public_user(updated),
    }


# ============================================================
# PASSWORD RESET (one-time link)
# ============================================================

@router.post("/{user_id}/reset-password")
def send_password_reset(user_id: str, dean: dict = Depends(dean_dep)):
    """Email the teacher a one-time link to choose a new password.

    The mechanism of /auth/forgot-password: only the token's hash is stored,
    it expires, and completing it signs the teacher out everywhere. The
    current password keeps working until then, so a Dean can never lock a
    teacher out by starting a reset.
    """
    teacher = find_teacher_or_404(user_id, dean)

    if not _is_active(teacher):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is deactivated. Activate it before resetting the password.",
        )
    if not _valid_email(teacher.get("email")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This teacher's email address is not valid. Correct it first.",
        )
    if not email_service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=EMAIL_NOT_CONFIGURED)

    token = generate_one_time_token()
    token_hash = hash_one_time_token(token)
    now = utc_now()
    users.update_one(
        {"_id": teacher["_id"], "role": "teacher"},
        {"$set": {
            "reset_token_hash": token_hash,
            "reset_expires_at": now + timedelta(minutes=settings.password_reset_expire_minutes),
            "updated_at": now,
        }},
    )

    try:
        email_service.send_password_reset_email(teacher["email"], teacher.get("name") or "there", token)
    except email_service.EmailDeliveryError:
        # A link nobody received is withdrawn, conditional on it still being
        # the current one.
        users.update_one(
            {"_id": teacher["_id"], "reset_token_hash": token_hash},
            {"$set": {"reset_token_hash": None, "reset_expires_at": None}},
        )
        logger.warning("dean_password_reset_email_failed recipient_domain=%s", _domain(teacher["email"]))
        _audit(dean, "password_reset_link_sent", teacher, {"result": "failed", "reason": "email_delivery_failed"})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The password reset email could not be delivered. Please try again later.",
        )

    _audit(dean, "password_reset_link_sent", teacher, {
        "result": "success",
        "expires_in_minutes": settings.password_reset_expire_minutes,
    })

    return {
        "success": True,
        "message": f"A password reset link was emailed to {teacher['email']}.",
    }


# ============================================================
# LOGIN CREDENTIALS (single and bulk)
# ============================================================

def _credential_skip_reason(doc: dict) -> str | None:
    """Why this teacher should not be sent new credentials, or None."""
    if not _is_active(doc):
        return "Account is deactivated. Activate it first."
    if not _valid_email(doc.get("email")):
        return "Email address on the account is not valid."
    if doc.get("last_sign_in_at") and not doc.get("must_change_password"):
        # They have signed in and chose their own password: new credentials
        # would overwrite it. A reset link is the right tool.
        return "Already signed in with their own password. Use Reset Password instead."
    sent_at = doc.get("credentials_sent_at")
    if sent_at is not None:
        if sent_at.tzinfo is None:  # PyMongo returns naive UTC by default
            sent_at = sent_at.replace(tzinfo=utc_now().tzinfo)
        if utc_now() - sent_at < timedelta(minutes=CREDENTIALS_RESEND_COOLDOWN_MINUTES):
            return (
                "Credentials were sent less than "
                f"{CREDENTIALS_RESEND_COOLDOWN_MINUTES} minutes ago."
            )
    return None


def _deliver_credentials(doc: dict) -> tuple[str, str | None]:
    """Send one teacher new credentials. Returns ``(outcome, reason)``.

    The email goes first; the password is written only once the SMTP server
    has accepted it. The write is conditional on the account still being an
    active Teacher, so a concurrent promote / deactivate / delete wins.
    """
    temporary_password = generate_temporary_password(12)
    try:
        email_service.send_teacher_credentials_email(
            doc["email"], doc.get("name") or "Teacher", temporary_password
        )
    except email_service.EmailDeliveryError:
        logger.warning("dean_credentials_email_failed recipient_domain=%s", _domain(doc["email"]))
        return "failed", "The email could not be delivered."

    now = utc_now()
    fields: dict[str, Any] = {
        "password_hash": hash_password(temporary_password),
        "must_change_password": True,
        "credentials_sent_at": now,
        "updated_at": now,
        # The password exists only in that mailbox, so signing in with it
        # proves ownership -- the same reasoning /auth/reset-password uses.
        "email_verified": True,
    }
    if not doc.get("email_verified_at"):
        fields["email_verified_at"] = now

    result = users.update_one(
        {"_id": doc["_id"], "role": "teacher", "is_active": {"$ne": False}},
        {"$set": fields, "$inc": {"token_version": 1}},
    )
    if getattr(result, "matched_count", 1) == 0:
        return "failed", "The account changed while sending. The emailed password is not active."
    return "sent", None


def _result_row(doc: dict | None, user_id: str, outcome: str, reason: str | None) -> dict:
    return {
        "user_id": str(doc["_id"]) if doc else user_id,
        "name": doc.get("name") if doc else None,
        "email": doc.get("email") if doc else None,
        "status": outcome,
        "reason": reason,
    }


@router.post("/send-credentials")
def send_credentials_bulk(payload: DeanSendCredentialsRequest, dean: dict = Depends(dean_dep)):
    """Send login credentials to several teachers; report each one's outcome.

    Every id is resolved and checked before anything is sent, so the response
    always accounts for every requested teacher: sent, skipped (with why) or
    failed (with why).
    """
    if not email_service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=EMAIL_NOT_CONFIGURED)

    results: list[dict] = []
    seen: set[str] = set()
    for raw_id in payload.user_ids:
        user_id = _canonical_id(raw_id)
        if user_id in seen:
            continue
        seen.add(user_id)

        object_id = to_object_id(user_id)
        doc = users.find_one({"_id": object_id}) if object_id else None
        if not doc or doc.get("role") != "teacher" or user_id == dean.get("id"):
            # Not distinguished further, as with find_teacher_or_404.
            results.append(_result_row(None, user_id, "skipped", "Not a Teacher account."))
            continue

        reason = _credential_skip_reason(doc)
        if reason:
            results.append(_result_row(doc, user_id, "skipped", reason))
            continue

        outcome, reason = _deliver_credentials(doc)
        results.append(_result_row(doc, user_id, outcome, reason))

    sent = [r for r in results if r["status"] == "sent"]
    failed = [r for r in results if r["status"] == "failed"]
    skipped = [r for r in results if r["status"] == "skipped"]

    _audit(dean, "teachers_credentials_sent", None, {
        "result": "success" if not failed else ("failed" if not sent else "partial"),
        "requested_count": len(results),
        "sent_count": len(sent),
        "failed_count": len(failed),
        "skipped_count": len(skipped),
        # Who and what happened -- never the passwords.
        "results": [
            {"user_id": r["user_id"], "email": r["email"], "status": r["status"], "reason": r["reason"]}
            for r in results
        ],
    })

    return {
        "success": True,
        "requested_count": len(results),
        "sent_count": len(sent),
        "failed_count": len(failed),
        "skipped_count": len(skipped),
        "results": results,
    }


@router.post("/{user_id}/send-credentials")
def send_credentials_single(user_id: str, dean: dict = Depends(dean_dep)):
    teacher = find_teacher_or_404(user_id, dean)

    if not email_service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=EMAIL_NOT_CONFIGURED)

    reason = _credential_skip_reason(teacher)
    if reason:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    outcome, reason = _deliver_credentials(teacher)
    _audit(dean, "teacher_credentials_sent", teacher, {
        "result": "success" if outcome == "sent" else "failed",
        **({"reason": reason} if reason else {}),
    })

    if outcome != "sent":
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=reason)

    return {
        "success": True,
        "message": f"Login credentials were emailed to {teacher['email']}.",
    }
