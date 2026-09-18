import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import ensure_indexes, ping
from app.routers import auth, events, files, reports, superadmin, users


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

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create MongoDB indexes on startup without blocking a misconfigured boot."""
    try:
        ensure_indexes()
        logger.info("mongodb_indexes_ready db=%s", settings.mongodb_db_name)
    except Exception as error:  # pragma: no cover - depends on the environment
        logger.error("mongodb_index_setup_failed error=%s", error)
    yield


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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?$",
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
    """Report liveness plus which optional features are configured.

    Only reports whether a variable is present, never its value. The same
    information is already observable by calling the routes themselves, so this
    exposes nothing new -- it just makes a misconfigured deployment obvious.
    """
    missing_smtp = [
        name
        for name, value in (
            ("SMTP_HOST", settings.smtp_host),
            ("SMTP_FROM_EMAIL", settings.smtp_from_email),
        )
        if not value
    ]

    database_ok = ping()

    registration = "configured"
    if settings.require_email_verification and missing_smtp:
        registration = "unconfigured"

    return {
        "status": "healthy" if database_ok else "degraded",
        "database": "connected" if database_ok else "unreachable",
        "email": "configured" if not missing_smtp else "unconfigured",
        "registration": registration,
        "missing_variables": missing_smtp,
    }
