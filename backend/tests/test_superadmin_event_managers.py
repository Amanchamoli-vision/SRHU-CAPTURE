"""The Super Admin inviting an Event Manager (POST /superadmin/event-managers).

The account joins the way a Dean-invited teacher does: an emailed one-time
link to /auth/accept-invite verifies the address and sets the password, then
the normal login page signs them in.
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from app.services import email_service
from app.utils.security import verify_password
from app.utils.serializers import utc_now
from tests.test_dean_teacher_import import InsertableUsers
from tests.test_dean_teacher_management import DeanTeacherTestCase

NEW = {"name": "  Priya   Sharma ", "email": "Priya.Sharma@SRHU.edu.in"}
EMAIL = "priya.sharma@srhu.edu.in"


class EventManagerInviteTests(DeanTeacherTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.users.__class__ = InsertableUsers
        self.sent_manager_invites: list[tuple[str, str]] = []
        sender = patch.object(
            email_service, "send_event_manager_invitation_email",
            side_effect=lambda to, name, token: self.sent_manager_invites.append((to, token)),
        )
        sender.start()
        self.addCleanup(sender.stop)

    def create(self, body: dict | None = None, user: dict | None = None):
        return self.client.post(
            "/superadmin/event-managers",
            json=body or NEW,
            headers=self.auth(user or self.superadmin),
        )

    def resend(self, user_id: str, user: dict | None = None):
        return self.client.post(
            f"/superadmin/event-managers/{user_id}/invite",
            headers=self.auth(user or self.superadmin),
        )

    def stored(self, email: str = EMAIL) -> dict | None:
        return next((d for d in self.users.documents if d["email"] == email), None)

    def test_invite_verify_and_sign_in(self) -> None:
        response = self.create()
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["invite"]["status"], "sent")
        self.assertIn("verification link", data["message"])

        doc = self.stored()
        self.assertEqual(doc["name"], "Priya Sharma")
        self.assertEqual(doc["role"], "event_manager")
        self.assertFalse(doc["email_verified"])
        self.assertIsNotNone(doc["invite_expires_at"])
        for guess in ("", "password", "Passw0rd!"):
            self.assertFalse(verify_password(guess, doc["password_hash"]))
        for private in ("password_hash", "invite_token_hash", "token_version"):
            self.assertNotIn(private, data["user"])

        to, token = self.sent_manager_invites[-1]
        self.assertEqual(to, EMAIL)
        self.assertNotIn(token, response.text)
        self.assertNotIn(token, str(self.audit.documents))
        self.assertEqual(self.sent_invites, [])  # not the teacher template

        # Unverified: no way in before the link is followed.
        before = self.client.post("/auth/login", json={"email": EMAIL, "password": "Priya#2026"})
        self.assertNotEqual(before.status_code, 200)

        accepted = self.client.post(
            "/auth/accept-invite", json={"token": token, "new_password": "Priya#2026"}
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertTrue(self.stored()["email_verified"])

        login = self.client.post("/auth/login", json={"email": EMAIL, "password": "Priya#2026"})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["user"]["role"], "event_manager")

    def test_only_a_superadmin_may_invite(self) -> None:
        for user in (self.dean, self.teacher):
            self.assertEqual(self.create(user=user).status_code, 403)
        self.assertEqual(
            self.client.post("/superadmin/event-managers", json=NEW).status_code, 401
        )
        self.assertIsNone(self.stored())
        self.assertEqual(self.sent_manager_invites, [])

    def test_email_not_configured_creates_nothing(self) -> None:
        with patch.object(email_service, "is_configured", return_value=False):
            response = self.create()
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(self.stored())

    def test_failed_email_keeps_the_account_for_a_resend(self) -> None:
        with patch.object(email_service, "send_event_manager_invitation_email",
                          side_effect=email_service.EmailDeliveryError("down")):
            response = self.create()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["invite"]["status"], "failed")
        self.assertIsNone(self.stored().get("invite_token_hash"))

        resent = self.resend(str(self.stored()["_id"]))
        self.assertEqual(resent.status_code, 200, resent.text)
        self.assertEqual(self.sent_manager_invites[-1][0], EMAIL)

    def test_existing_addresses_are_refused(self) -> None:
        for email in (self.teacher["email"].upper(), self.dean["email"], self.superadmin["email"]):
            response = self.create({**NEW, "email": email})
            self.assertEqual(response.status_code, 409, email)
            self.assertIn("already exists", response.json()["detail"])
        self.assertEqual(self.doc(self.dean)["role"], "dean")

        self.create()
        again = self.create()
        self.assertEqual(again.status_code, 409)
        self.assertIn("Resend", again.json()["detail"])

    def test_resend_replaces_the_old_link(self) -> None:
        self.create()
        _, old = self.sent_manager_invites[-1]
        self.assertEqual(self.resend(str(self.stored()["_id"])).status_code, 200)
        _, new = self.sent_manager_invites[-1]

        stale = self.client.post("/auth/accept-invite", json={"token": old, "new_password": "Old#Pass1"})
        self.assertEqual(stale.status_code, 400)
        fresh = self.client.post("/auth/accept-invite", json={"token": new, "new_password": "New#Pass1"})
        self.assertEqual(fresh.status_code, 200, fresh.text)
        self.assertEqual(self.audit.actions(), ["event_manager_created", "event_manager_invite_resent"])

    def test_resend_is_refused_once_registered_or_for_other_roles(self) -> None:
        self.create()
        _, token = self.sent_manager_invites[-1]
        self.client.post("/auth/accept-invite", json={"token": token, "new_password": "Priya#2026"})

        registered = self.resend(str(self.stored()["_id"]))
        self.assertEqual(registered.status_code, 409)
        self.assertEqual(self.resend(str(self.teacher["_id"])).status_code, 400)

    def test_expired_link_points_to_the_super_admin(self) -> None:
        self.create()
        _, token = self.sent_manager_invites[-1]
        self.stored()["invite_expires_at"] = utc_now() - timedelta(minutes=1)

        response = self.client.post(
            "/auth/accept-invite", json={"token": token, "new_password": "Priya#2026"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Super Admin", response.json()["detail"])

    def test_user_list_counts_event_managers(self) -> None:
        self.create()
        data = self.client.get(
            "/superadmin/users?role=event_manager", headers=self.auth(self.superadmin)
        ).json()
        self.assertEqual(data["counts"]["event_manager"], 1)
        self.assertEqual([u["email"] for u in data["users"]], [EMAIL])
