import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import ensure_indexes, ping
from app.routers import auth, directory, events, files, reports, superadmin, users


# Show the application's own log lines (registration, email_sent, ...) next to
# uvicorn's access log so email delivery problems are visible in the console.
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)
logging.getLogger("pymongo").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


# ============================================================
# LIFESPAN
# ============================================================

INDEX_RETRY_INITIAL_SECONDS = 5
INDEX_RETRY_MAX_SECONDS = 300


def _retry_indexes_forever(stop: threading.Event) -> None:
    """Keep trying ensure_indexes() with exponential backoff until it succeeds.

    The unique email index is what stops two concurrent registrations creating
    the same account, so a first boot against an unreachable or empty database
    must not leave the app running without it for the life of the process.
    """
    delay = INDEX_RETRY_INITIAL_SECONDS
    attempt = 1
    while not stop.wait(delay):
        attempt += 1
        try:
            ensure_indexes()
            logger.info(
                "mongodb_indexes_ready db=%s attempt=%d", settings.mongodb_db_name, attempt
            )
            return
        except Exception as error:  # pragma: no cover - depends on the environment
            logger.error("mongodb_index_setup_failed attempt=%d error=%s", attempt, error)
            delay = min(delay * 2, INDEX_RETRY_MAX_SECONDS)


def _warn_about_insecure_settings() -> None:
    if settings.frontend_url_is_insecure:
        logger.warning(
            "frontend_url_insecure url=%s -- verification and password reset links "
            "carry one-time tokens and will be sent as plain http. Set FRONTEND_URL "
            "to the https address of the deployed frontend.",
            settings.frontend_url,
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create MongoDB indexes on startup without blocking a misconfigured boot."""
    _warn_about_insecure_settings()

    stop_retrying = threading.Event()
    try:
        ensure_indexes()
        logger.info("mongodb_indexes_ready db=%s", settings.mongodb_db_name)
    except Exception as error:  # pragma: no cover - depends on the environment
        logger.error("mongodb_index_setup_failed error=%s -- retrying in background", error)
        threading.Thread(
            target=_retry_indexes_forever,
            args=(stop_retrying,),
            name="mongodb-index-retry",
            daemon=True,
        ).start()
    try:
        yield
    finally:
        stop_retrying.set()


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Campus Capture API",
    description="Backend API for Campus Capture SRHU (MongoDB)",
    version="2.0.0",
    lifespan=lifespan,
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROUTERS
# ============================================================

# Superadmin APIs
app.include_router(superadmin.router)

# Registration, login, email verification and password reset
app.include_router(auth.router)

# Current-user profile APIs
app.include_router(users.router)

# Teacher + Dean Event APIs
app.include_router(directory.router)

app.include_router(events.router)

# Dean Report APIs
app.include_router(reports.router)

# Uploaded files served from GridFS
app.include_router(files.router)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "message": "Campus Capture API is running"
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check():
    """Unauthenticated liveness probe (Railway's healthcheck path).

    Returns only "ok" or "degraded" -- always with HTTP 200 so a database blip
    does not make the platform restart the service. The reasons (database
    unreachable, missing SMTP variables) go to the server log, not to anyone
    who can reach the URL.
    """
    problems = []

    if not ping():
        problems.append("database=unreachable")

    missing_email = settings.smtp_missing_variables
    if missing_email:
        problems.append("email=unconfigured missing=" + ",".join(missing_email))
        if settings.require_email_verification:
            problems.append("registration=unavailable")

    if problems:
        logger.warning("health_degraded %s", " ".join(problems))
        return {"status": "degraded"}
    return {"status": "ok"}
