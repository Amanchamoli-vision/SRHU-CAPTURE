"""Test package bootstrap.

Importing this package pins the database the suite may touch. It runs before any
test module -- and therefore before ``app.config`` reads ``.env`` -- because
``python -m unittest discover tests`` imports the package first.

This matters: ``TestClient(app)`` boots the real application against the real
configuration, and the suite fakes only *some* collections. ``audit_logs`` in
particular was never faked, so every superadmin test wrote a real row into
whatever ``MONGODB_URI`` pointed at. With a hosted cluster in ``.env`` that meant
the shared database. Environment variables outrank ``.env`` in pydantic-settings,
so setting them here redirects the suite to a local throwaway database; if no
local mongod is running the tests fail loudly instead of quietly polluting a
shared one.
"""

import os

os.environ["MONGODB_URI"] = os.environ.get(
    "TEST_MONGODB_URI", "mongodb://localhost:27017"
)
os.environ["MONGODB_DB_NAME"] = "campus_capture_test"

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("REQUIRE_EMAIL_VERIFICATION", "false")

# Pinned so assertions about the deployment ceiling do not depend on whatever a
# developer happens to have in .env (which overrides the 200 MB code default).
os.environ.setdefault("MAX_UPLOAD_SIZE_MB", "200")
