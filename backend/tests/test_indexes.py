"""Index declarations in app/database.py.

TTL eviction itself is a server behaviour and cannot be unit tested; what can
be pinned is that the index is declared with the options the feature depends
on, and that a changed policy does not break boot.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from pymongo.errors import OperationFailure  # noqa: E402

import app.database as database  # noqa: E402


def index_calls(mock) -> list[tuple]:
    return [(call.args, call.kwargs) for call in mock.create_index.call_args_list]


# Every collection ensure_indexes() touches. Kept complete on purpose: anything
# missing here is a collection the suite creates indexes on for real, against
# whatever MONGODB_URI happens to be configured.
INDEXED_COLLECTIONS = (
    "users",
    "events",
    "event_media",
    "event_documents",
    "event_reports",
    "event_types",
    "faculty_coordinators",
    "notifications",
    "audit_logs",
    "departments",
    "upload_config",
)


def patched_collections(**overrides):
    """Patch every indexed collection, letting a test keep a handle on some."""
    mocks = {name: overrides.get(name, MagicMock()) for name in INDEXED_COLLECTIONS}
    patches = [patch.object(database, name, mock) for name, mock in mocks.items()]
    patches.append(patch("app.services.event_types.seed_default_event_types"))
    return mocks, patches


def run_ensure_indexes(**overrides):
    mocks, patches = patched_collections(**overrides)
    for item in patches:
        item.start()
    try:
        database.ensure_indexes()
    finally:
        for item in reversed(patches):
            item.stop()
    return mocks


class TtlIndexTests(unittest.TestCase):
    def test_notifications_declare_an_expires_at_ttl(self) -> None:
        notifications = MagicMock()
        run_ensure_indexes(notifications=notifications)

        ttl = [
            kwargs for _args, kwargs in index_calls(notifications)
            if kwargs.get("name") == "read_ttl"
        ]
        self.assertEqual(len(ttl), 1, "expected exactly one TTL index")
        # 0 means "expire at the moment in the field", not "expire immediately".
        self.assertEqual(ttl[0]["expireAfterSeconds"], 0)

    def test_ttl_is_on_expires_at_not_read_at(self) -> None:
        # A TTL on read_at would delete every historically-read notification
        # within a minute of deploying. expires_at is only ever set going
        # forward, so old rows survive.
        notifications = MagicMock()
        run_ensure_indexes(notifications=notifications)

        for args, kwargs in index_calls(notifications):
            if "expireAfterSeconds" in kwargs:
                self.assertEqual(args[0], [("expires_at", 1)])


class TtlConflictTests(unittest.TestCase):
    def test_a_changed_policy_drops_and_recreates(self) -> None:
        collection = MagicMock()
        collection.name = "notifications"
        collection.create_index.side_effect = [
            OperationFailure("conflict", 85),
            "read_ttl",
        ]

        database._ensure_ttl_index(
            collection, field="expires_at", name="read_ttl", expire_after_seconds=0
        )

        collection.drop_index.assert_called_once_with("read_ttl")
        self.assertEqual(collection.create_index.call_count, 2)

    def test_an_unrelated_failure_still_raises(self) -> None:
        collection = MagicMock()
        collection.name = "notifications"
        collection.create_index.side_effect = OperationFailure("no", 13)

        with self.assertRaises(OperationFailure):
            database._ensure_ttl_index(
                collection, field="expires_at", name="read_ttl", expire_after_seconds=0
            )
        collection.drop_index.assert_not_called()


class ReadMarkTests(unittest.TestCase):
    def test_marking_read_schedules_removal_an_hour_out(self) -> None:
        from app.routers.events import READ_NOTIFICATION_TTL, _read_marks

        marks = _read_marks()

        self.assertTrue(marks["is_read"])
        self.assertEqual(marks["expires_at"] - marks["read_at"], READ_NOTIFICATION_TTL)
        self.assertEqual(READ_NOTIFICATION_TTL.total_seconds(), 3600)


if __name__ == "__main__":
    unittest.main()


class SettingsIndexTests(unittest.TestCase):
    def test_upload_config_key_is_unique(self) -> None:
        """The settings document is a singleton.

        Without a unique index two concurrent first-time saves each upsert their
        own copy, and find_one then returns an arbitrary one.
        """
        upload_config = MagicMock()
        run_ensure_indexes(upload_config=upload_config)

        unique = [
            kwargs for _args, kwargs in index_calls(upload_config)
            if kwargs.get("name") == "key_unique"
        ]
        self.assertEqual(len(unique), 1)
        self.assertTrue(unique[0]["unique"])
