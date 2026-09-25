"""The Dean's Teacher-account management (routers/dean_teachers.py).

Requests carry real JWTs and are authenticated against an in-memory users
collection, so the whole chain -- token, account state, role, Teacher-only
target -- is exercised rather than a patched-out current user.
"""

from __future__ import annotations

import copy
import os
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from app.main import app
from app.services import email_service
from app.utils.security import create_access_token, verify_password
from app.utils.serializers import utc_now
from tests.fake_users import FakeUsers, _Cursor, _matches


class _PagedCursor(_Cursor):
    def skip(self, count: int) -> "_PagedCursor":
        return _PagedCursor(self._documents[count:])

    def limit(self, count: int) -> "_PagedCursor":
        return _PagedCursor(self._documents[:count] if count else self._documents)

    def sort(self, *_args, **_kwargs) -> "_PagedCursor":
        return self


class Users(FakeUsers):
    def find(self, query=None, projection=None, **_kwargs):
        return _PagedCursor([
            copy.deepcopy(d) for d in self.documents if _matches(d, query or {})
        ])

    def count_documents(self, query: dict) -> int:
        return sum(1 for d in self.documents if _matches(d, query))

    def update_one(self, query: dict, update: dict, **_kwargs):
        self.updates.append((query, update))
        for document in self.documents:
            if _matches(document, query):
                self._apply(document, update)
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)

    def delete_one(self, query: dict):
        self.documents = [d for d in self.documents if not _matches(d, query)]


class AuditLogs:
    def __init__(self) -> None:
        self.documents: list[dict] = []

    def insert_one(self, document: dict):
        document = {**document, "_id": ObjectId()}
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    def find(self, query: dict | None = None, *_args, **_kwargs):
        via = (query or {}).get("details.via")
        return _PagedCursor([
            d for d in reversed(self.documents)
            if via is None or d.get("details", {}).get("via") == via
        ])

    def actions(self) -> list[str]:
        return [d["action"] for d in self.documents]


