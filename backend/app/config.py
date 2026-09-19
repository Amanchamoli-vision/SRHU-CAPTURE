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
    # /auth/refresh keeps a session alive, but never past this many days after
    # the password was last entered (the token's ``auth_time``).
    session_max_age_days: int = 30

    # In-memory per-IP / per-email throttling of the auth endpoints. Only turn
    # this off for local load tests.
    rate_limit_enabled: bool = True

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
    # Reports
    # ------------------------------------------------------------------
    # Printed under the university name on the generated report letterhead.
    report_school: str = "School of Science and Technology"

    # ------------------------------------------------------------------
    # Uploads (Cloudflare R2, or MongoDB GridFS when R2 is not configured)
    # ------------------------------------------------------------------
    # Backstop for any single file, whatever its kind.
    max_upload_size_mb: int = 200

    # Per-event limits (PRD 7 / 8 / 9 / 11). Photos are capped per file and by
    # count; videos and documents by their combined size, because "10 videos of
    # 20 MB" and "2 videos of 100 MB" cost the same storage and the teacher
    # should be free to choose.
    #
    # These are the *fallback* defaults only. The photo and video limits are
    # Super Admin configurable and live in the `app_settings` collection --
    # see app/services/upload_limits.py. A value here is used when no row has
    # been saved yet (or the database cannot be read), so changing one still
    # shifts the starting point for a fresh deployment.
    max_photos_per_event: int = 10
    max_photo_size_mb: int = 20
    # No combined photo budget by default: photos are capped per file and by
    # count. A Super Admin may add one.
    max_photo_total_mb: int | None = None
    # No video count cap by default, for the reason above. A Super Admin may
    # add one.
    max_videos_per_event: int | None = None
    # A single video may fill the whole event budget, which is what shipped
    # before the per-video cap existed.
    max_video_size_mb: int = 200
    max_video_total_mb: int = 200
    max_documents_total_mb: int = 15
    # No per-document size cap; this only stops an unbounded number of tiny
    # files from being attached.
    max_documents_per_event: int = 50

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
    # Origins matched by pattern. The default admits localhost and the private
    # LAN ranges only -- 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 and the
    # carrier-grade NAT / Tailscale range 100.64.0.0/10 (100.64-100.127.x.x; the
    # rest of 100.* is public address space). In production set it to something
    # like ^https://srhu-capture(-[a-z0-9-]+)?\.vercel\.app$ to also admit
    # Vercel preview deployments, or to an empty value to allow FRONTEND_URL
    # and CORS_ORIGINS only.
    cors_origin_regex: str | None = (
        r"^https?://("
        r"localhost|127\.0\.0\.1"
        r"|10(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}"
        r"|172\.(1[6-9]|2\d|3[01])(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2}"
        r"|192\.168(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2}"
        r"|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2}"
        r")(:\d{1,5})?$"
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

    @property
    def frontend_url_is_insecure(self) -> bool:
        """True when email links would travel as plain http to a non-local host.

        Verification and reset tokens sit in those links' query strings, so on
        anything but a developer's own machine the frontend must be https.
        """
        parsed = urlsplit(self.frontend_url)
        return parsed.scheme == "http" and (parsed.hostname or "") not in {
            "localhost",
            "127.0.0.1",
            "::1",
        }

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    @property
    def smtp_missing_variables(self) -> list[str]:
        """Names of the SMTP settings that still need a value."""
        return [
            name
            for name, value in (
                ("SMTP_HOST", self.smtp_host),
                ("SMTP_FROM_EMAIL", self.smtp_from_email),
            )
            if not value
        ]

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

    @property
    def max_photo_size_bytes(self) -> int:
        return self.max_photo_size_mb * 1024 * 1024

    # No byte helper for max_photo_total_mb / max_video_size_mb: those are
    # Super Admin configurable, so the value in force comes from
    # app/services/upload_limits.py (which converts with `to_bytes`), never
    # from the fallback here.
    @property
    def max_video_total_bytes(self) -> int:
        return self.max_video_total_mb * 1024 * 1024

    @property
    def max_documents_total_bytes(self) -> int:
        return self.max_documents_total_mb * 1024 * 1024

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
