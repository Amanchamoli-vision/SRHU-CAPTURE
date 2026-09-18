from __future__ import annotations

import copy
import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.test_event_history import EVENT_PAYLOAD, FakeEvents  # noqa: E402


# The event-types service binds its collection at import time, so a test that
# creates an event would otherwise reach for a real MongoDB.
_event_types_patcher = None


def setUpModule() -> None:
    global _event_types_patcher
    from unittest.mock import patch as _patch

    from tests.fake_event_types import FakeEventTypes

    _event_types_patcher = _patch(
        "app.services.event_types.event_types", FakeEventTypes()
    )
    _event_types_patcher.start()


def tearDownModule() -> None:
    if _event_types_patcher is not None:
        _event_types_patcher.stop()




TEACHER_ID = str(ObjectId())
DEAN_A_ID = str(ObjectId())
DEAN_B_ID = str(ObjectId())

TEACHER = {"id": TEACHER_ID, "name": "Meera Joshi", "email": "meera@srhu.edu.in", "role": "teacher"}
DEAN_A = {"id": DEAN_A_ID, "name": "Aparna Sharma", "email": "dean.a@srhu.edu.in", "role": "dean"}
DEAN_B = {"id": DEAN_B_ID, "name": "Rohan Negi", "email": "dean.b@srhu.edu.in", "role": "dean"}

TOKENS = {"Bearer teacher": TEACHER, "Bearer dean-a": DEAN_A, "Bearer dean-b": DEAN_B}


def fake_current_user(authorization):
    return TOKENS[authorization]


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(sorted(self, key=lambda d: d.get(key), reverse=direction == -1))

    def limit(self, count):
        return FakeCursor(self[:count]) if count else self

    def skip(self, count):
        return FakeCursor(self[count:])


class FakeNotifications:
    """In-memory notifications collection: insert, scoped find, mark read."""

    def __init__(self) -> None:
        self.docs: list[dict] = []

    def insert_one(self, document: dict):
        document["_id"] = ObjectId()
        self.docs.append(copy.deepcopy(document))
        return MagicMock(inserted_id=document["_id"])

    def _matches(self, doc: dict, query: dict) -> bool:
        for key, expected in query.items():
            value = doc.get(key)
            if isinstance(expected, dict):
                if "$in" in expected and value not in expected["$in"]:
                    return False
                if "$ne" in expected and value == expected["$ne"]:
                    return False
                if "$exists" in expected and (key in doc) != expected["$exists"]:
                    return False
            elif value != expected:
                return False
        return True

    def count_documents(self, query: dict) -> int:
        return sum(1 for doc in self.docs if self._matches(doc, query))

    def find(self, query: dict, *_args, **_kwargs):
        return FakeCursor(copy.deepcopy(d) for d in self.docs if self._matches(d, query))

    def update_many(self, query: dict, update: dict):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update["$set"])

    def update_one(self, query: dict, update: dict):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update["$set"])
                return MagicMock(matched_count=1)
        return MagicMock(matched_count=0)

    def for_user(self, user_id: str) -> list[dict]:
        return [d for d in self.docs if d["user_id"] == user_id]


class FakeUsers:
    def find(self, query: dict, *_args, **_kwargs):
        everyone = [
            {"_id": ObjectId(TEACHER_ID), "role": "teacher"},
            {"_id": ObjectId(DEAN_A_ID), "role": "dean"},
            {"_id": ObjectId(DEAN_B_ID), "role": "dean"},
        ]
        return [u for u in everyone if u["role"] == query.get("role")]

    def find_one(self, *_args, **_kwargs):
        return None  # only reached when SMTP is configured; it is not here