def _user(role: str, **fields) -> dict:
    doc = {
        "_id": ObjectId(),
        "name": f"{role.title()} {ObjectId()}"[:30],
        "email": f"{role}-{ObjectId()}@srhu.edu.in",
        "password_hash": "$2b$12$existinghashexistinghashexistinghashexistinghashexi",
        "role": role,
        "phone": None,
        "department": None,
        "designation": None,
        "is_active": True,
        "email_verified": True,
        "email_verified_at": utc_now(),
        "must_change_password": False,
        "token_version": 0,
        "reset_token_hash": None,
        "reset_expires_at": None,
        "verification_token_hash": None,
        "verification_expires_at": None,
        "last_sign_in_at": None,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    doc.update(fields)
    return doc


class DeanTeacherTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.dean = _user("dean", name="Dean Rao")
        self.other_dean = _user("dean", name="Dean Two")
        self.superadmin = _user("superadmin", name="Root")
        self.teacher = _user("teacher", name="Meera Joshi", phone="9876543210", department="CSE")
        self.signed_in_teacher = _user(
            "teacher", name="Arun Kumar", last_sign_in_at=utc_now() - timedelta(days=2)
        )
        self.inactive_teacher = _user("teacher", name="Inactive Ina", is_active=False)
        self.users = Users(
            self.dean, self.other_dean, self.superadmin,
            self.teacher, self.signed_in_teacher, self.inactive_teacher,
        )
        self.audit = AuditLogs()

        def cascade(user_id: str) -> None:
            self.users.delete_one({"_id": ObjectId(user_id)})

        self.sent_credentials: list[tuple[str, str]] = []
        self.sent_resets: list[tuple[str, str]] = []

        patches = [
            patch("app.utils.auth.users", self.users),
            patch("app.routers.dean_teachers.users", self.users),
            patch("app.routers.auth.users", self.users),
            patch("app.routers.superadmin.users", self.users),
            patch("app.services.audit_service.audit_logs", self.audit),
            patch("app.routers.dean_teachers.audit_logs", self.audit),
            patch("app.routers.dean_teachers.delete_user_cascade", side_effect=cascade),
            patch.object(email_service, "is_configured", return_value=True),
            patch.object(
                email_service, "send_teacher_credentials_email",
                side_effect=lambda to, name, pw: self.sent_credentials.append((to, pw)),
            ),
            patch.object(
                email_service, "send_password_reset_email",
                side_effect=lambda to, name, token: self.sent_resets.append((to, token)),
            ),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

        self.client = TestClient(app)

    def auth(self, user: dict) -> dict:
        stored = self.users.get(user["_id"])
        token, _ = create_access_token(
            str(stored["_id"]), stored["role"], token_version=stored.get("token_version", 0)
        )
        return {"Authorization": f"Bearer {token}"}

    def doc(self, user: dict) -> dict | None:
        return next((d for d in self.users.documents if d["_id"] == user["_id"]), None)


class AccessControlTests(DeanTeacherTestCase):
    ROUTES = [
        ("get", "/dean/teachers"),
        ("get", "/dean/teachers/activity"),
        ("post", "/dean/teachers/send-credentials"),
    ]

    def test_unauthenticated_is_401(self) -> None:
        for method, path in self.ROUTES:
            response = getattr(self.client, method)(path)
            self.assertEqual(response.status_code, 401, path)

    def test_teacher_cannot_reach_dean_routes(self) -> None:
        headers = self.auth(self.teacher)
        tid = str(self.signed_in_teacher["_id"])
        for method, path, body in [
            ("get", "/dean/teachers", None),
            ("patch", f"/dean/teachers/{tid}", {"name": "Hacked"}),
            ("post", f"/dean/teachers/{tid}/promote", None),
            ("post", f"/dean/teachers/{tid}/deactivate", None),
            ("delete", f"/dean/teachers/{tid}", None),
            ("post", "/dean/teachers/send-credentials", {"user_ids": [tid]}),
        ]:
            kwargs = {"headers": headers}
            if body is not None:
                kwargs["json"] = body
            response = getattr(self.client, method)(path, **kwargs)
            self.assertEqual(response.status_code, 403, path)
        self.assertEqual(self.doc(self.signed_in_teacher)["name"], "Arun Kumar")
        self.assertEqual(self.doc(self.signed_in_teacher)["role"], "teacher")

    def test_superadmin_uses_its_own_routes_not_the_dean_panel(self) -> None:
        response = self.client.get("/dean/teachers", headers=self.auth(self.superadmin))
        self.assertEqual(response.status_code, 403)

    def test_dean_cannot_reach_superadmin_routes(self) -> None:
        headers = self.auth(self.dean)
        tid = str(self.teacher["_id"])
        for method, path in [
            ("get", "/superadmin/users"),
            ("patch", f"/superadmin/users/{tid}/make-dean"),
            ("delete", f"/superadmin/users/{tid}"),
            ("get", "/superadmin/audit-logs"),
        ]:
            response = getattr(self.client, method)(path, headers=headers)
            self.assertEqual(response.status_code, 403, path)

    def test_dean_cannot_touch_deans_superadmins_or_self(self) -> None:
        headers = self.auth(self.dean)
        for target in (self.other_dean, self.superadmin, self.dean):
            tid = str(target["_id"])
            for method, path, body in [
                ("patch", f"/dean/teachers/{tid}", {"name": "Changed"}),
                ("post", f"/dean/teachers/{tid}/promote", None),
                ("post", f"/dean/teachers/{tid}/deactivate", None),
                ("post", f"/dean/teachers/{tid}/reset-password", None),
                ("post", f"/dean/teachers/{tid}/send-credentials", None),
                ("delete", f"/dean/teachers/{tid}", None),
            ]:
                kwargs = {"headers": headers}
                if body is not None:
                    kwargs["json"] = body
                response = getattr(self.client, method)(path, **kwargs)
                self.assertIn(response.status_code, (403, 404), f"{method} {path}")
            self.assertEqual(self.doc(target)["name"], target["name"])
            self.assertEqual(self.doc(target)["role"], target["role"])
            self.assertTrue(self.doc(target)["is_active"])
        self.assertEqual(self.audit.documents, [])

    def test_bulk_send_skips_non_teachers(self) -> None:
        response = self.client.post(
            "/dean/teachers/send-credentials",
            json={"user_ids": [str(self.other_dean["_id"]), str(self.superadmin["_id"]), str(self.dean["_id"])]},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sent_count"], 0)
        self.assertEqual(response.json()["skipped_count"], 3)
        self.assertEqual(self.sent_credentials, [])


class ListTests(DeanTeacherTestCase):
    def test_lists_only_teachers_without_credentials(self) -> None:
        response = self.client.get("/dean/teachers", headers=self.auth(self.dean))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total"], 3)
        self.assertEqual({t["role"] for t in data["teachers"]}, {"teacher"})
        for teacher in data["teachers"]:
            for private in ("password_hash", "reset_token_hash", "token_version", "verification_token_hash"):
                self.assertNotIn(private, teacher)
        self.assertEqual(data["counts"], {"all": 3, "active": 2, "inactive": 1, "pending": 2})

    def test_status_filter_and_search(self) -> None:
        headers = self.auth(self.dean)
        inactive = self.client.get("/dean/teachers?status=inactive", headers=headers).json()
        self.assertEqual([t["name"] for t in inactive["teachers"]], ["Inactive Ina"])

        found = self.client.get("/dean/teachers?q=meera", headers=headers).json()
        self.assertEqual([t["name"] for t in found["teachers"]], ["Meera Joshi"])
        self.assertEqual(found["counts"]["all"], 1)

    def test_pagination(self) -> None:
        data = self.client.get("/dean/teachers?skip=1&limit=1", headers=self.auth(self.dean)).json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["total"], 3)
        self.assertTrue(data["has_more"])


class EditTests(DeanTeacherTestCase):
    def test_edit_permitted_fields_and_audit(self) -> None:
        response = self.client.patch(
            f"/dean/teachers/{self.teacher['_id']}",
            json={"name": "  Meera   J ", "phone": "+91 98765 00000", "department": None},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.status_code, 200, response.text)
        stored = self.doc(self.teacher)
        self.assertEqual(stored["name"], "Meera J")
        self.assertEqual(stored["phone"], "9876500000")
        self.assertIsNone(stored["department"])
        self.assertEqual(stored["role"], "teacher")
        log = self.audit.documents[-1]
        self.assertEqual(log["action"], "user_profile_updated")
        self.assertEqual(log["details"]["via"], "dean_panel")
        self.assertEqual(log["details"]["changed"]["name"], {"from": "Meera Joshi", "to": "Meera J"})

    def test_role_and_protected_fields_are_ignored(self) -> None:
        response = self.client.patch(
            f"/dean/teachers/{self.teacher['_id']}",
            json={"role": "superadmin", "is_active": False, "password_hash": "x", "token_version": 99},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.status_code, 200)
        stored = self.doc(self.teacher)
        self.assertEqual(stored["role"], "teacher")
        self.assertTrue(stored["is_active"])
        self.assertEqual(stored["token_version"], 0)

    def test_email_change_checks_uniqueness_and_drops_old_links(self) -> None:
        headers = self.auth(self.dean)
        taken = self.client.patch(
            f"/dean/teachers/{self.teacher['_id']}",
            json={"email": self.other_dean["email"].upper()},
            headers=headers,
        )
        self.assertEqual(taken.status_code, 409)

        self.users.get(self.teacher["_id"])["reset_token_hash"] = "old"
        ok = self.client.patch(
            f"/dean/teachers/{self.teacher['_id']}",
            json={"email": "New.Address@srhu.edu.in"},
            headers=headers,
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.doc(self.teacher)["email"], "new.address@srhu.edu.in")
        self.assertIsNone(self.doc(self.teacher)["reset_token_hash"])

    def test_invalid_input_is_rejected(self) -> None:
        headers = self.auth(self.dean)
        for body in ({"phone": "12ab"}, {"name": "   "}, {"name": None}, {"email": "not-an-email"}):
            response = self.client.patch(f"/dean/teachers/{self.teacher['_id']}", json=body, headers=headers)
            self.assertEqual(response.status_code, 422, body)


class ActivationTests(DeanTeacherTestCase):
    def test_deactivate_ends_sessions_and_blocks_login(self) -> None:
        teacher_headers = self.auth(self.teacher)
        self.assertEqual(self.client.get("/users/me", headers=teacher_headers).status_code, 200)

        response = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/deactivate", headers=self.auth(self.dean)
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["teacher"]["is_active"])
        self.assertIs(self.doc(self.teacher)["is_active"], False)
        self.assertEqual(self.doc(self.teacher)["token_version"], 1)

        # The old token no longer works, and neither would a fresh one.
        self.assertIn(self.client.get("/users/me", headers=teacher_headers).status_code, (401, 403))
        self.assertEqual(self.client.get("/users/me", headers=self.auth(self.teacher)).status_code, 403)
        self.assertEqual(self.audit.actions(), ["user_deactivated"])

        again = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/deactivate", headers=self.auth(self.dean)
        )
        self.assertEqual(again.status_code, 409)

    def test_activate(self) -> None:
        response = self.client.post(
            f"/dean/teachers/{self.inactive_teacher['_id']}/activate", headers=self.auth(self.dean)
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.doc(self.inactive_teacher)["is_active"])
        self.assertEqual(self.audit.actions(), ["user_activated"])


