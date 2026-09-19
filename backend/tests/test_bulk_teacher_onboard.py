from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from app.main import app
from app.routers.superadmin import _parse_teachers_csv

SUPERADMIN = {
    "id": str(ObjectId()),
    "name": "Super Admin",
    "email": "superadmin@srhu.edu.in",
    "role": "superadmin",
}


class BulkTeacherOnboardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_parse_teachers_csv(self) -> None:
        csv_text = """Name,Email ID,Department
Dr. Rajesh Sharma,rajesh.cse@srhu.edu.in,Computer Science & Engineering
Pooja Verma,pooja.math@srhu.edu.in,Mathematics
"""
        parsed = _parse_teachers_csv(csv_text)
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[0]["name"], "Dr. Rajesh Sharma")
        self.assertEqual(parsed[0]["email"], "rajesh.cse@srhu.edu.in")
        self.assertEqual(parsed[0]["department"], "Computer Science & Engineering")
        self.assertEqual(parsed[1]["name"], "Pooja Verma")
        self.assertEqual(parsed[1]["email"], "pooja.math@srhu.edu.in")
        self.assertEqual(parsed[1]["department"], "Mathematics")

    def test_parse_teachers_csv_alternative_headers(self) -> None:
        csv_text = """Teacher Name,Email Address,Dept
Anita Rawat,anita.rawat@srhu.edu.in,Physics
"""
        parsed = _parse_teachers_csv(csv_text)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["name"], "Anita Rawat")
        self.assertEqual(parsed[0]["email"], "anita.rawat@srhu.edu.in")
        self.assertEqual(parsed[0]["department"], "Physics")

    def test_bulk_onboard_teachers_endpoint(self) -> None:
        payload = {
            "teachers": [
                {"name": "Teacher One", "email": "t1@srhu.edu.in", "department": "CSE"},
                {"name": "Teacher Two", "email": "t2@srhu.edu.in", "department": "ECE"},
            ],
            "send_email": True,
        }

        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN), \
             patch("app.routers.superadmin.find_user_by_email", return_value=None), \
             patch("app.routers.superadmin.users.insert_one") as mock_insert, \
             patch("app.services.email_service.send_teacher_credentials_email") as mock_email, \
             patch("app.services.audit_service.audit_logs.insert_one") as mock_audit:

            response = self.client.post(
                "/superadmin/teachers/bulk-onboard",
                headers={"Authorization": "Bearer token"},
                json=payload,
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["created_count"], 2)
            self.assertEqual(data["email_sent_count"], 2)
            self.assertEqual(len(data["created_teachers"]), 2)

            # Ensure unique temporary passwords
            p1 = data["created_teachers"][0]["temporary_password"]
            p2 = data["created_teachers"][1]["temporary_password"]
            self.assertNotEqual(p1, p2)
            self.assertGreaterEqual(len(p1), 12)

            self.assertEqual(mock_insert.call_count, 2)
            self.assertEqual(mock_email.call_count, 2)
            mock_audit.assert_called_once()

    def test_bulk_onboard_skips_existing_accounts(self) -> None:
        payload = {
            "teachers": [
                {"name": "Existing Teacher", "email": "existing@srhu.edu.in"},
                {"name": "New Teacher", "email": "new@srhu.edu.in"},
            ],
            "send_email": True,
        }

        def fake_find(email: str):
            if email == "existing@srhu.edu.in":
                return {"_id": ObjectId(), "email": email}
            return None

        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN), \
             patch("app.routers.superadmin.find_user_by_email", side_effect=fake_find), \
             patch("app.routers.superadmin.users.insert_one") as mock_insert, \
             patch("app.services.email_service.send_teacher_credentials_email") as mock_email, \
             patch("app.services.audit_service.audit_logs.insert_one"):

            response = self.client.post(
                "/superadmin/teachers/bulk-onboard",
                headers={"Authorization": "Bearer token"},
                json=payload,
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["created_count"], 1)
            self.assertEqual(data["skipped_count"], 1)
            self.assertEqual(data["skipped"][0]["email"], "existing@srhu.edu.in")
            self.assertEqual(mock_insert.call_count, 1)

    def test_bulk_onboard_file_upload(self) -> None:
        csv_bytes = b"Name,Email,Department\nProf Kumar,kumar@srhu.edu.in,Civil\n"

        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN), \
             patch("app.routers.superadmin.find_user_by_email", return_value=None), \
             patch("app.routers.superadmin.users.insert_one"), \
             patch("app.services.email_service.send_teacher_credentials_email"), \
             patch("app.services.audit_service.audit_logs.insert_one"):

            response = self.client.post(
                "/superadmin/teachers/bulk-onboard-file",
                headers={"Authorization": "Bearer token"},
                files={"file": ("teachers.csv", csv_bytes, "text/csv")},
                data={"send_email": "true"},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["created_count"], 1)
            self.assertEqual(data["created_teachers"][0]["email"], "kumar@srhu.edu.in")

    def test_send_credentials_endpoint(self) -> None:
        user_id = str(ObjectId())
        teacher_doc = {
            "_id": ObjectId(user_id),
            "name": "Teacher A",
            "email": "teachera@srhu.edu.in",
            "role": "teacher",
        }

        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN), \
             patch("app.routers.superadmin.find_user_or_404", return_value=teacher_doc), \
             patch("app.routers.superadmin.users.update_one"), \
             patch("app.services.email_service.send_teacher_credentials_email") as mock_email, \
             patch("app.services.audit_service.audit_logs.insert_one"):

            response = self.client.post(
                "/superadmin/teachers/send-credentials",
                headers={"Authorization": "Bearer token"},
                json={"user_ids": [user_id]},
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["sent_count"], 1)
            mock_email.assert_called_once()


if __name__ == "__main__":
    unittest.main()
