"""Tests for profile edit: name, phone, department updates and validations."""

from __future__ import annotations

import copy
import os
import unittest
from unittest.mock import patch

from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.auth import UpdateProfileRequest  # noqa: E402

client = TestClient(app)


class FakeUserCollection:
    def __init__(self, doc: dict) -> None:
        self.doc = copy.deepcopy(doc)

    def find_one_and_update(self, query: dict, update: dict, return_document: bool = True) -> dict | None:
        if "$set" in update:
            for k, v in update["$set"].items():
                self.doc[k] = v
        return copy.deepcopy(self.doc)


class ProfileEditTests(unittest.TestCase):
    def test_schema_department_normalization(self) -> None:
        req = UpdateProfileRequest(
            name="Dr. Test",
            phone="9876543210",
            department="   Department   of   CSE   ",
        )
        self.assertEqual(req.department, "Department of CSE")
        self.assertEqual(req.phone, "9876543210")

    def test_schema_phone_invalid_rejected(self) -> None:
        with self.assertRaises(ValueError):
            UpdateProfileRequest(
                name="Dr. Test",
                phone="12345",  # less than 10 digits
            )

        with self.assertRaises(ValueError):
            UpdateProfileRequest(
                name="Dr. Test",
                phone="98765abcde",  # letters
            )

    def test_teacher_can_update_department_and_phone(self) -> None:
        user_id = str(ObjectId())
        teacher_doc = {
            "_id": ObjectId(user_id),
            "id": user_id,
            "name": "Old Name",
            "email": "teacher@srhu.edu.in",
            "role": "teacher",
            "phone": None,
            "department": None,
        }
        fake_col = FakeUserCollection(teacher_doc)

        with patch("app.routers.users.get_current_user", return_value=teacher_doc), \
             patch("app.routers.users.users", fake_col):
            res = client.patch(
                "/users/me",
                json={
                    "name": "Updated Teacher",
                    "phone": "9876543210",
                    "department": "Computer Science & Engineering",
                },
                headers={"Authorization": "Bearer fake"},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["user"]["name"], "Updated Teacher")
            self.assertEqual(data["user"]["phone"], "9876543210")
            self.assertEqual(data["user"]["department"], "Computer Science & Engineering")

    def test_dean_can_update_department_and_phone(self) -> None:
        user_id = str(ObjectId())
        dean_doc = {
            "_id": ObjectId(user_id),
            "id": user_id,
            "name": "Old Dean",
            "email": "dean@srhu.edu.in",
            "role": "dean",
            "phone": "9999999999",
            "department": "Old Dept",
        }
        fake_col = FakeUserCollection(dean_doc)

        with patch("app.routers.users.get_current_user", return_value=dean_doc), \
             patch("app.routers.users.users", fake_col):
            res = client.patch(
                "/users/me",
                json={
                    "name": "Dean Updated",
                    "phone": "9876543211",
                    "department": "School of Engineering",
                },
                headers={"Authorization": "Bearer fake"},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["user"]["department"], "School of Engineering")
            self.assertEqual(data["user"]["phone"], "9876543211")

    def test_superadmin_cannot_update_department_or_phone(self) -> None:
        user_id = str(ObjectId())
        admin_doc = {
            "_id": ObjectId(user_id),
            "id": user_id,
            "name": "Super Admin",
            "email": "admin@srhu.edu.in",
            "role": "superadmin",
            "phone": None,
            "department": None,
        }
        fake_col = FakeUserCollection(admin_doc)

        with patch("app.routers.users.get_current_user", return_value=admin_doc), \
             patch("app.routers.users.users", fake_col):
            res = client.patch(
                "/users/me",
                json={
                    "name": "New Admin Name",
                    "phone": "9876543210",
                    "department": "Admin Dept",
                },
                headers={"Authorization": "Bearer fake"},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            # Name should update, but phone and department should remain None for superadmin
            self.assertEqual(data["user"]["name"], "New Admin Name")
            self.assertIsNone(data["user"].get("phone"))
            self.assertIsNone(data["user"].get("department"))