class DeleteTests(DeanTeacherTestCase):
    def test_delete_teacher(self) -> None:
        response = self.client.delete(f"/dean/teachers/{self.teacher['_id']}", headers=self.auth(self.dean))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.doc(self.teacher))
        log = self.audit.documents[-1]
        self.assertEqual(log["action"], "user_deleted")
        self.assertEqual(log["target_id"], str(self.teacher["_id"]))
        self.assertEqual(log["actor_id"], str(self.dean["_id"]))

    def test_unknown_id(self) -> None:
        for bad in (str(ObjectId()), "not-an-id"):
            response = self.client.delete(f"/dean/teachers/{bad}", headers=self.auth(self.dean))
            self.assertEqual(response.status_code, 404)


class PromoteTests(DeanTeacherTestCase):
    def test_promote_changes_role_and_ends_sessions(self) -> None:
        teacher_headers = self.auth(self.teacher)
        response = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/promote", headers=self.auth(self.dean)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["teacher"]["role"], "dean")
        self.assertEqual(self.doc(self.teacher)["role"], "dean")
        self.assertEqual(self.client.get("/users/me", headers=teacher_headers).status_code, 401)

        log = self.audit.documents[-1]
        self.assertEqual(log["action"], "role_change")
        self.assertEqual((log["details"]["old_role"], log["details"]["new_role"]), ("teacher", "dean"))

        # Now a Dean, they are outside a Dean's remit.
        again = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/promote", headers=self.auth(self.dean)
        )
        self.assertEqual(again.status_code, 404)

    def test_inactive_teacher_is_not_promoted(self) -> None:
        response = self.client.post(
            f"/dean/teachers/{self.inactive_teacher['_id']}/promote", headers=self.auth(self.dean)
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.doc(self.inactive_teacher)["role"], "teacher")


