from html import escape
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.config import settings
from app.database import supabase
from app.services.email_service import EmailDeliveryError, send_email


router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


class RegistrationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Name must not be empty")
        return normalized


def _confirmation_email(confirmation_url: str) -> tuple[str, str, str]:
    """Match Supabase's default signup-confirmation wording with a custom link."""
    subject = "Confirm your signup"
    text_body = (
        "Confirm your signup\n\n"
        "Follow this link to confirm your user:\n"
        f"{confirmation_url}\n\n"
    )
    html_body = (
        "<h2>Confirm your signup</h2>"
        "<p>Follow this link to confirm your user:</p>"
        f'<p><a href="{escape(confirmation_url, quote=True)}">'
        "Confirm your mail</a></p>"
    )
    return subject, text_body, html_body


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest):
    """Create an unconfirmed Supabase user and deliver its confirmation link by SMTP."""
    email = str(payload.email).casefold()
    logger.info(
        "registration_started recipient_domain=%s",
        email.rsplit("@", 1)[-1],
    )
    logger.info(
        "supabase_generate_link_started redirect_url=%s",
        settings.signup_confirmation_redirect_url,
    )

    try:
        generated_link = supabase.auth.admin.generate_link(
            {
                "type": "signup",
                "email": email,
                "password": payload.password,
                "options": {
                    "redirect_to": settings.signup_confirmation_redirect_url,
                    "data": {"name": payload.name},
                },
            }
        )
    except Exception as exc:
        logger.warning("supabase_generate_link_failed type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create the account. Please check your details and try again.",
        ) from exc

    confirmation_url = generated_link.properties.action_link
    parsed_confirmation_url = urlsplit(confirmation_url)
    logger.info(
        "supabase_generate_link_succeeded response_type=%s link_origin=%s link_path=%s",
        type(generated_link).__name__,
        f"{parsed_confirmation_url.scheme}://{parsed_confirmation_url.netloc}",
        parsed_confirmation_url.path,
    )

    subject, text_body, html_body = _confirmation_email(confirmation_url)

    try:
        logger.info(
            "email_delivery_started recipient_domain=%s confirmation_url_domain=%s",
            email.rsplit("@", 1)[-1],
            parsed_confirmation_url.netloc,
        )
        send_email(email, subject, text_body, html_body)
    except EmailDeliveryError as exc:
        logger.warning("email_delivery_failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send the verification email. Please try again later.",
        ) from exc

    logger.info("registration_completed")
    return {
        "message": "Account created successfully! Please check your email for verification."
    }
