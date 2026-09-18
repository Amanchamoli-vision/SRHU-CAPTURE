"""Session lifetime (B-5), password reset / change side effects (B-17, B-18, B-20)
and the Dean's must_change_password flag (B-10).

Every route runs against an in-memory users collection; nothing touches MongoDB.
"""

from __future__ import annotations

import os
import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from bson import ObjectId  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.utils import rate_limit  # noqa: E402
from app.utils.security import (  # noqa: E402
    create_access_token,
    decode_access_token,
    hash_one_time_token,
    hash_password,
    verify_password,
)
from app.utils.serializers import utc_now  # noqa: E402
from tests.fake_users import FakeUsers  # noqa: E402

SESSION_ENDED = "Your session has ended. Please login again."
SESSION_EXPIRED = "Your session has expired. Please login again."


def make_user(**overrides) -> dict:
    user = {
        "_id": ObjectId(),
        "name": "Asha Rana",
        "email": "asha@example.com",
        "password_hash": hash_password("secret1"),
        "role": "teacher",
        "email_verified": True,
        "email_verified_at": utc_now(),
        "reset_token_hash": None,
        "reset_expires_at": None,
    }
    user.update(overrides)
    return user


class SessionTestCase(unittest.TestCase):
    def setUp(self) -> None:
        rate_limit.reset()
        self.client = TestClient(app)
        self.user = make_user()
        self.users = FakeUsers(self.user)
        for target in ("app.utils.auth.users", "app.routers.auth.users", "app.routers.users.users"):
            patcher = patch(target, self.users)
            patcher.start()
            self.addCleanup(patcher.stop)

    def token(self, *, ver: int = 0, auth_time: int | None = None) -> str:
        token, _ = create_access_token(
            str(self.user["_id"]), "teacher", token_version=ver, auth_time=auth_time
        )
        return token

    def auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def stored(self) -> dict:
        return self.users.get(self.user["_id"])


class TokenVersionTests(SessionTestCase):
    def test_accounts_without_a_version_accept_version_zero(self) -> None:
        response = self.client.get("/auth/me", headers=self.auth(self.token()))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("token_version", response.json()["user"])

    def test_legacy_token_without_ver_still_works(self) -> None:
        import jwt

        from app.config import settings

        legacy = jwt.encode(
            {
                "sub": str(self.user["_id"]),
                "role": "teacher",
                "type": "access",
                "iat": int(utc_now().timestamp()),
                "exp": utc_now() + timedelta(hours=1),
            },
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(legacy)).status_code, 200)

    def test_stale_version_is_rejected(self) -> None:
        self.stored()["token_version"] = 1
        response = self.client.get("/users/me", headers=self.auth(self.token(ver=0)))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], SESSION_ENDED)

    def test_password_change_ends_old_sessions(self) -> None:
        old = self.token()

        response = self.client.post(
            "/users/me/change-password",
            json={"current_password": "secret1", "new_password": "brand-new-pass"},
            headers=self.auth(old),
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stored()["token_version"], 1)
        stale = self.client.get("/auth/me", headers=self.auth(old))
        self.assertEqual(stale.status_code, 401)
        self.assertEqual(stale.json()["detail"], SESSION_ENDED)
        # This device gets a fresh token that carries the new version.
        fresh = response.json()["access_token"]
        self.assertEqual(decode_access_token(fresh)["ver"], 1)
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(fresh)).status_code, 200)

    def test_logout_ends_the_session_on_the_server(self) -> None:
        token = self.token()

        response = self.client.post("/auth/logout", headers=self.auth(token))

        self.assertEqual(response.json(), {"message": "Signed out"})
        self.assertEqual(self.stored()["token_version"], 1)
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(token)).status_code, 401)

    def test_logout_without_a_valid_token_is_still_signed_out(self) -> None:
        for headers in ({}, {"Authorization": "Bearer not-a-jwt"}):
            with self.subTest(headers=headers):
                response = self.client.post("/auth/logout", headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"message": "Signed out"})
        self.assertNotIn("token_version", self.stored())