class PasswordResetTests(DeanTeacherTestCase):
    def test_sends_one_time_link_and_keeps_password(self) -> None:
        before = self.doc(self.teacher)["password_hash"]
        response = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/reset-password", headers=self.auth(self.dean)
        )
        self.assertEqual(response.status_code, 200)
        body = response.text
        stored = self.doc(self.teacher)
        self.assertEqual(stored["password_hash"], before)
        self.assertIsNotNone(stored["reset_token_hash"])
        self.assertEqual(len(self.sent_resets), 1)

        token = self.sent_resets[0][1]
        self.assertNotIn(token, body)
        self.assertNotIn("password\"", body)
        self.assertNotIn(token, str(self.audit.documents))
        self.assertNotIn(stored["reset_token_hash"], str(self.audit.documents))
        self.assertEqual(self.audit.actions(), ["password_reset_link_sent"])

        # And the link actually works through the standard reset flow.
        done = self.client.post("/auth/reset-password", json={"token": token, "new_password": "BrandNew#123"})
        self.assertEqual(done.status_code, 200, done.text)

    def test_failed_delivery_withdraws_link(self) -> None:
        with patch.object(email_service, "send_password_reset_email",
                          side_effect=email_service.EmailDeliveryError("down")):
            response = self.client.post(
                f"/dean/teachers/{self.teacher['_id']}/reset-password", headers=self.auth(self.dean)
            )
        self.assertEqual(response.status_code, 502)
        self.assertIsNone(self.doc(self.teacher)["reset_token_hash"])
        self.assertEqual(self.audit.documents[-1]["details"]["result"], "failed")

    def test_email_not_configured(self) -> None:
        with patch.object(email_service, "is_configured", return_value=False):
            response = self.client.post(
                f"/dean/teachers/{self.teacher['_id']}/reset-password", headers=self.auth(self.dean)
            )
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(self.doc(self.teacher)["reset_token_hash"])