class NotificationRoutingTests(unittest.TestCase):
    """Each side of the review is told when the other side acts.

    Teacher actions reach every Dean; Dean decisions and delivery stages reach
    the owning teacher; and each user only ever reads and clears their own.
    """

    def setUp(self) -> None:
        self.client = TestClient(app)
        self.notifications = FakeNotifications()

        self.events = FakeEvents()
        self.patches = [
            patch("app.routers.events.events", self.events),
            patch("app.routers.events.event_reports", MagicMock()),
            patch("app.routers.events.notifications", self.notifications),
            patch("app.routers.events.users", FakeUsers()),
            patch("app.routers.events.get_current_user", fake_current_user),
            patch("app.routers.events.email_service.is_configured", return_value=False),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in reversed(self.patches):
            item.stop()

    def submit(self, draft: bool = False) -> str:
        payload = {**EVENT_PAYLOAD, "save_as_draft": draft}
        response = self.client.post(
            "/teacher/events", json=payload, headers={"Authorization": "Bearer teacher"}
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["event"]["id"]

    def types_for(self, user_id: str) -> list[str]:
        return [n["notification_type"] for n in self.notifications.for_user(user_id)]

    def test_a_submission_reaches_every_dean_and_not_the_teacher(self) -> None:
        event_id = self.submit()

        for dean_id in (DEAN_A_ID, DEAN_B_ID):
            [note] = self.notifications.for_user(dean_id)
            self.assertEqual(note["notification_type"], "submitted")
            self.assertEqual(note["event_id"], event_id)
            self.assertIn("Meera Joshi", note["message"])

        self.assertEqual(self.types_for(TEACHER_ID), [])

    def test_a_draft_stays_private_until_it_is_submitted(self) -> None:
        self.submit(draft=True)
        self.assertEqual(self.types_for(DEAN_A_ID), [])

    def test_reject_then_resubmit_notifies_both_sides(self) -> None:
        event_id = self.submit()

        self.client.patch(
            f"/dean/events/{event_id}/reject",
            params={"rejection_reason": "Add a budget."},
            headers={"Authorization": "Bearer dean-a"},
        )
        self.assertEqual(self.types_for(TEACHER_ID), ["rejected"])

        response = self.client.patch(
            f"/teacher/events/{event_id}", json=EVENT_PAYLOAD,
            headers={"Authorization": "Bearer teacher"},
        )
        self.assertEqual(response.status_code, 200, response.text)

        # The resubmission — same event id — is what the old browser-side
        # diff could never see.
        self.assertEqual(self.types_for(DEAN_B_ID), ["submitted", "resubmitted"])

    def test_delivery_stages_reach_the_teacher(self) -> None:
        event_id = self.submit()
        dean = {"Authorization": "Bearer dean-a"}
        self.client.patch(f"/dean/events/{event_id}/approve", headers=dean)
        self.client.patch(f"/dean/events/{event_id}/stage", params={"stage": "in_progress"}, headers=dean)
        self.client.patch(f"/dean/events/{event_id}/stage", params={"stage": "completed"}, headers=dean)
        # A repeat of the current stage is not news.
        self.client.patch(f"/dean/events/{event_id}/stage", params={"stage": "completed"}, headers=dean)

        notes = self.notifications.for_user(TEACHER_ID)
        self.assertEqual([n["notification_type"] for n in notes], ["approved", "progress", "progress"])
        self.assertEqual([n["data"].get("stage") for n in notes[1:]], ["in_progress", "completed"])

    def test_each_user_reads_and_clears_only_their_own(self) -> None:
        event_id = self.submit()
        self.client.patch(
            f"/dean/events/{event_id}/reject",
            params={"rejection_reason": "No."},
            headers={"Authorization": "Bearer dean-a"},
        )

        feed = self.client.get("/notifications", headers={"Authorization": "Bearer dean-a"}).json()
        self.assertEqual([n["notification_type"] for n in feed["notifications"]], ["submitted"])

        teacher_note_id = str(self.notifications.for_user(TEACHER_ID)[0]["_id"])
        stolen = self.client.patch(
            f"/notifications/{teacher_note_id}/read", headers={"Authorization": "Bearer dean-a"}
        )
        self.assertEqual(stolen.status_code, 404)

        self.client.patch("/notifications/read-all", headers={"Authorization": "Bearer dean-a"})
        self.assertTrue(all(n["is_read"] for n in self.notifications.for_user(DEAN_A_ID)))
        self.assertFalse(any(n["is_read"] for n in self.notifications.for_user(DEAN_B_ID)))
        self.assertFalse(self.notifications.for_user(TEACHER_ID)[0]["is_read"])


    def test_editing_a_pending_event_does_not_renotify_deans(self) -> None:
        event_id = self.submit()
        for _ in range(3):
            response = self.client.patch(
                f"/teacher/events/{event_id}", json=EVENT_PAYLOAD,
                headers={"Authorization": "Bearer teacher"},
            )
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.types_for(DEAN_A_ID), ["submitted"])

    def test_resubmitting_a_pending_event_is_refused(self) -> None:
        event_id = self.submit()
        response = self.client.patch(
            f"/teacher/events/{event_id}/resubmit", headers={"Authorization": "Bearer teacher"}
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.types_for(DEAN_A_ID), ["submitted"])

    def test_feed_is_limited(self) -> None:
        for index in range(5):
            self.client.post(
                "/notifications",
                json={"title": f"R{index}", "message": "m"},
                headers={"Authorization": "Bearer teacher"},
            )
        feed = self.client.get(
            "/notifications", params={"limit": 2}, headers={"Authorization": "Bearer teacher"}
        ).json()["notifications"]
        self.assertEqual(len(feed), 2)
        self.assertGreaterEqual(feed[0]["created_at"], feed[1]["created_at"])

        too_many = self.client.get(
            "/notifications", params={"limit": 501}, headers={"Authorization": "Bearer teacher"}
        )
        self.assertEqual(too_many.status_code, 422)


class ClientNotificationTests(NotificationRoutingTests):
    """B-31: what a client may create for itself."""

    test_a_submission_reaches_every_dean_and_not_the_teacher = None
    test_a_draft_stays_private_until_it_is_submitted = None
    test_reject_then_resubmit_notifies_both_sides = None
    test_delivery_stages_reach_the_teacher = None
    test_each_user_reads_and_clears_only_their_own = None
    test_editing_a_pending_event_does_not_renotify_deans = None
    test_resubmitting_a_pending_event_is_refused = None
    test_feed_is_limited = None

    def post(self, token="Bearer teacher", **body):
        payload = {"title": "Your event is tomorrow", "message": "Soon.", **body}
        return self.client.post("/notifications", json=payload, headers={"Authorization": token})

    def test_a_reminder_for_an_own_event_is_accepted(self) -> None:
        event_id = self.submit()
        response = self.post(event_id=event_id, data={"event_date": "2026-10-04", "when": "tomorrow"})
        self.assertEqual(response.status_code, 201, response.text)

    def test_only_reminders_may_be_created(self) -> None:
        for kind in ("approved", "submitted", "made_up"):
            with self.subTest(kind=kind):
                self.assertEqual(self.post(notification_type=kind).status_code, 422)

    def test_someone_elses_event_is_refused(self) -> None:
        event_id = self.submit()
        response = self.post(token="Bearer dean-a", event_id=event_id)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.post(event_id=str(ObjectId())).status_code, 400)
        self.assertEqual(self.post(event_id="not-an-id").status_code, 400)

    def test_data_is_capped(self) -> None:
        response = self.post(data={"blob": "x" * 5000})
        self.assertEqual(response.status_code, 422)


class StatusEmailTests(unittest.TestCase):
    def test_email_links_to_the_event_and_names_the_stage(self) -> None:
        from app.services import email_service

        with patch.object(email_service, "send_email") as send:
            email_service.send_event_status_email(
                "meera@srhu.edu.in", "Meera", "Summit", "progress",
                event_id="abc123", stage="completed",
            )

        _to, subject, text, html = send.call_args[0]
        self.assertEqual(subject, "Event completed: Summit")
        self.assertIn("/teacher/events/abc123", text)
        self.assertIn("View this event", html)


if __name__ == "__main__":
    unittest.main()