class RefreshTests(SessionTestCase):
    def test_refresh_keeps_the_original_auth_time(self) -> None:
        signed_in = int((utc_now() - timedelta(days=3)).timestamp())

        response = self.client.post(
            "/auth/refresh", headers=self.auth(self.token(auth_time=signed_in))
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(set(body), {"access_token", "token_type", "expires_in", "user"})
        claims = decode_access_token(body["access_token"])
        self.assertEqual(claims["auth_time"], signed_in)
        self.assertEqual(claims["ver"], 0)

    def test_refresh_refuses_past_the_maximum_session_age(self) -> None:
        signed_in = int((utc_now() - timedelta(days=31)).timestamp())

        response = self.client.post(
            "/auth/refresh", headers=self.auth(self.token(auth_time=signed_in))
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], SESSION_EXPIRED)

    def test_refresh_refuses_a_revoked_token(self) -> None:
        self.stored()["token_version"] = 2
        response = self.client.post("/auth/refresh", headers=self.auth(self.token(ver=1)))
        self.assertEqual(response.status_code, 401)


class ChangePasswordTests(SessionTestCase):
    def test_change_clears_reset_link_and_must_change_flag(self) -> None:
        self.stored().update(
            must_change_password=True,
            reset_token_hash="pending-reset",
            reset_expires_at=utc_now() + timedelta(minutes=30),
        )

        response = self.client.post(
            "/users/me/change-password",
            json={"current_password": "secret1", "new_password": "brand-new-pass"},
            headers=self.auth(self.token()),
        )

        self.assertEqual(response.status_code, 200, response.text)
        stored = self.stored()
        self.assertIs(stored["must_change_password"], False)
        self.assertIsNone(stored["reset_token_hash"])
        self.assertIsNone(stored["reset_expires_at"])
        self.assertTrue(verify_password("brand-new-pass", stored["password_hash"]))
        self.assertIs(response.json()["user"]["must_change_password"], False)

    def test_wrong_current_password_changes_nothing(self) -> None:
        response = self.client.post(
            "/users/me/change-password",
            json={"current_password": "nope", "new_password": "brand-new-pass"},
            headers=self.auth(self.token()),
        )
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("token_version", self.stored())


class ResetPasswordTests(SessionTestCase):
    TOKEN = "r" * 43

    def setUp(self) -> None:
        super().setUp()
        self.stored().update(
            email_verified=False,
            email_verified_at=None,
            verification_token_hash="pending-verification",
            verification_expires_at=utc_now() + timedelta(hours=1),
            reset_token_hash=hash_one_time_token(self.TOKEN),
            reset_expires_at=utc_now() + timedelta(minutes=30),
            must_change_password=True,
        )

    def reset(self, token: str | None = None):
        return self.client.post(
            "/auth/reset-password",
            json={"token": token or self.TOKEN, "new_password": "owner-chosen"},
        )

    def test_reset_verifies_the_email_and_ends_sessions(self) -> None:
        old = self.token()

        response = self.reset()

        self.assertEqual(response.status_code, 200, response.text)
        stored = self.stored()
        self.assertTrue(stored["email_verified"])
        self.assertIsNotNone(stored["email_verified_at"])
        self.assertIsNone(stored["verification_token_hash"])
        self.assertIsNone(stored["verification_expires_at"])
        self.assertIsNone(stored["reset_token_hash"])
        self.assertIs(stored["must_change_password"], False)
        self.assertEqual(stored["token_version"], 1)
        self.assertTrue(verify_password("owner-chosen", stored["password_hash"]))
        self.assertEqual(self.client.get("/auth/me", headers=self.auth(old)).status_code, 401)

        # The unverified account can now sign in.
        login = self.client.post(
            "/auth/login", json={"email": "asha@example.com", "password": "owner-chosen"}
        )
        self.assertEqual(login.status_code, 200, login.text)

    def test_reset_is_a_single_atomic_update_on_the_token(self) -> None:
        self.reset()
        query, update = self.users.updates[0]
        self.assertEqual(query["reset_token_hash"], hash_one_time_token(self.TOKEN))
        self.assertIn("$gt", query["reset_expires_at"])
        self.assertEqual(update["$inc"], {"token_version": 1})

    def test_token_cannot_be_used_twice(self) -> None:
        self.assertEqual(self.reset().status_code, 200)
        second = self.reset()
        self.assertEqual(second.status_code, 400)
        self.assertIn("invalid or has already been used", second.json()["detail"])

    def test_expired_token_is_reported_as_expired(self) -> None:
        self.stored()["reset_expires_at"] = utc_now() - timedelta(minutes=1)
        response = self.reset()
        self.assertEqual(response.status_code, 400)
        self.assertIn("expired", response.json()["detail"])
        self.assertFalse(self.stored()["email_verified"])


