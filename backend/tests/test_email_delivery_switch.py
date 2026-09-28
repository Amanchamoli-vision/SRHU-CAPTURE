"""EMAIL_DELIVERY_ENABLED=false: nothing is ever handed to an SMTP server."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from email import message_from_bytes, policy
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from app.config import settings
from app.services import email_service


class DeliverySwitchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.outbox = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.outbox, True)
        for name, value in {
            "email_delivery_enabled": False,
            "email_outbox_dir": self.outbox,
            # Real-looking SMTP settings: the switch must win over them.
            "smtp_host": "smtp.example.org",
            "smtp_from_email": "noreply@example.org",
        }.items():
            p = patch.object(settings, name, value)
            p.start()
            self.addCleanup(p.stop)
        # Any attempt to open a connection fails the test.
        for cls in ("SMTP", "SMTP_SSL"):
            p = patch(f"app.services.email_service.smtplib.{cls}", side_effect=AssertionError("SMTP was contacted"))
            p.start()
            self.addCleanup(p.stop)

    def test_messages_go_to_the_outbox_not_to_smtp(self) -> None:
        email_service.send_teacher_invitation_email("teacher@example.org", "Asha", "tok-123")
        files = os.listdir(self.outbox)
        self.assertEqual(len(files), 1)
        with open(os.path.join(self.outbox, files[0]), "rb") as handle:
            message = message_from_bytes(handle.read(), policy=policy.default)
        self.assertEqual(message["To"], "teacher@example.org")
        self.assertIn("accept-invite?token=tok-123", message.get_body(("plain",)).get_content())

    def test_features_stay_available_without_smtp_settings(self) -> None:
        with patch.object(settings, "smtp_host", None), patch.object(settings, "smtp_from_email", None):
            self.assertTrue(email_service.is_configured())
            self.assertFalse(email_service.delivery_enabled())
            email_service.send_email("x@example.org", "Subject", "Body")
        self.assertEqual(len(os.listdir(self.outbox)), 1)

    def test_the_smtp_session_itself_refuses(self) -> None:
        with self.assertRaises(email_service.EmailDeliveryError):
            email_service._deliver(email_service._build_message("x@example.org", "s", "t", None))

    def test_enabled_by_default(self) -> None:
        self.assertTrue(type(settings).model_fields["email_delivery_enabled"].default)


if __name__ == "__main__":
    unittest.main()
