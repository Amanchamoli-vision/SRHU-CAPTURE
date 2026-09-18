from urllib.parse import urlsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment and the backend .env file.

    MongoDB is the only data store: it holds users, credentials, events, media
    metadata, notifications, reports and (through GridFS) the uploaded files.
    """

    # ------------------------------------------------------------------
    # MongoDB
    # ------------------------------------------------------------------
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "campus_capture"

    # ------------------------------------------------------------------
    # Authentication (JWT issued by this service)
    # ------------------------------------------------------------------
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    # Seven days by default; the frontend refreshes the token on use.
    access_token_expire_minutes: int = 60 * 24 * 7

    # When True, a newly registered account must confirm its email address
    # before it can sign in. Requires SMTP to be configured.
    require_email_verification: bool = True
    email_verification_expire_hours: int = 24
    password_reset_expire_minutes: int = 60

    # ------------------------------------------------------------------
    # SMTP (outbound email)
    # ------------------------------------------------------------------
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Campus Capture SRHU"
    # STARTTLS on the submission port (587). Set SMTP_USE_SSL=true for
    # implicit TLS on port 465 instead.
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 20

    # ------------------------------------------------------------------
    # Email transport
    # ------------------------------------------------------------------
    # "smtp" uses the SMTP_* settings above. Railway's Free, Trial and Hobby
    # plans block outbound SMTP, so there use "brevo" or "resend", which send
    # over HTTPS. The From address is still SMTP_FROM_EMAIL / SMTP_FROM_NAME and
    # must be a sender verified with that provider.
    email_provider: str = "smtp"
    brevo_api_key: str | None = None
    resend_api_key: str | None = None

    # ------------------------------------------------------------------
    # Uploads (stored in MongoDB GridFS)
    # ------------------------------------------------------------------
    max_upload_size_mb: int = 25

    # ------------------------------------------------------------------
    # Cloudflare R2 (S3-compatible object storage for uploads)
    # ------------------------------------------------------------------
    # When configured, new photos, videos and documents go to R2 instead of
    # GridFS. Files already in GridFS keep being served from /files/{id}.
    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str | None = None
    # Public base URL (r2.dev or custom domain) for a public bucket. Empty
    # means the bucket is private and pre-signed URLs are issued instead.
    r2_public_url: str | None = None
    r2_signed_url_expiry: int = 6 * 60 * 60

    # ------------------------------------------------------------------
    # Frontend / CORS
    # ------------------------------------------------------------------
    # The public frontend origin used for all server-generated email links.
    frontend_url: str
    # Optional extra origins, for example an alternate local development address.
    cors_origins: str | None = None
    # Origins matched by pattern. The default admits localhost and private LAN
    # addresses for development; in production set it to something like
    # ^https://srhu-capture(-[a-z0-9-]+)?\.vercel\.app$ to also admit Vercel
    # preview deployments, or to an empty value to allow FRONTEND_URL and
    # CORS_ORIGINS only.
    cors_origin_regex: str | None = (
        r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+"
        r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?$"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret_key(cls, value: str) -> str:
        if len(value.strip()) < 16:
            raise ValueError("JWT_SECRET_KEY must be at least 16 characters long")
        return value.strip()

    # ------------------------------------------------------------------
    # Derived helpers
    # ------------------------------------------------------------------
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

    @field_validator("email_provider")
    @classmethod
    def validate_email_provider(cls, value: str) -> str:
        normalized = (value or "smtp").strip().lower()
        if normalized not in {"smtp", "brevo", "resend"}:
            raise ValueError("EMAIL_PROVIDER must be one of: smtp, brevo, resend")
        return normalized

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    @property
    def email_missing_variables(self) -> list[str]:
        """Names of the settings the chosen email provider still needs."""
        required = {
            "smtp": (("SMTP_HOST", self.smtp_host),),
            "brevo": (("BREVO_API_KEY", self.brevo_api_key),),
            "resend": (("RESEND_API_KEY", self.resend_api_key),),
        }[self.email_provider]
        return [
            name
            for name, value in (*required, ("SMTP_FROM_EMAIL", self.smtp_from_email))
            if not value
        ]

    @property
    def email_configured(self) -> bool:
        return not self.email_missing_variables

    @property
    def r2_configured(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket_name
        )

    @property
    def r2_endpoint_url(self) -> str:
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    def frontend_route(self, path: str) -> str:
        """Build a frontend route without introducing duplicate slashes."""
        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("Frontend routes must start with one slash")
        return f"{self.frontend_url}{path}"

    @property
    def login_url(self) -> str:
        return self.frontend_route("/login")

    def email_verification_url(self, token: str) -> str:
        return self.frontend_route(f"/verify-email?token={token}")

    def password_reset_url(self, token: str) -> str:
        return self.frontend_route(f"/reset-password?token={token}")


settings = Settings()
