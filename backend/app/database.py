"""MongoDB connection, collections and index management.

Every piece of persistent state lives in one MongoDB database:

    users            accounts, roles and password hashes
    events           events submitted by teachers
    event_media      photo / video metadata (file bytes live in GridFS)
    event_documents  supporting document metadata (file bytes live in GridFS)
    notifications    in-app notifications for teachers
    event_reports    generated report records
    uploads.*        GridFS buckets holding the uploaded file bytes
"""

import logging

import certifi
from gridfs import GridFS
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import ConfigurationError, PyMongoError

from app.config import settings


logger = logging.getLogger(__name__)

def _uses_tls(uri: str) -> bool:
    lowered = uri.lower()
    return lowered.startswith("mongodb+srv://") or "tls=true" in lowered or "ssl=true" in lowered


# One client per process; pymongo manages the connection pool internally.
# TLS connections (MongoDB Atlas is always mongodb+srv://) verify against
# certifi's CA bundle, because slim container images such as Railway's often
# ship without a current system bundle and the handshake then fails.
#
# connect=False defers everything network-related -- including the SRV DNS
# lookup of a mongodb+srv:// URI -- to the first operation. Without it an
# unreachable DNS server or Atlas cluster made importing this module (and so
# the whole app and every test module) raise ConfigurationError, instead of
# starting degraded and reporting it on /health.
client: MongoClient = MongoClient(
    settings.mongodb_uri,
    connect=False,
    serverSelectionTimeoutMS=5000,
    tz_aware=True,
    **({"tlsCAFile": certifi.where()} if _uses_tls(settings.mongodb_uri) else {}),
)

db = client[settings.mongodb_db_name]

users = db["users"]
events = db["events"]
event_media = db["event_media"]
event_documents = db["event_documents"]
notifications = db["notifications"]
event_reports = db["event_reports"]

# Uploaded file bytes are stored in GridFS so that MongoDB remains the single
# store for the application, including media and documents.
fs = GridFS(db, collection="uploads")


def ensure_indexes() -> None:
    """Create the indexes the application relies on. Safe to call repeatedly."""
    users.create_index([("email", ASCENDING)], unique=True, name="email_unique")
    users.create_index([("role", ASCENDING)], name="role")
    users.create_index(
        [("verification_token_hash", ASCENDING)],
        name="verification_token",
        sparse=True,
    )
    users.create_index(
        [("reset_token_hash", ASCENDING)],
        name="reset_token",
        sparse=True,
    )

    events.create_index([("teacher_id", ASCENDING)], name="teacher")
    events.create_index([("status", ASCENDING)], name="status")
    events.create_index([("event_date", ASCENDING)], name="event_date")
    events.create_index([("event_type", ASCENDING)], name="event_type")
    events.create_index([("created_at", DESCENDING)], name="created_at")

    event_media.create_index([("event_id", ASCENDING)], name="event")
    event_documents.create_index([("event_id", ASCENDING)], name="event")

    notifications.create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)],
        name="user_created",
    )
    notifications.create_index(
        [("user_id", ASCENDING), ("is_read", ASCENDING)],
        name="user_unread",
    )

    event_reports.create_index(
        [("event_id", ASCENDING)],
        unique=True,
        name="event_unique",
    )


def ping() -> bool:
    """Return True when the MongoDB server answers."""
    try:
        client.admin.command("ping")
        return True
    except (PyMongoError, ConfigurationError) as error:
        logger.error("mongodb_ping_failed error=%s", error)
        return False
