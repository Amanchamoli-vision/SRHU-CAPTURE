import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.config import settings
from app.database import supabase_public


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


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest):
    """Create an unconfirmed Supabase user; Supabase Auth sends the confirmation email.

    The confirmation email is delivered by Supabase's own mail infrastructure, so this
    service never opens an outbound SMTP connection. Configure the sender under
    Supabase Auth > SMTP Settings and the wording under Auth > Email Templates.
    """
    email = str(payload.email).casefold()
    logger.info(
        "registration_started recipient_domain=%s redirect_url=%s",
        email.rsplit("@", 1)[-1],
        settings.signup_confirmation_redirect_url,
    )

    try:
        supabase_public.auth.sign_up(
            {
                "email": email,
                "password": payload.password,
                "options": {
                    "email_redirect_to": settings.signup_confirmation_redirect_url,
                    "data": {"name": payload.name},
                },
            }
        )
    except Exception as exc:
        logger.warning("supabase_sign_up_failed type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create the account. Please check your details and try again.",
        ) from exc

    logger.info("registration_completed")
    return {
        "message": "Account created successfully! Please check your email for verification."
    }
