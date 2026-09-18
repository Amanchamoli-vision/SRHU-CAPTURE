import logging
import re
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.database import users
from app.models.documents import ROLES, new_user_document
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegistrationRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.services import email_service
from app.services.email_service import EmailDeliveryError
from app.utils import rate_limit
from app.utils.auth import (
    SESSION_EXPIRED_MESSAGE,
    authenticate,
    get_current_user,
    public_user,
    stored_token_version,
)
from app.utils.security import (
    burn_password_check,
    create_access_token,
    generate_one_time_token,
    hash_one_time_token,
    hash_password,
    verify_password,
)
from app.utils.serializers import utc_now


router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


GENERIC_RESEND_MESSAGE = (
    "If an account with that email exists and is not yet verified, "
    "a new verification email has been sent."
)
GENERIC_RESET_MESSAGE = (
    "If an account with that email exists, a password reset email has been sent."
)
REGISTERED_VERIFY_MESSAGE = (
    "Account created successfully! Check your email for the verification "
    "link. It can take a minute to arrive."
)
ACCOUNT_EXISTS_MESSAGE = "An account with this email already exists."
VERIFY_PASSWORD_MISMATCH_MESSAGE = (
    "The password doesn't match this account. If you didn't create it, "
    "use Forgot password to set your own password."
)


def _domain(email: str) -> str:
    return email.rsplit("@", 1)[-1]


GMAIL_DOMAINS = ("gmail.com", "googlemail.com")


def find_user_by_email(email: str) -> dict | None:
    """Look an account up by email, treating Gmail dot variants as one address.

    Gmail ignores dots in the local part, so a user who registered as
    ``first.last@gmail.com`` receives mail sent to ``firstlast@gmail.com`` and
    will often type either form. An exact match always wins; otherwise a Gmail
    address matches any stored spelling that differs only in its dots. If
    several stored spellings match (created before this lookup existed), the
    choice is deterministic: a verified account first, then the oldest.
    """
    user = users.find_one({"email": email})
    if user:
        return user

    local, _, domain = email.partition("@")
    if domain not in GMAIL_DOMAINS:
        return None

    letters = local.replace(".", "")
    if not letters:
        return None
    pattern = (
        "^"
        + r"\.?".join(re.escape(ch) for ch in letters)
        + "@(" + "|".join(re.escape(d) for d in GMAIL_DOMAINS) + ")$"
    )
    return users.find_one(
        {"email": {"$regex": pattern}},
        sort=[("email_verified", DESCENDING), ("created_at", ASCENDING), ("_id", ASCENDING)],
    )


# A full SMTP session -- connect, STARTTLS, login, send -- costs several
# seconds against a public relay, and a user should not sit through it. These
# run after the response has been returned, matching how the superadmin and event
# routers already queue their mail. A failure here is recoverable: the account
# keeps its token and /auth/resend-verification issues a fresh email.
def _deliver_verification(email: str, name: str, token: str) -> None:
    try:
        email_service.send_verification_email(email, name, token)
    except EmailDeliveryError:
        logger.warning("verification_email_failed recipient_domain=%s", _domain(email))


def _deliver_password_reset(email: str, name: str, token: str) -> None:
    try:
        email_service.send_password_reset_email(email, name, token)
    except EmailDeliveryError:
        logger.warning("password_reset_email_failed recipient_domain=%s", _domain(email))


def _deliver_registration_attempt(email: str, name: str) -> None:
    try:
        email_service.send_registration_attempt_email(email, name)
    except EmailDeliveryError:
        logger.warning("registration_attempt_email_failed recipient_domain=%s", _domain(email))


def _issue_verification_token() -> tuple[str, dict]:
    token = generate_one_time_token()
    fields = {
        "verification_token_hash": hash_one_time_token(token),
        "verification_expires_at": utc_now()
        + timedelta(hours=settings.email_verification_expire_hours),
    }
    return token, fields


def _session_response(user_document: dict) -> dict:
    token, expires_in = create_access_token(
        str(user_document["_id"]),
        user_document["role"],
        token_version=stored_token_version(user_document),
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": public_user(user_document),
    }


# ============================================================
# REGISTER
# ============================================================

