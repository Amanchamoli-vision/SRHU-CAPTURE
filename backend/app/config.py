from urllib.parse import urlsplit
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    supabase_url: str
    supabase_service_role_key: str
<<<<<<< Updated upstream

    # SMTP remains the default for local development. Railway deployments can
    # use Resend's HTTPS API, which does not require outbound SMTP access.
    email_provider: Literal["smtp", "resend"] = "smtp"

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: EmailStr | None = None
    smtp_password: SecretStr | None = None
    smtp_from_email: EmailStr | None = None

    resend_api_key: SecretStr | None = None
    resend_from_email: EmailStr | None = None
=======
    # Public anon key, used only for the signup request. Supabase Auth delivers the
    # confirmation email itself, and it does that for ordinary signups rather than
    # for service-role admin calls.
    supabase_anon_key: str
>>>>>>> Stashed changes

    # The public frontend origin used for all server-generated email redirects.
    # Add this origin to Supabase Auth's Redirect URLs allow-list.
    frontend_url: str
    # Optional extra origins, for example an alternate local development address.
    cors_origins: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("frontend_url")
    @classmethod
    def validate_frontend_url(cls, value: str) -> str:
        normalized = value.strip().rstrip("/")
        parsed = urlsplit(normalized)

        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ValueError(
                "FRONTEND_URL must be an absolute frontend origin without a path, "
                "query, fragment, or credentials"
            )

        return normalized

<<<<<<< Updated upstream
    @model_validator(mode="after")
    def validate_email_provider(self):
        if self.email_provider == "smtp":
            if self.smtp_port not in {465, 587}:
                raise ValueError(
                    "SMTP_PORT must be 465 for implicit SSL/TLS or 587 for STARTTLS"
                )

            if not self.smtp_host:
                raise ValueError("SMTP_HOST must be set when EMAIL_PROVIDER=smtp")

            if not self.smtp_user:
                raise ValueError("SMTP_USER must be set when EMAIL_PROVIDER=smtp")

            if not self.smtp_password or not self.smtp_password.get_secret_value():
                raise ValueError("SMTP_PASSWORD must not be empty")

            if not self.smtp_from_email:
                raise ValueError(
                    "SMTP_FROM_EMAIL must be set when EMAIL_PROVIDER=smtp"
                )

            if self.smtp_user.casefold() != self.smtp_from_email.casefold():
                raise ValueError("SMTP_FROM_EMAIL must match SMTP_USER")

        if self.email_provider == "resend":
            if not self.resend_api_key or not self.resend_api_key.get_secret_value():
                raise ValueError("RESEND_API_KEY must be set when EMAIL_PROVIDER=resend")

            if not self.resend_from_email:
                raise ValueError(
                    "RESEND_FROM_EMAIL must be set when EMAIL_PROVIDER=resend"
                )

        return self

=======
>>>>>>> Stashed changes
    @property
    def allowed_cors_origins(self) -> list[str]:
        configured_origins = self.cors_origins.split(",") if self.cors_origins else []
        origins = [self.frontend_url, *configured_origins]
        return list(
            dict.fromkeys(
                origin.strip().rstrip("/")
                for origin in origins
                if origin.strip()
            )
        )

    def frontend_route(self, path: str) -> str:
        """Build a frontend route without introducing duplicate slashes."""
        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("Frontend routes must start with one slash")
        return f"{self.frontend_url}{path}"

    @property
    def signup_confirmation_redirect_url(self) -> str:
        return self.frontend_route("/login")


settings = Settings()
