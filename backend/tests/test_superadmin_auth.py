from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.documents import ROLES  # noqa: E402
from app.utils.auth import get_superadmin_user  # noqa: E402


def user_with_role(role: str) -> dict:
    return {"id": "user-id", "name": "Someone", "email": "someone@example.com", "role": role}


class SuperadminRoleTests(unittest.TestCase):
    """The top role is `superadmin`; the legacy `admin` value no longer grants access."""

    def test_roles_list_superadmin_not_admin(self) -> None:
        self.assertIn("superadmin", ROLES)
        self.assertNotIn("admin", ROLES)

    def test_superadmin_is_allowed(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=user_with_role("superadmin")):
            self.assertEqual(get_superadmin_user("Bearer token")["role"], "superadmin")

    def test_other_roles_are_forbidden(self) -> None:
        for role in ("admin", "dean", "teacher"):
            with self.subTest(role=role), patch(
                "app.utils.auth.get_current_user", return_value=user_with_role(role)
            ):
                with self.assertRaises(HTTPException) as ctx:
                    get_superadmin_user("Bearer token")
                self.assertEqual(ctx.exception.status_code, 403)
                self.assertEqual(ctx.exception.detail, "Superadmin access required")


class SuperadminRouterTests(unittest.TestCase):
    """The console API lives under /superadmin; /admin is gone."""

    def setUp(self) -> None:
        self.client = TestClient(app)
        self.users = MagicMock()
        self.users.find.return_value.sort.return_value = []
        patcher = patch("app.routers.superadmin.users", self.users)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_superadmin_can_list_users(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=user_with_role("superadmin")):
            response = self.client.get("/superadmin/users", headers={"Authorization": "Bearer t"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 0)

    def test_dean_cannot_list_users(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=user_with_role("dean")):
            response = self.client.get("/superadmin/users", headers={"Authorization": "Bearer t"})
        self.assertEqual(response.status_code, 403)

    def test_legacy_admin_path_is_gone(self) -> None:
        response = self.client.get("/admin/users", headers={"Authorization": "Bearer t"})
        self.assertEqual(response.status_code, 404)

    def test_superadmin_cannot_delete_self(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=user_with_role("superadmin")):
            response = self.client.delete("/superadmin/users/user-id", headers={"Authorization": "Bearer t"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("superadmin", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