def _registration_for_existing_account(
    existing: dict, background_tasks: BackgroundTasks
) -> dict:
    """Answer a registration for an address that already has an account.

    The response is identical to a brand-new registration so the endpoint
    cannot be used to find out who has an account. The mailbox owner is the
    only one who learns anything: an unverified account gets a fresh
    verification link (the old one stops working), a verified one gets a
    "someone tried to register with your email" notice.
    """
    name = existing.get("name") or "there"
    if existing.get("email_verified"):
        background_tasks.add_task(_deliver_registration_attempt, existing["email"], name)
        logger.info("registration_existing_account verified=true")
    else:
        token, token_fields = _issue_verification_token()
        users.update_one(
            {"_id": existing["_id"]},
            {"$set": {**token_fields, "updated_at": utc_now()}},
        )
        background_tasks.add_task(_deliver_verification, existing["email"], name, token)
        logger.info("registration_existing_account verified=false link=reissued")
    return {"message": REGISTERED_VERIFY_MESSAGE}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest, request: Request, background_tasks: BackgroundTasks):
    """Create a teacher account and queue the email verification link over SMTP."""
    verification_required = settings.require_email_verification

    if verification_required and not email_service.is_configured():
        logger.error("registration_unavailable reason=smtp_not_configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Registration is temporarily unavailable. Please try again later.",
        )

    email = str(payload.email).casefold()
    rate_limit.limit_email_sending(request, "register", email)
    logger.info("registration_started recipient_domain=%s", _domain(email))

    # Hashed before the lookup so that a new and an existing address cost the
    # same bcrypt round and cannot be told apart by response time.
    password_hash = hash_password(payload.password)

    existing = find_user_by_email(email)
    if existing:
        if not verification_required:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACCOUNT_EXISTS_MESSAGE)
        return _registration_for_existing_account(existing, background_tasks)

    document = new_user_document(
        name=payload.name,
        email=email,
        password_hash=password_hash,
        role="teacher",
        email_verified=not verification_required,
    )

    token = None
    if verification_required:
        token, token_fields = _issue_verification_token()
        document.update(token_fields)

    try:
        users.insert_one(document)
    except DuplicateKeyError:
        # A concurrent registration for the same address won the race to the
        # unique index; answer exactly as if the lookup had found it.
        existing = find_user_by_email(email) if verification_required else None
        if existing is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACCOUNT_EXISTS_MESSAGE)
        return _registration_for_existing_account(existing, background_tasks)

    if not verification_required:
        logger.info("registration_completed verification=skipped")
        return {"message": "Account created successfully! You can now sign in."}

    background_tasks.add_task(_deliver_verification, email, payload.name, token)

    logger.info("registration_completed verification=email_queued")
    return {"message": REGISTERED_VERIFY_MESSAGE}


# ============================================================
# EMAIL VERIFICATION
# ============================================================

@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, request: Request):
    """Confirm an address. Needs the account's password as well as the link.

    Anyone can register an address they do not own. Without the password check
    the real owner clicking the link would verify -- and hand over -- an account
    whose password the registrant chose. The owner is told instead to use
    Forgot password, which sets their own password and verifies the address.
    """
    rate_limit.limit_token_use(request, "verify-email")

    token_hash = hash_one_time_token(payload.token)
    user = users.find_one({"verification_token_hash": token_hash})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has already been used.",
        )

    # Opening the same link twice -- a second click, a mail scanner prefetching
    # it, or React StrictMode running the page's effect twice in development --
    # must not turn a successful verification into an error. The token hash is
    # kept after use for exactly this; it can only ever re-confirm this account
    # and is replaced whenever a new link is issued.
    if user.get("email_verified"):
        return {
            "message": "Your email is already verified. You can sign in.",
            "email": user["email"],
        }

    expires_at = user.get("verification_expires_at")
    if not expires_at or expires_at < utc_now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link has expired. Please request a new one.",
        )

    # A wrong password leaves the token untouched, so a typo can be retried.
    if not verify_password(payload.password, user.get("password_hash")):
        logger.info("email_verification_password_mismatch recipient_domain=%s", _domain(user["email"]))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=VERIFY_PASSWORD_MISMATCH_MESSAGE,
        )

    now = utc_now()
    users.update_one(
        {"_id": user["_id"], "verification_token_hash": token_hash},
        {
            "$set": {
                "email_verified": True,
                "email_verified_at": now,
                "verification_expires_at": None,
                "updated_at": now,
            }
        },
    )

    logger.info("email_verified recipient_domain=%s", _domain(user["email"]))
    return {
        "message": "Your email has been verified. You can now sign in.",
        "email": user["email"],
    }


@router.post("/resend-verification")
def resend_verification(
    payload: ResendVerificationRequest, request: Request, background_tasks: BackgroundTasks
):
    email = str(payload.email).casefold()
    rate_limit.limit_email_sending(request, "resend-verification", email)
    user = find_user_by_email(email)

    if user and not user.get("email_verified") and email_service.is_configured():
        token, token_fields = _issue_verification_token()
        users.update_one(
            {"_id": user["_id"]},
            {"$set": {**token_fields, "updated_at": utc_now()}},
        )
        background_tasks.add_task(
            _deliver_verification, user["email"], user.get("name") or "there", token
        )
    elif user:
        logger.info(
            "verification_resend_skipped reason=%s",
            "already_verified" if user.get("email_verified") else "smtp_not_configured",
        )

    # Always the same answer, so the endpoint cannot be used to discover accounts.
    return {"message": GENERIC_RESEND_MESSAGE}