class CredentialTests(DeanTeacherTestCase):
    def test_single_send_emails_and_never_returns_password(self) -> None:
        response = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/send-credentials", headers=self.auth(self.dean)
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(self.sent_credentials), 1)
        email, password = self.sent_credentials[0]
        self.assertEqual(email, self.teacher["email"])
        self.assertNotIn(password, response.text)
        self.assertNotIn(password, str(self.audit.documents))

        stored = self.doc(self.teacher)
        self.assertTrue(verify_password(password, stored["password_hash"]))
        self.assertTrue(stored["must_change_password"])
        self.assertEqual(stored["token_version"], 1)
        self.assertEqual(self.audit.actions(), ["teacher_credentials_sent"])

        # Sending again straight away is a duplicate, and is refused.
        again = self.client.post(
            f"/dean/teachers/{self.teacher['_id']}/send-credentials", headers=self.auth(self.dean)
        )
        self.assertEqual(again.status_code, 409)
        self.assertEqual(len(self.sent_credentials), 1)

    def test_failed_email_leaves_password_untouched(self) -> None:
        before = self.doc(self.teacher)["password_hash"]
        with patch.object(email_service, "send_teacher_credentials_email",
                          side_effect=email_service.EmailDeliveryError("down")):
            response = self.client.post(
                f"/dean/teachers/{self.teacher['_id']}/send-credentials", headers=self.auth(self.dean)
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(self.doc(self.teacher)["password_hash"], before)
        self.assertEqual(self.doc(self.teacher)["token_version"], 0)
        self.assertEqual(self.audit.documents[-1]["details"]["result"], "failed")

    def test_email_not_configured_changes_nothing(self) -> None:
        with patch.object(email_service, "is_configured", return_value=False):
            response = self.client.post(
                "/dean/teachers/send-credentials",
                json={"user_ids": [str(self.teacher["_id"])]},
                headers=self.auth(self.dean),
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.doc(self.teacher)["token_version"], 0)

    def test_bulk_reports_sent_skipped_and_failed(self) -> None:
        extra = _user("teacher", name="Fails Mail", email="fails@srhu.edu.in")
        self.users.documents.append(copy.deepcopy(extra))

        def send(to, name, pw):
            if to == "fails@srhu.edu.in":
                raise email_service.EmailDeliveryError("mailbox unavailable")
            self.sent_credentials.append((to, pw))

        ids = [
            str(self.teacher["_id"]),
            str(self.teacher["_id"]).upper(),  # duplicate, counted once
            str(self.signed_in_teacher["_id"]),  # has their own password
            str(self.inactive_teacher["_id"]),  # deactivated
            str(extra["_id"]),  # email fails
            str(ObjectId()),  # unknown
        ]
        with patch.object(email_service, "send_teacher_credentials_email", side_effect=send):
            response = self.client.post(
                "/dean/teachers/send-credentials", json={"user_ids": ids}, headers=self.auth(self.dean)
            )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(
            (data["requested_count"], data["sent_count"], data["skipped_count"], data["failed_count"]),
            (5, 1, 3, 1),
        )
        by_status = {r["user_id"]: r for r in data["results"]}
        self.assertEqual(by_status[str(self.teacher["_id"])]["status"], "sent")
        self.assertIn("Reset Password", by_status[str(self.signed_in_teacher["_id"])]["reason"])
        self.assertEqual(by_status[str(extra["_id"])]["status"], "failed")

        for _to, password in self.sent_credentials:
            self.assertNotIn(password, response.text)
            self.assertNotIn(password, str(self.audit.documents))

        log = self.audit.documents[-1]
        self.assertEqual(log["action"], "teachers_credentials_sent")
        self.assertEqual(log["details"]["result"], "partial")
        self.assertEqual(self.doc(self.signed_in_teacher)["token_version"], 0)
        self.assertEqual(self.doc(extra)["token_version"], 0)

    def test_bulk_size_is_capped(self) -> None:
        response = self.client.post(
            "/dean/teachers/send-credentials",
            json={"user_ids": [str(ObjectId()) for _ in range(26)]},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.status_code, 422)


class ActivityTests(DeanTeacherTestCase):
    def test_lists_dean_panel_actions(self) -> None:
        self.client.post(f"/dean/teachers/{self.teacher['_id']}/deactivate", headers=self.auth(self.dean))
        self.audit.insert_one({"action": "dean_created", "details": {}})
        data = self.client.get("/dean/teachers/activity", headers=self.auth(self.dean)).json()
        self.assertEqual([log["action"] for log in data["logs"]], ["user_deactivated"])


if __name__ == "__main__":
    unittest.main()
