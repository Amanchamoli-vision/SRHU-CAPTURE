from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, auth, events, reports


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Campus Capture API",
    description="Backend API for Campus Capture SRHU",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROUTERS
# ============================================================

# Admin APIs
app.include_router(admin.router)

# Registration and confirmation-email API
app.include_router(auth.router)

# Teacher + Dean Event APIs
app.include_router(events.router)

# Dean Report APIs
app.include_router(reports.router)


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
    missing = [
        name
        for name, value in (("SUPABASE_ANON_KEY", settings.supabase_anon_key),)
        if not value
    ]

    return {
        "status": "healthy",
        "registration": "unconfigured" if missing else "configured",
        "missing_variables": missing,
    }
