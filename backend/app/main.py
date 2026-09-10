from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, events, reports


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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROUTERS
# ============================================================

# Admin APIs
app.include_router(admin.router)

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
    return {
        "status": "healthy"
    }