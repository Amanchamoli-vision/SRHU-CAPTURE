"""MongoDB connection, collections and index management.

Every piece of persistent state lives in one MongoDB database:

    users            accounts, roles and password hashes
    events           events submitted by teachers
    event_media      photo / video metadata (file bytes live in GridFS)
    event_documents  supporting document metadata (file bytes live in GridFS)
    notifications    in-app notifications for teachers
    event_reports    generated report records
    app_settings     one row per global setting the Super Admin can change
    uploads.*        GridFS buckets holding the uploaded file bytes
"""

import logging

import certifi
from gridfs import GridFS
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import ConfigurationError, OperationFailure, PyMongoError

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
# Event categories a teacher may choose from. Seeded with the built-in set and
# extended by teachers at create-event time (PRD 4 / 14).
event_types = db["event_types"]
# Coordinator contact cards: name + mobile, not user accounts (PRD 5).
faculty_coordinators = db["faculty_coordinators"]
# Global configuration the Super Admin edits at runtime. One document per
# setting group, keyed by a string `_id` ("upload_limits"), so there is no
# index to declare and no way for a second row to appear.
app_settings = db["app_settings"]

# Uploaded file bytes are stored in GridFS so that MongoDB remains the single
# store for the application, including media and documents.
fs = GridFS(db, collection="uploads")



def _ensure_ttl_index(collection, *, field: str, name: str, expire_after_seconds: int) -> None:
    """Create a TTL index, replacing one that exists with different options.

    MongoDB refuses to re-create an index under the same name with a different
    `expireAfterSeconds` (IndexOptionsConflict, codes 85/86), which would turn
    a change of policy into a failed boot.
    """
    try:
        collection.create_index(
            [(field, ASCENDING)],
            name=name,
            expireAfterSeconds=expire_after_seconds,
        )
    except OperationFailure as error:
        if error.code not in (85, 86):
            raise
        logger.info("ttl_index_recreating collection=%s name=%s", collection.name, name)
        collection.drop_index(name)
        collection.create_index(
            [(field, ASCENDING)],
            name=name,
            expireAfterSeconds=expire_after_seconds,
        )


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
    # The teacher list sorts its own events by recency; the single-field
    # "teacher" index above cannot serve the sort, so paging it would scan.
    events.create_index(
        [("teacher_id", ASCENDING), ("created_at", DESCENDING)],
        name="teacher_created",
    )
    # Serves the archive listing. Sparse: only shelved events carry the field,
    # and live events are found through the status/created_at indexes.
    events.create_index(
        [("archived_at", DESCENDING)],
        name="archived_at",
        sparse=True,
    )

    event_media.create_index([("event_id", ASCENDING)], name="event")
    event_documents.create_index([("event_id", ASCENDING)], name="event")

    # Serves the duplicate-name check the upload wizard runs before sending
    # bytes (PRD 10).
    event_media.create_index(
        [("event_id", ASCENDING), ("name_key", ASCENDING)],
        name="event_name",
    )
    event_documents.create_index(
        [("event_id", ASCENDING), ("name_key", ASCENDING)],
        name="event_name",
    )

    notifications.create_index(
        [("user_id", ASCENDING), ("created_at", DESCENDING)],
        name="user_created",
    )
    notifications.create_index(
        [("user_id", ASCENDING), ("is_read", ASCENDING)],
        name="user_unread",
    )

    # PRD 13: a notification disappears an hour after it is opened. The router
    # stamps `expires_at` when marking one read, and this index deletes the
    # document once that moment passes (expireAfterSeconds=0 means "at the
    # time in the field"). Unread notifications have no `expires_at`, and TTL
    # ignores documents whose indexed field is missing or not a date, so they
    # are never swept. Notifications read before this shipped also lack the
    # field and so survive -- deliberately, rather than being purged on deploy.
    _ensure_ttl_index(
        notifications,
        field="expires_at",
        name="read_ttl",
        expire_after_seconds=0,
    )

    event_reports.create_index(
        [("event_id", ASCENDING)],
        unique=True,
        name="event_unique",
    )

    event_types.create_index(
        [("key", ASCENDING)],
        unique=True,
        name="key_unique",
    )

    faculty_coordinators.create_index(
        [("name_key", ASCENDING)],
        unique=True,
        name="name_unique",
    )

    # Imported here rather than at module scope: the service imports this
    # module for its collection handle, so a top-level import would cycle.
    from app.services.event_types import seed_default_event_types

    seed_default_event_types()


def ping() -> bool:
    """Return True when the MongoDB server answers."""
    try:
        client.admin.command("ping")
        return True
    except (PyMongoError, ConfigurationError) as error:
        logger.error("mongodb_ping_failed error=%s", error)
        return False