# ============================================================
# LOGIN / SESSION
# ============================================================

@router.post("/login")
def login(payload: LoginRequest, request: Request):
    email = str(payload.email).casefold()
    rate_limit.limit_login(request, email)
    user = find_user_by_email(email)

    if not user:
        # Same bcrypt cost as a real check, so timing does not reveal accounts.
        burn_password_check(payload.password)
    if not user or not verify_password(payload.password, user.get("password_hash")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if settings.require_email_verification and not user.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your email is not confirmed. Please confirm your email before logging in.",
        )

    if user.get("role") not in ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has an invalid role. Please contact the administrator.",
        )

    now = utc_now()
    users.update_one({"_id": user["_id"]}, {"$set": {"last_sign_in_at": now}})
    user["last_sign_in_at"] = now

    logger.info("login_succeeded role=%s", user["role"])
    return _session_response(user)


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    return {"user": get_current_user(authorization)}


def _auth_time(payload: dict) -> int | None:
    """When the password was last entered. Older tokens only have ``iat``."""
    value = payload.get("auth_time", payload.get("iat"))
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@router.post("/refresh")
def refresh(authorization: str | None = Header(default=None)):
    """Issue a fresh token for a still-valid session.

    The new token keeps the original ``auth_time``, so refreshing cannot keep
    a session alive for longer than ``session_max_age_days`` after sign-in.
    """
    payload, document = authenticate(authorization)

    auth_time = _auth_time(payload)
    max_age_seconds = settings.session_max_age_days * 24 * 60 * 60
    if auth_time is None or utc_now().timestamp() - auth_time > max_age_seconds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=SESSION_EXPIRED_MESSAGE,
        )

    token, expires_in = create_access_token(
        str(document["_id"]),
        document["role"],
        token_version=stored_token_version(document),
        auth_time=auth_time,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": public_user(document),
    }


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    """End the session on the server by bumping the user's token_version.

    That invalidates every token the user holds, on every device. A missing,
    expired or already-invalid token needs no server-side action, so the answer
    is the same either way.
    """
    try:
        _payload, document = authenticate(authorization)
    except HTTPException:
        return {"message": "Signed out"}

    users.update_one(
        {"_id": document["_id"]},
        {"$inc": {"token_version": 1}, "$set": {"updated_at": utc_now()}},
    )
    return {"message": "Signed out"}


# ============================================================
# PASSWORD RESET
# ============================================================

@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, background_tasks: BackgroundTasks
):
    email = str(payload.email).casefold()
    rate_limit.limit_email_sending(request, "forgot-password", email)
    user = find_user_by_email(email)

    if user and email_service.is_configured():
        token = generate_one_time_token()
        users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "reset_token_hash": hash_one_time_token(token),
                    "reset_expires_at": utc_now()
                    + timedelta(minutes=settings.password_reset_expire_minutes),
                    "updated_at": utc_now(),
                }
            },
        )
        background_tasks.add_task(
            _deliver_password_reset, user["email"], user.get("name") or "there", token
        )

    return {"message": GENERIC_RESET_MESSAGE}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request):
    """Set a new password from an emailed link.

    The token is consumed atomically (one find_one_and_update filtered on its
    hash and expiry), so two concurrent requests cannot both use it. Following
    the link proves the user owns the mailbox, so the address is marked
    verified; token_version is bumped to sign out every existing session.
    """
    rate_limit.limit_token_use(request, "reset-password")

    token_hash = hash_one_time_token(payload.token)
    new_hash = hash_password(payload.new_password)
    now = utc_now()

    user = users.find_one_and_update(
        {"reset_token_hash": token_hash, "reset_expires_at": {"$gt": now}},
        {
            "$set": {
                "password_hash": new_hash,
                "reset_token_hash": None,
                "reset_expires_at": None,
                "email_verified": True,
                "verification_token_hash": None,
                "verification_expires_at": None,
                "must_change_password": False,
                "updated_at": now,
            },
            "$inc": {"token_version": 1},
        },
    )

    if not user:
        if users.find_one({"reset_token_hash": token_hash}, {"_id": 1}):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This password reset link has expired. Please request a new one.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has already been used.",
        )

    # find_one_and_update returned the document as it was before the update.
    if not user.get("email_verified_at"):
        users.update_one(
            {"_id": user["_id"], "email_verified_at": None},
            {"$set": {"email_verified_at": now}},
        )

    logger.info("password_reset_completed recipient_domain=%s", _domain(user["email"]))
    return {"message": "Your password has been updated. You can now sign in."}
