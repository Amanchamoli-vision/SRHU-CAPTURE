from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from app.config import Settings  # noqa: E402
from app.database import _uses_tls  # noqa: E402
from app.services import email_service  # noqa: E402


def settings_for(**overrides) -> Settings:
    values = {
        "jwt_secret_key": "unit-test-secret-key-0123456789",
        "frontend_url": "https://srhu-capture.vercel.app",
        "smtp_from_email": "noreply@srhu.edu.in",
        "_env_file": None,
    }
    values.update(overrides)
    return Settings(**values)


def response(status: int, text: str = "") -> MagicMock:
    mock = MagicMock(status_code=status, text=text)
    mock.is_success = 200 <= status < 300
    return mock


class EmailProviderSettingsTests(unittest.TestCase):
    def test_brevo_needs_only_an_api_key(self) -> None:
        self.assertEqual(settings_for(email_provider="brevo").email_missing_variables, ["BREVO_API_KEY"])
        self.assertTrue(settings_for(email_provider="Brevo", brevo_api_key="k").email_configured)

    def test_smtp_still_needs_a_host(self) -> None:
        self.assertEqual(settings_for().email_missing_variables, ["SMTP_HOST"])

    def test_unknown_provider_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            settings_for(email_provider="sendgrid")

    def test_cors_regex_can_be_switched_off(self) -> None:
        self.assertTrue(settings_for().cors_origin_regex)
        self.assertEqual(settings_for(cors_origin_regex="").cors_origin_regex, "")


class HttpsProviderDeliveryTests(unittest.TestCase):
    def setUp(self) -> None:
        sleeper = patch.object(email_service.time, "sleep")
        sleeper.start()
        self.addCleanup(sleeper.stop)

    def _use(self, **overrides):
        patcher = patch.object(email_service, "settings", settings_for(**overrides))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_brevo_request(self) -> None:
        self._use(email_provider="brevo", brevo_api_key="xkeysib-test")
        with patch.object(email_service.httpx, "post", return_value=response(201)) as post:
            email_service.send_email("a@srhu.edu.in", "Subject", "Text", "<p>Html</p>")

        url, = post.call_args.args
        self.assertEqual(url, email_service.BREVO_URL)
        self.assertEqual(post.call_args.kwargs["headers"], {"api-key": "xkeysib-test"})
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["to"], [{"email": "a@srhu.edu.in"}])
        self.assertEqual(body["sender"]["email"], "noreply@srhu.edu.in")
        self.assertEqual(body["htmlContent"], "<p>Html</p>")

    def test_resend_request(self) -> None:
        self._use(email_provider="resend", resend_api_key="re_test")
        with patch.object(email_service.httpx, "post", return_value=response(200)) as post:
            email_service.send_email("a@srhu.edu.in", "Subject", "Text")

        self.assertEqual(post.call_args.args[0], email_service.RESEND_URL)
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer re_test")
        self.assertNotIn("html", post.call_args.kwargs["json"])

    def test_rejected_sender_is_not_retried(self) -> None:
        self._use(email_provider="brevo", brevo_api_key="k")
        with patch.object(email_service.httpx, "post", return_value=response(400, "sender not valid")) as post:
            with self.assertRaises(email_service.EmailDeliveryError):
                email_service.send_email("a@srhu.edu.in", "Subject", "Text")
        self.assertEqual(post.call_count, 1)

    def test_provider_outage_is_retried(self) -> None:
        self._use(email_provider="brevo", brevo_api_key="k")
        with patch.object(email_service.httpx, "post", side_effect=[response(503), response(201)]) as post:
            email_service.send_email("a@srhu.edu.in", "Subject", "Text")
        self.assertEqual(post.call_count, 2)


class MongoTlsTests(unittest.TestCase):
    def test_atlas_and_explicit_tls_use_certifi(self) -> None:
        self.assertTrue(_uses_tls("mongodb+srv://u:p@cluster0.abcd.mongodb.net/?retryWrites=true"))
        self.assertTrue(_uses_tls("mongodb://host:27017/?tls=true"))

    def test_plain_connections_do_not(self) -> None:
        self.assertFalse(_uses_tls("mongodb://localhost:27017"))
        self.assertFalse(_uses_tls("mongodb://mongo:pw@mongodb.railway.internal:27017"))


if __name__ == "__main__":
    unittest.main()