class DeanTemporaryPasswordTests(unittest.TestCase):
    def test_create_dean_flags_the_account_and_still_returns_the_password(self) -> None:
        client = TestClient(app)
        users = MagicMock()
        users.insert_one.return_value = MagicMock(inserted_id=ObjectId())
        superadmin = {"id": "x", "name": "Root", "email": "root@example.com", "role": "superadmin"}

        with patch("app.routers.superadmin.users", users), \
                patch("app.routers.superadmin.find_user_by_email", return_value=None) as lookup, \
                patch("app.routers.superadmin.email_service.is_configured", return_value=False), \
                patch("app.utils.auth.get_current_user", return_value=superadmin):
            response = client.post(
                "/superadmin/create-dean",
                json={"name": "Dean Kumar", "email": "Dean@Example.com"},
                headers={"Authorization": "Bearer t"},
            )

        self.assertEqual(response.status_code, 201, response.text)
        lookup.assert_called_once_with("dean@example.com")
        document = users.insert_one.call_args[0][0]
        self.assertIs(document["must_change_password"], True)
        body = response.json()
        self.assertTrue(body["temporary_password"])
        self.assertIs(body["user"]["must_change_password"], True)
        self.assertNotIn("password_hash", body["user"])

    def test_create_dean_rejects_a_gmail_dot_variant(self) -> None:
        client = TestClient(app)
        users = MagicMock()
        superadmin = {"id": "x", "role": "superadmin"}
        with patch("app.routers.superadmin.users", users), \
                patch("app.routers.superadmin.find_user_by_email", return_value={"_id": 1}), \
                patch("app.utils.auth.get_current_user", return_value=superadmin):
            response = client.post(
                "/superadmin/create-dean",
                json={"name": "Dean", "email": "d.ean@gmail.com"},
                headers={"Authorization": "Bearer t"},
            )
        self.assertEqual(response.status_code, 409)
        users.insert_one.assert_not_called()


class RateLimiterTests(unittest.TestCase):
    def test_sliding_window_expires_old_hits(self) -> None:
        now = [0.0]
        limiter = rate_limit.SlidingWindowLimiter(clock=lambda: now[0])
        rule = rate_limit.Rule("t", 2, 10)

        self.assertTrue(limiter.hit([(rule, "k")]))
        self.assertTrue(limiter.hit([(rule, "k")]))
        self.assertFalse(limiter.hit([(rule, "k")]))
        self.assertTrue(limiter.hit([(rule, "other")]))
        now[0] = 10.5
        self.assertTrue(limiter.hit([(rule, "k")]))

    def test_blocked_attempt_does_not_consume_other_budgets(self) -> None:
        limiter = rate_limit.SlidingWindowLimiter(clock=lambda: 0.0)
        tight = rate_limit.Rule("tight", 1, 60)
        loose = rate_limit.Rule("loose", 5, 60)

        self.assertTrue(limiter.hit([(tight, "a"), (loose, "ip")]))
        for _ in range(3):
            self.assertFalse(limiter.hit([(tight, "a"), (loose, "ip")]))
        # Only one hit was recorded against "loose", so four more fit.
        for _ in range(4):
            self.assertTrue(limiter.hit([(loose, "ip")]))
        self.assertFalse(limiter.hit([(loose, "ip")]))

    def test_gmail_variants_share_a_key(self) -> None:
        self.assertEqual(
            rate_limit.normalize_email_key("First.Last+x@GoogleMail.com"),
            rate_limit.normalize_email_key("firstlast@gmail.com"),
        )

    def test_forgot_password_is_limited_per_email(self) -> None:
        rate_limit.reset()
        client = TestClient(app)
        with patch("app.routers.auth.find_user_by_email", return_value=None):
            for _ in range(5):
                response = client.post("/auth/forgot-password", json={"email": "v@example.com"})
                self.assertEqual(response.status_code, 200)
            blocked = client.post("/auth/forgot-password", json={"email": "V@example.com"})
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["detail"], rate_limit.TOO_MANY_ATTEMPTS_MESSAGE)
        rate_limit.reset()


if __name__ == "__main__":
    unittest.main()
