from __future__ import annotations

import os
import re
import smtplib
import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.routers.auth import find_user_by_email  # noqa: E402
from app.services import email_service  # noqa: E402
from app.utils import rate_limit  # noqa: E402
from app.utils.security import hash_password  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402

STORED_EMAIL = "yogesh.chauhandsvvain@gmail.com"


def stored_user(**overrides) -> dict:
    user = {
        "_id": "user-object-id",
        "name": "Yogesh",
        "email": STORED_EMAIL,
        "email_verified": False,
        "verification_token_hash": "hash",
        "verification_expires_at": utc_now() + timedelta(hours=1),
    }
    user.update(overrides)
    return user


def regex_lookup(stored: dict):
    """A find_one stand-in: exact match on email, or a $regex match."""

    def find_one(query, *_args, **_kwargs):
        wanted = query.get("email")
        if isinstance(wanted, dict):
            return stored if re.search(wanted["$regex"], stored["email"]) else None
        if wanted is not None:
            return stored if wanted == stored["email"] else None
        return stored if "verification_token_hash" in query else None

    return find_one


PASSWORD = "secret1"
PASSWORD_HASH = hash_password(PASSWORD)


class VerifyEmailTests(unittest.TestCase):
    def setUp(self) -> None:
        rate_limit.reset()
        self.client = TestClient(app)
        self.users = MagicMock()
        patcher = patch("app.routers.auth.users", self.users)
        patcher.start()
        self.addCleanup(patcher.stop)

    def verify(self, password: str = PASSWORD):
        return self.client.post(
            "/auth/verify-email", json={"token": "t" * 43, "password": password}
        )

    def test_first_click_verifies_and_keeps_the_token(self) -> None:
        self.users.find_one.return_value = stored_user(password_hash=PASSWORD_HASH)
        response = self.verify()

        self.assertEqual(response.status_code, 200, response.text)
        changes = self.users.update_one.call_args[0][1]["$set"]
        self.assertTrue(changes["email_verified"])
        self.assertNotIn("verification_token_hash", changes)

    def test_wrong_password_is_refused_and_the_token_is_kept(self) -> None:
        """Pre-registration takeover: the real owner must not verify a stranger's account."""
        self.users.find_one.return_value = stored_user(password_hash=hash_password("attacker"))
        response = self.verify(PASSWORD)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "The password doesn't match this account. If you didn't create it, "
            "use Forgot password to set your own password.",
        )
        self.users.update_one.assert_not_called()
        self.users.find_one_and_update.assert_not_called()

    def test_password_is_required(self) -> None:
        self.users.find_one.return_value = stored_user(password_hash=PASSWORD_HASH)
        response = self.client.post("/auth/verify-email", json={"token": "t" * 43})
        self.assertEqual(response.status_code, 422)

    def test_second_click_is_a_success_not_an_error(self) -> None:
        """StrictMode, a double click or a link scanner must not show "invalid"."""
        self.users.find_one.return_value = stored_user(
            email_verified=True, verification_expires_at=None, password_hash=PASSWORD_HASH
        )
        # The password is not checked once the account is already verified.
        response = self.verify("anything")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("already verified", response.json()["message"])
        self.users.update_one.assert_not_called()

    def test_unknown_token_is_still_rejected(self) -> None:
        self.users.find_one.return_value = None
        response = self.verify()
        self.assertEqual(response.status_code, 400)

    def test_verify_is_rate_limited_per_ip(self) -> None:
        self.users.find_one.return_value = None
        for _ in range(20):
            self.assertEqual(self.verify().status_code, 400)
        self.assertEqual(self.verify().status_code, 429)


class GmailLookupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.users = MagicMock()
        self.users.find_one.side_effect = regex_lookup(stored_user())
        patcher = patch("app.routers.auth.users", self.users)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_dotted_variant_finds_the_account(self) -> None:
        user = find_user_by_email("yogesh.chauhan.dsvvain@gmail.com")
        self.assertEqual(user["email"], STORED_EMAIL)

    def test_different_letters_do_not_match(self) -> None:
        self.assertIsNone(find_user_by_email("yogesh.chauhan.dsvvainx@gmail.com"))

    def test_other_domains_need_an_exact_match(self) -> None:
        self.users.find_one.side_effect = regex_lookup(stored_user(email="a.b@srhu.edu.in"))
        self.assertIsNone(find_user_by_email("ab@srhu.edu.in"))
        self.assertEqual(self.users.find_one.call_count, 1)

    def test_several_dot_variants_resolve_deterministically(self) -> None:
        """With more than one stored spelling, a verified and then the oldest one wins."""
        self.users.find_one.side_effect = None
        self.users.find_one.return_value = None
        find_user_by_email("yogeshchauhandsvvain@gmail.com")
        regex_call = self.users.find_one.call_args_list[-1]
        self.assertIn("$regex", regex_call.args[0]["email"])
        self.assertEqual(regex_call.kwargs["sort"][0], ("email_verified", -1))

    def test_resend_goes_to_the_stored_address(self) -> None:
        rate_limit.reset()
        client = TestClient(app)
        with patch.multiple(
            "app.routers.auth.settings", smtp_host="smtp.example.com", smtp_from_email="n@example.com"
        ), patch("app.routers.auth.email_service.send_verification_email") as send:
            response = client.post(
                "/auth/resend-verification", json={"email": "Yogesh.Chauhan.Dsvvain@gmail.com"}
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(send.call_args[0][0], STORED_EMAIL)


class SendRetryTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(email_service, "is_configured", return_value=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        sleeper = patch.object(email_service.time, "sleep")
        sleeper.start()
        self.addCleanup(sleeper.stop)

    def test_transient_failure_is_retried_once(self) -> None:
        with patch.object(
            email_service, "_deliver", side_effect=[smtplib.SMTPServerDisconnected("drop"), None]
        ) as deliver:
            email_service.send_email("a@example.com", "Subject", "Body")
        self.assertEqual(deliver.call_count, 2)

    def test_bad_credentials_are_not_retried(self) -> None:
        with patch.object(
            email_service, "_deliver", side_effect=smtplib.SMTPAuthenticationError(535, b"bad")
        ) as deliver:
            with self.assertRaises(email_service.EmailDeliveryError):
                email_service.send_email("a@example.com", "Subject", "Body")
        self.assertEqual(deliver.call_count, 1)

    def test_gives_up_after_two_attempts(self) -> None:
        with patch.object(email_service, "_deliver", side_effect=TimeoutError("slow")) as deliver:
            with self.assertRaises(email_service.EmailDeliveryError):
                email_service.send_email("a@example.com", "Subject", "Body")
        self.assertEqual(deliver.call_count, 2)

    def test_line_breaks_in_the_subject_are_flattened(self) -> None:
        """An event name with CR/LF used to raise an uncaught ValueError."""
        with patch.object(email_service, "_deliver") as deliver:
            email_service.send_email("a@example.com", "Event approved: Day\r\nBcc: x@evil", "Body")
        message = deliver.call_args[0][0]
        self.assertEqual(message["Subject"], "Event approved: Day Bcc: x@evil")
        self.assertIsNone(message["Bcc"])

    def test_unbuildable_message_is_a_delivery_error(self) -> None:
        with patch.object(email_service, "_build_message", side_effect=ValueError("bad header")), \
                patch.object(email_service, "_deliver") as deliver:
            with self.assertRaises(email_service.EmailDeliveryError):
                email_service.send_email("a@example.com", "Subject", "Body")
        deliver.assert_not_called()


if __name__ == "__main__":
    unittest.main()
