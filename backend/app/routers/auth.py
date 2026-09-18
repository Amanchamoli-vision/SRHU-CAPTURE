import logging
import re
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status
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
from app.utils.auth import get_current_user, public_user
from app.utils.security import (
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


def _domain(email: str) -> str:
    return email.rsplit("@", 1)[-1]


GMAIL_DOMAINS = ("gmail.com", "googlemail.com")


def find_user_by_email(email: str) -> dict | None:
    """Look an account up by email, treating Gmail dot variants as one address.

    Gmail ignores dots in the local part, so a user who registered as
    ``first.last@gmail.com`` receives mail sent to ``firstlast@gmail.com`` and
    will often type either form. An exact match always wins; otherwise a Gmail
    address matches any stored spelling that differs only in its dots.
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
    return users.find_one({"email": {"$regex": pattern}})


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


def _issue_verification_token() -> tuple[str, dict]:
    token = generate_one_time_token()
    fields = {
        "verification_token_hash": hash_one_time_token(token),
        "verification_expires_at": utc_now()
        + timedelta(hours=settings.email_verification_expire_hours),
    }
    return token, fields


def _session_response(user_document: dict) -> dict:
    token, expires_in = create_access_token(str(user_document["_id"]), user_document["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": public_user(user_document),
    }


# ============================================================
# REGISTER
# ============================================================

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest, background_tasks: BackgroundTasks):
    """Create a teacher account and queue the email verification link over SMTP."""
    verification_required = settings.require_email_verification

    if verification_required and not email_service.is_configured():
        logger.error("registration_unavailable reason=smtp_not_configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Registration is temporarily unavailable. Please try again later.",
        )

    email = str(payload.email).casefold()
    logger.info("registration_started recipient_domain=%s", _domain(email))

    if find_user_by_email(email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    document = new_user_document(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    if not verification_required:
        logger.info("registration_completed verification=skipped")
        return {"message": "Account created successfully! You can now sign in."}

    background_tasks.add_task(_deliver_verification, email, payload.name, token)

    logger.info("registration_completed verification=email_queued")
    return {
        "message": (
            "Account created successfully! Check your email for the verification "
            "link. It can take a minute to arrive."
        )
    }


# ============================================================
# EMAIL VERIFICATION
# ============================================================

@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest):
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

    now = utc_now()
    users.update_one(
        {"_id": user["_id"]},
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
def resend_verification(payload: ResendVerificationRequest, background_tasks: BackgroundTasks):
    email = str(payload.email).casefold()
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
def login(payload: LoginRequest):
    email = str(payload.email).casefold()
    user = find_user_by_email(email)

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


@router.post("/refresh")
def refresh(authorization: str | None = Header(default=None)):
    """Issue a fresh token for a still-valid session."""
    user = get_current_user(authorization)
    token, expires_in = create_access_token(user["id"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user,
    }


@router.post("/logout")
def logout():
    # Tokens are stateless; the client discards its copy.
    return {"message": "Signed out"}


# ============================================================
# PASSWORD RESET
# ============================================================

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    email = str(payload.email).casefold()
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
def reset_password(payload: ResetPasswordRequest):
    token_hash = hash_one_time_token(payload.token)
    user = users.find_one({"reset_token_hash": token_hash})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has already been used.",
        )

    expires_at = user.get("reset_expires_at")
    if not expires_at or expires_at < utc_now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link has expired. Please request a new one.",
        )

    now = utc_now()
    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "reset_token_hash": None,
                "reset_expires_at": None,
                "updated_at": now,
            }
        },
    )

    logger.info("password_reset_completed recipient_domain=%s", _domain(user["email"]))
    return {"message": "Your password has been updated. You can now sign in."}
