"""Application logs go to rotating files (and stdout), never to the database."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from pydantic import ValidationError  # noqa: E402

from app.config import Settings  # noqa: E402
from app.logging_config import AUDIT_LOGGER, configure_logging  # noqa: E402
from app.services import audit_service  # noqa: E402


def log_settings(log_dir: str, **overrides) -> SimpleNamespace:
    values = {
        "log_level": "INFO",
        "log_to_files": True,
        "log_dir": log_dir,
        "log_file_max_mb": 1,
        "log_file_backup_count": 2,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class QuietConsole(unittest.TestCase):
    """configure_logging() keeps an existing root handler instead of adding a
    console one, so a NullHandler keeps these tests off the terminal."""

    def setUp(self) -> None:
        self.null = logging.NullHandler()
        logging.getLogger().addHandler(self.null)

    def tearDown(self) -> None:
        logging.getLogger().removeHandler(self.null)


def flush_all() -> None:
    for name in ("", "uvicorn", "uvicorn.access", AUDIT_LOGGER):
        for handler in logging.getLogger(name).handlers:
            handler.flush()


class LoggingConfigTests(QuietConsole):
    def setUp(self) -> None:
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "logs"
        self.root_level = logging.getLogger().level

    def tearDown(self) -> None:
        # Back to console-only, as the rest of the suite runs.
        configure_logging(log_settings(str(self.dir), log_to_files=False))
        logging.getLogger().setLevel(self.root_level)
        self.tmp.cleanup()
        super().tearDown()

    def read(self, name: str) -> str:
        flush_all()
        path = self.dir / name
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def test_app_and_error_files(self) -> None:
        configure_logging(log_settings(str(self.dir)))
        log = logging.getLogger("app.routers.events")
        log.info("event_created id=1")
        log.warning("notification_create_failed id=1")
        log.debug("too_chatty")

        app_log = self.read("app.log")
        self.assertIn("event_created id=1", app_log)
        self.assertIn("notification_create_failed id=1", app_log)
        self.assertNotIn("too_chatty", app_log)
        error_log = self.read("error.log")
        self.assertIn("notification_create_failed", error_log)
        self.assertNotIn("event_created", error_log)

    def test_uvicorn_and_access_logs_reach_files(self) -> None:
        uvicorn_logger = logging.getLogger("uvicorn")
        access_logger = logging.getLogger("uvicorn.access")
        saved = (uvicorn_logger.propagate, access_logger.propagate, access_logger.level)
        # As uvicorn's own logging config leaves them.
        uvicorn_logger.propagate = False
        access_logger.propagate = False
        access_logger.setLevel(logging.INFO)
        try:
            configure_logging(log_settings(str(self.dir)))
            logging.getLogger("uvicorn.error").error("Exception in ASGI application")
            access_logger.info('127.0.0.1 - "GET /health HTTP/1.1" 200')
            self.assertIn("Exception in ASGI application", self.read("error.log"))
            self.assertIn("GET /health", self.read("access.log"))
            self.assertNotIn("GET /health", self.read("app.log"))
        finally:
            uvicorn_logger.propagate, access_logger.propagate = saved[0], saved[1]
            access_logger.setLevel(saved[2])

    def test_files_rotate_and_stay_bounded(self) -> None:
        configure_logging(log_settings(str(self.dir), log_file_max_mb=1, log_file_backup_count=2))
        log = logging.getLogger("app.bulk")
        line = "x" * 1000
        for _ in range(4000):  # ~4 MB through a 1 MB cap
            log.info(line)
        flush_all()
        names = sorted(p.name for p in self.dir.glob("app.log*"))
        self.assertEqual(names, ["app.log", "app.log.1", "app.log.2"])
        for path in self.dir.glob("app.log*"):
            self.assertLessEqual(path.stat().st_size, 1024 * 1024 + 2048)

    def test_configuring_twice_does_not_duplicate_lines(self) -> None:
        configure_logging(log_settings(str(self.dir)))
        configure_logging(log_settings(str(self.dir)))
        logging.getLogger("app.x").info("once_only")
        self.assertEqual(self.read("app.log").count("once_only"), 1)

    def test_files_off_writes_nothing(self) -> None:
        self.assertIsNone(configure_logging(log_settings(str(self.dir), log_to_files=False)))
        logging.getLogger("app.x").warning("stdout_only")
        self.assertFalse(self.dir.exists())

    def test_unwritable_log_dir_does_not_break_startup(self) -> None:
        blocker = Path(self.tmp.name) / "file"
        blocker.write_text("not a directory")
        self.assertIsNone(configure_logging(log_settings(str(blocker / "logs"))))

    def test_log_level_is_validated(self) -> None:
        base = {"jwt_secret_key": "unit-test-secret-key-0123456789", "_env_file": None}
        self.assertEqual(Settings(**base, log_level=" warning ").log_level, "WARNING")
        with self.assertRaises(ValidationError):
            Settings(**base, log_level="LOUD")


class AuditFileLogTests(QuietConsole):
    ACTOR = {"id": "dean-1", "name": "Dean", "email": "dean@example.edu"}

    def setUp(self) -> None:
        super().setUp()
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        configure_logging(log_settings(str(self.dir)))

    def tearDown(self) -> None:
        configure_logging(log_settings(str(self.dir), log_to_files=False))
        self.tmp.cleanup()

    def audit_lines(self) -> list[dict]:
        flush_all()
        path = self.dir / "audit.log"
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        # "<timestamp> <json>"
        return [json.loads(line.split(" ", 2)[2]) for line in text.splitlines()]

    def test_audit_event_is_written_to_the_audit_file(self) -> None:
        with patch.object(audit_service, "audit_logs") as collection:
            audit_service.log_audit_event(
                actor=self.ACTOR,
                action="events_bulk_deleted",
                target_type="events",
                details={"requested_count": 2, "deleted_count": 2},
            )
        [line] = self.audit_lines()
        self.assertEqual(line["action"], "events_bulk_deleted")
        self.assertEqual(line["actor_email"], "dean@example.edu")
        self.assertEqual(line["details"]["deleted_count"], 2)
        self.assertIn("created_at", line)
        # The collection behind the Audit Logs page is still written.
        collection.insert_one.assert_called_once()

    def test_file_line_survives_a_database_failure(self) -> None:
        from pymongo.errors import PyMongoError

        with patch.object(audit_service, "audit_logs") as collection:
            collection.insert_one.side_effect = PyMongoError("down")
            audit_service.log_audit_event(actor=self.ACTOR, action="teacher_removed", target_type="user")
        self.assertEqual([line["action"] for line in self.audit_lines()], ["teacher_removed"])
        flush_all()
        self.assertIn("audit_log_failed", (self.dir / "error.log").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
