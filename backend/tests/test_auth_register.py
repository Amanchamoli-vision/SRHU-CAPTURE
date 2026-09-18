from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.email_service import EmailDeliveryError  # noqa: E402
from app.utils import rate_limit  # noqa: E402
from app.utils.security import decode_access_token, verify_password  # noqa: E402


class RegisterEndpointTests(unittest.TestCase):
    """Registration stores the account in MongoDB and emails a verification link.

    The users collection and the SMTP sender are replaced with mocks, so no
    database or mail server is needed to run these tests.
    """

    def setUp(self) -> None:
        rate_limit.reset()
        self.client = TestClient(app)
        self.payload = {
            "name": " Asha  Rana ",
            "email": "Asha@Example.COM",
            "password": "secret1",
        }

        self.users = MagicMock()
        self.users.find_one.return_value = None
        self.users.insert_one.return_value = MagicMock(inserted_id="user-object-id")

        self.settings_patch = patch.multiple(
            "app.routers.auth.settings",
            smtp_host="smtp.example.com",
            smtp_from_email="noreply@example.com",
            require_email_verification=True,
        )
        self.users_patch = patch("app.routers.auth.users", self.users)
        self.send_patch = patch("app.routers.auth.email_service.send_verification_email")

        self.settings_patch.start()
        self.users_patch.start()
        self.send_verification_email = self.send_patch.start()

    def tearDown(self) -> None:
        self.send_patch.stop()
        self.users_patch.stop()
        self.settings_patch.stop()

    def test_register_stores_hashed_password_and_sends_verification(self) -> None:
        response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 201, response.text)

        document = self.users.insert_one.call_args[0][0]
        self.assertEqual(document["email"], "asha@example.com")
        self.assertEqual(document["name"], "Asha Rana")
        self.assertEqual(document["role"], "teacher")
        self.assertFalse(document["email_verified"])
        self.assertNotIn("password", document)
        self.assertTrue(verify_password("secret1", document["password_hash"]))
        self.assertIsNotNone(document["verification_token_hash"])

        to_email, name, token = self.send_verification_email.call_args[0]
        self.assertEqual(to_email, "asha@example.com")
        self.assertEqual(name, "Asha Rana")
        self.assertTrue(token)

    def test_email_failure_keeps_the_account_for_a_resend(self) -> None:
        """Delivery runs after the response, so a dead relay cannot fail the request.

        The account keeps its verification token on purpose: the user recovers
        through /auth/resend-verification rather than registering all over again.
        """
        self.send_verification_email.side_effect = EmailDeliveryError("smtp down")

        response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 201, response.text)
        self.assertNotIn("smtp down", response.text)
        self.users.delete_one.assert_not_called()
        self.assertIsNotNone(
            self.users.insert_one.call_args[0][0]["verification_token_hash"]
        )

    def _existing(self, **overrides) -> dict:
        user = {
            "_id": "existing",
            "name": "Real Owner",
            "email": "asha@example.com",
            "email_verified": False,
        }
        user.update(overrides)
        return user

    def test_existing_unverified_email_looks_like_a_new_registration(self) -> None:
        """No 409: the answer must not reveal that the address has an account."""
        fresh = self.client.post("/auth/register", json=self.payload)
        self.users.find_one.return_value = self._existing()
        self.send_verification_email.reset_mock()

        response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, fresh.status_code)
        self.assertEqual(response.json(), fresh.json())
        self.assertEqual(self.users.insert_one.call_count, 1)  # only the first call
        # A fresh link goes to the stored address, and the token is replaced.
        to_email, name, token = self.send_verification_email.call_args[0]
        self.assertEqual((to_email, name), ("asha@example.com", "Real Owner"))
        self.assertTrue(token)
        changes = self.users.update_one.call_args[0][1]["$set"]
        self.assertTrue(changes["verification_token_hash"])

    def test_existing_verified_email_gets_a_notice_not_a_409(self) -> None:
        self.users.find_one.return_value = self._existing(email_verified=True)

        with patch("app.routers.auth.email_service.send_registration_attempt_email") as notice:
            response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 201, response.text)
        self.assertIn("Check your email", response.json()["message"])
        self.users.insert_one.assert_not_called()
        self.users.update_one.assert_not_called()
        self.send_verification_email.assert_not_called()
        notice.assert_called_once_with("asha@example.com", "Real Owner")

    def test_duplicate_key_race_is_answered_like_an_existing_account(self) -> None:
        from pymongo.errors import DuplicateKeyError

        self.users.find_one.side_effect = [None, self._existing(email_verified=True)]
        self.users.insert_one.side_effect = DuplicateKeyError("E11000 duplicate key")

        with patch("app.routers.auth.email_service.send_registration_attempt_email"):
            response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 201, response.text)

    def test_duplicate_email_is_409_when_verification_is_off(self) -> None:
        self.users.find_one.return_value = self._existing(email_verified=True)

        with patch.multiple("app.routers.auth.settings", require_email_verification=False):
            response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 409)
        self.users.insert_one.assert_not_called()
        self.send_verification_email.assert_not_called()

    def test_password_over_72_bytes_is_rejected(self) -> None:
        # 25 Devanagari letters: 25 characters but 75 UTF-8 bytes.
        response = self.client.post(
            "/auth/register", json={**self.payload, "password": "ह" * 25}
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("72 bytes", response.text)
        self.users.insert_one.assert_not_called()

    def test_register_is_rate_limited_per_email(self) -> None:
        for _ in range(5):
            self.assertEqual(
                self.client.post("/auth/register", json=self.payload).status_code, 201
            )

        response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 429)
        self.assertEqual(
            response.json()["detail"],
            "Too many attempts. Please wait a few minutes and try again.",
        )
        # Another address from the same client is still allowed.
        other = self.client.post(
            "/auth/register", json={**self.payload, "email": "someone.else@example.com"}
        )
        self.assertEqual(other.status_code, 201)

    def test_blank_name_is_rejected_before_insert(self) -> None:
        response = self.client.post(
            "/auth/register",
            json={**self.payload, "name": "   "},
        )

        self.assertEqual(response.status_code, 422)
        self.users.insert_one.assert_not_called()

    def test_register_reports_503_when_smtp_not_configured(self) -> None:
        """Missing SMTP settings must degrade this route, not crash the service."""
        with patch.multiple("app.routers.auth.settings", smtp_host=None):
            response = self.client.post("/auth/register", json=self.payload)

        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily unavailable", response.json()["detail"])
        self.users.insert_one.assert_not_called()


class LoginEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.utils.security import hash_password
        from bson import ObjectId

        rate_limit.reset()
        self.client = TestClient(app)
        self.user = {
            "_id": ObjectId(),
            "name": "Asha Rana",
            "email": "asha@example.com",
            "password_hash": hash_password("secret1"),
            "role": "teacher",
            "email_verified": True,
        }
        self.users = MagicMock()
        self.users.find_one.return_value = self.user
        self.users_patch = patch("app.routers.auth.users", self.users)
        self.users_patch.start()

    def tearDown(self) -> None:
        self.users_patch.stop()

    def test_login_returns_token_and_public_profile(self) -> None:
        response = self.client.post(
            "/auth/login",
            json={"email": "Asha@Example.com", "password": "secret1"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["access_token"])
        self.assertEqual(body["user"]["email"], "asha@example.com")
        self.assertNotIn("password_hash", body["user"])

    def test_wrong_password_is_rejected(self) -> None:
        response = self.client.post(
            "/auth/login",
            json={"email": "asha@example.com", "password": "nope"},
        )

        self.assertEqual(response.status_code, 401)

    def test_unverified_email_is_blocked(self) -> None:
        self.user["email_verified"] = False

        with patch.multiple("app.routers.auth.settings", require_email_verification=True):
            response = self.client.post(
                "/auth/login",
                json={"email": "asha@example.com", "password": "secret1"},
            )

        self.assertEqual(response.status_code, 403)
        self.assertIn("not confirmed", response.json()["detail"])

    def test_token_carries_version_and_auth_time(self) -> None:
        self.user["token_version"] = 3
        response = self.client.post(
            "/auth/login", json={"email": "asha@example.com", "password": "secret1"}
        )

        claims = decode_access_token(response.json()["access_token"])
        self.assertEqual(claims["ver"], 3)
        self.assertEqual(claims["auth_time"], claims["iat"])
        self.assertNotIn("token_version", response.json()["user"])

    def test_login_exposes_must_change_password(self) -> None:
        self.user["must_change_password"] = True
        response = self.client.post(
            "/auth/login", json={"email": "asha@example.com", "password": "secret1"}
        )

        self.assertIs(response.json()["user"]["must_change_password"], True)

    def test_unknown_email_still_spends_a_bcrypt_check(self) -> None:
        self.users.find_one.return_value = None

        with patch("app.routers.auth.burn_password_check") as burn:
            response = self.client.post(
                "/auth/login", json={"email": "nobody@example.com", "password": "secret1"}
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid email or password.")
        burn.assert_called_once_with("secret1")

    def test_login_is_rate_limited(self) -> None:
        wrong = {"email": "asha@example.com", "password": "wrong-password"}
        for _ in range(10):
            self.assertEqual(self.client.post("/auth/login", json=wrong).status_code, 401)

        response = self.client.post("/auth/login", json=wrong)

        self.assertEqual(response.status_code, 429)
        self.assertIn("Too many attempts", response.json()["detail"])

    def test_rate_limit_can_be_switched_off(self) -> None:
        wrong = {"email": "asha@example.com", "password": "wrong-password"}
        with patch.multiple("app.utils.rate_limit.settings", rate_limit_enabled=False):
            for _ in range(12):
                self.assertEqual(self.client.post("/auth/login", json=wrong).status_code, 401)


if __name__ == "__main__":
    unittest.main()
