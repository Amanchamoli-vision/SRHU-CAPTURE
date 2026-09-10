from urllib.parse import urlsplit

from pydantic import EmailStr, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    supabase_url: str
    supabase_service_role_key: str

    smtp_host: str
    smtp_port: int = 587
    smtp_user: EmailStr
    smtp_password: SecretStr
    smtp_from_email: EmailStr

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

    @model_validator(mode="after")
    def validate_smtp_sender(self):
        if self.smtp_port != 587:
            raise ValueError("SMTP_PORT must be 587 for STARTTLS")

        if not self.smtp_password.get_secret_value():
            raise ValueError("SMTP_PASSWORD must not be empty")

        if self.smtp_user.casefold() != self.smtp_from_email.casefold():
            raise ValueError("SMTP_FROM_EMAIL must match SMTP_USER")

        return self

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
