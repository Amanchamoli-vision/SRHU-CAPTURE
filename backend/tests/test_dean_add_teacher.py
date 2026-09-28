"""The Dean adding one teacher at a time (POST /dean/teachers)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services import email_service
from app.utils.security import verify_password
from tests.test_dean_teacher_import import InsertableUsers
from tests.test_dean_teacher_management import DeanTeacherTestCase

NEW = {
    "name": "  Dr.  Kavita   Nair ",
    "email": "Kavita.Nair@SRHU.edu.in",
    "phone": "+91 98111 22233",
    "department": "Computer Science & Engineering",
    "designation": "Assistant Professor",
}


class AddTeacherTests(DeanTeacherTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.users.__class__ = InsertableUsers

    def add(self, body: dict, user: dict | None = None):
        return self.client.post("/dean/teachers", json=body, headers=self.auth(user or self.dean))

    def stored(self, email: str) -> dict | None:
        return next((d for d in self.users.documents if d["email"] == email), None)

    def test_adds_a_teacher_and_sends_the_invitation(self) -> None:
        response = self.add(NEW)
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["invite"]["status"], "sent")
        self.assertIn("added and invited", data["message"])

        doc = self.stored("kavita.nair@srhu.edu.in")
        self.assertEqual(doc["name"], "Dr. Kavita Nair")
        self.assertEqual(doc["role"], "teacher")
        self.assertEqual(doc["phone"], "9811122233")
        self.assertEqual(doc["department"], "Computer Science & Engineering")
        self.assertEqual(doc["designation"], "Assistant Professor")
        self.assertEqual(doc["onboarded_via"], "dean_added")
        self.assertEqual(doc["added_by"], str(self.dean["_id"]))
        self.assertFalse(doc["email_verified"])
        for guess in ("", "password", "Passw0rd!"):
            self.assertFalse(verify_password(guess, doc["password_hash"]))

        self.assertEqual(data["teacher"]["onboarding_status"], "invited")
        for private in ("password_hash", "invite_token_hash", "token_version"):
            self.assertNotIn(private, data["teacher"])

        to, token = self.sent_invites[-1]
        self.assertEqual(to, "kavita.nair@srhu.edu.in")
        self.assertNotIn(token, response.text)
        self.assertNotIn(token, str(self.audit.documents))
        self.assertEqual(self.audit.actions(), ["teacher_created"])

        accepted = self.client.post("/auth/accept-invite", json={"token": token, "new_password": "Kavita#2026"})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        login = self.client.post("/auth/login", json={"email": "kavita.nair@srhu.edu.in", "password": "Kavita#2026"})
        self.assertEqual(login.status_code, 200, login.text)

    def test_add_without_an_invitation(self) -> None:
        response = self.add({**NEW, "send_invite": False})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["invite"]["status"], "not_sent")
        self.assertEqual(response.json()["teacher"]["onboarding_status"], "not_invited")
        self.assertEqual(self.sent_invites, [])
        self.assertIsNotNone(self.stored("kavita.nair@srhu.edu.in"))

    def test_email_not_configured_still_adds(self) -> None:
        with patch.object(email_service, "is_configured", return_value=False):
            response = self.add(NEW)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["invite"]["status"], "not_sent")
        self.assertIn("not configured", response.json()["message"])
        self.assertEqual(self.sent_invites, [])

    def test_failed_invitation_still_adds(self) -> None:
        with patch.object(email_service, "send_teacher_invitation_email",
                          side_effect=email_service.EmailDeliveryError("down")):
            response = self.add(NEW)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["invite"]["status"], "failed")
        self.assertIsNone(self.stored("kavita.nair@srhu.edu.in").get("invite_token_hash"))

    def test_existing_addresses_are_refused_with_the_reason(self) -> None:
        cases = [
            (self.teacher["email"].upper(), "Already in the teacher list"),
            (self.other_dean["email"], "not a Teacher"),
            (self.superadmin["email"], "not a Teacher"),
        ]
        for email, reason in cases:
            response = self.add({**NEW, "email": email})
            self.assertEqual(response.status_code, 409, email)
            self.assertIn(reason, response.json()["detail"])
        self.client.post(f"/dean/teachers/{self.teacher['_id']}/remove", headers=self.auth(self.dean))
        removed = self.add({**NEW, "email": self.teacher["email"]})
        self.assertIn("Restore them", removed.json()["detail"])
        # Nothing about the existing accounts changed.
        self.assertEqual(self.doc(self.other_dean)["role"], "dean")
        self.assertEqual(self.doc(self.superadmin)["role"], "superadmin")

    def test_input_is_validated(self) -> None:
        for body in (
            {**NEW, "name": "   "},
            {k: v for k, v in NEW.items() if k != "name"},
            {**NEW, "email": "not-an-email"},
            {k: v for k, v in NEW.items() if k != "email"},
            {**NEW, "phone": "12345"},
        ):
            self.assertEqual(self.add(body).status_code, 422, body)
        self.assertIsNone(self.stored("kavita.nair@srhu.edu.in"))

    def test_optional_fields_can_be_left_out(self) -> None:
        response = self.add({"name": "Minimal Teacher", "email": "minimal@srhu.edu.in", "send_invite": False})
        self.assertEqual(response.status_code, 201, response.text)
        doc = self.stored("minimal@srhu.edu.in")
        self.assertIsNone(doc["phone"])
        self.assertIsNone(doc["department"])

    def test_source_filter(self) -> None:
        self.add({**NEW, "send_invite": False})
        headers = self.auth(self.dean)
        added = self.client.get("/dean/teachers?source=added", headers=headers).json()
        self.assertEqual([t["email"] for t in added["teachers"]], ["kavita.nair@srhu.edu.in"])
        registered = self.client.get("/dean/teachers?source=registered", headers=headers).json()
        self.assertNotIn("kavita.nair@srhu.edu.in", [t["email"] for t in registered["teachers"]])
        self.assertIn(self.teacher["email"], [t["email"] for t in registered["teachers"]])

    def test_only_a_dean_can_add(self) -> None:
        for user in (self.teacher, self.superadmin):
            self.assertEqual(self.add(NEW, user=user).status_code, 403)
        self.assertEqual(self.client.post("/dean/teachers", json=NEW).status_code, 401)
        self.assertIsNone(self.stored("kavita.nair@srhu.edu.in"))

    def test_import_still_creates_teachers_after_the_shared_refactor(self) -> None:
        response = self.client.post(
            "/dean/teachers/import",
            json={"teachers": [{"email": "rajesh.kumar@srhu.edu.in", "phone": "9876543210"}]},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.json()["created_count"], 1)
        doc = self.stored("rajesh.kumar@srhu.edu.in")
        self.assertEqual((doc["name"], doc["onboarded_via"]), ("Rajesh Kumar", "dean_import"))
        self.assertEqual(doc["imported_by"], str(self.dean["_id"]))


if __name__ == "__main__":
    unittest.main()
