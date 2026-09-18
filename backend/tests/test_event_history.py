from __future__ import annotations

import copy
import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


TEACHER = {"id": "teacher-1", "name": "Meera Joshi", "email": "meera@srhu.edu.in", "role": "teacher"}
DEAN = {"id": "dean-1", "name": "Aparna Sharma", "email": "dean@srhu.edu.in", "role": "dean"}

# The bearer token picks the signed-in user, so one client can play both roles.
TOKENS = {"Bearer teacher": TEACHER, "Bearer dean": DEAN}


class FakeEvents:
    """The slice of a pymongo collection the events router uses.

    Supports `$set` and `$push` on `find_one_and_update`, which is exactly what
    the audit trail depends on: the status change and its history entry arrive
    in one update.
    """

    def __init__(self) -> None:
        self.docs: dict[ObjectId, dict] = {}

    def insert_one(self, document: dict):
        _id = ObjectId()
        document["_id"] = _id
        self.docs[_id] = copy.deepcopy(document)
        return MagicMock(inserted_id=_id)

    def find_one(self, query: dict, *_args, **_kwargs):
        doc = self.docs.get(query.get("_id"))
        return copy.deepcopy(doc) if doc else None

    def find_one_and_update(self, query: dict, update: dict, **_kwargs):
        doc = self.docs.get(query.get("_id"))
        if doc is None:
            return None
        doc.update(update.get("$set", {}))
        for field, value in update.get("$push", {}).items():
            doc.setdefault(field, []).append(value)
        return copy.deepcopy(doc)


def fake_current_user(authorization):
    return TOKENS[authorization]


EVENT_PAYLOAD = {
    "event_name": "Himalayan Innovation Summit",
    "event_date": "2026-10-04",
    "event_type": "Seminar",
    "location": "Main Auditorium",
    "description": "Two days of talks.",
}


class EventHistoryTests(unittest.TestCase):
    """Every status transition leaves an entry the teacher can read back.

    Walks the exact path a teacher and Dean take through review — submit,
    reject with a reason, resubmit, approve — against an in-memory events
    collection, so no database or mail server is needed.
    """

    def setUp(self) -> None:
        self.client = TestClient(app)
        self.events = FakeEvents()

        self.patches = [
            patch("app.routers.events.events", self.events),
            patch("app.routers.events.notifications", MagicMock()),
            patch("app.routers.events.get_current_user", fake_current_user),
            patch("app.routers.events.email_service.is_configured", return_value=False),
            # The teacher GET also lists media and documents; none here.
            patch("app.routers.events.list_media", return_value=[]),
            patch("app.routers.events.list_documents", return_value=[]),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self) -> None:
        for item in reversed(self.patches):
            item.stop()

    def as_teacher(self):
        return {"Authorization": "Bearer teacher"}

    def as_dean(self):
        return {"Authorization": "Bearer dean"}

    def history_of(self, event_id: str) -> list[dict]:
        response = self.client.get(f"/teacher/events/{event_id}", headers=self.as_teacher())
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["event"]["history"]

    def test_full_review_cycle_is_recorded_in_order(self) -> None:
        created = self.client.post("/teacher/events", json=EVENT_PAYLOAD, headers=self.as_teacher())
        self.assertEqual(created.status_code, 201, created.text)
        event_id = created.json()["event"]["id"]

        rejected = self.client.patch(
            f"/dean/events/{event_id}/reject",
            params={"rejection_reason": "  Venue is booked that week.  "},
            headers=self.as_dean(),
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)

        resubmitted = self.client.patch(
            f"/teacher/events/{event_id}", json=EVENT_PAYLOAD, headers=self.as_teacher()
        )
        self.assertEqual(resubmitted.status_code, 200, resubmitted.text)

        approved = self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())
        self.assertEqual(approved.status_code, 200, approved.text)

        history = self.history_of(event_id)

        self.assertEqual(
            [entry["action"] for entry in history],
            ["submitted", "rejected", "resubmitted", "approved"],
        )
        self.assertEqual(
            [entry["status"] for entry in history],
            ["pending", "rejected", "pending", "approved"],
        )
        self.assertEqual(
            [entry["actor_role"] for entry in history],
            ["teacher", "dean", "teacher", "dean"],
        )

        # The Dean's reason survives the later approval, trimmed, with who gave it.
        self.assertEqual(history[1]["note"], "Venue is booked that week.")
        self.assertEqual(history[1]["actor_name"], "Aparna Sharma")
        self.assertEqual(history[1]["from_status"], "pending")

        # ...even though the event's current reason has been cleared.
        event = self.client.get(f"/teacher/events/{event_id}", headers=self.as_teacher()).json()["event"]
        self.assertIsNone(event["rejection_reason"])
        self.assertEqual(event["status"], "approved")

        for entry in history:
            self.assertTrue(entry["created_at"])

    def test_request_changes_records_the_remarks(self) -> None:
        event_id = self.client.post(
            "/teacher/events", json=EVENT_PAYLOAD, headers=self.as_teacher()
        ).json()["event"]["id"]

        response = self.client.patch(
            f"/dean/events/{event_id}/request-changes",
            params={"remarks": "Add a budget estimate."},
            headers=self.as_dean(),
        )
        self.assertEqual(response.status_code, 200, response.text)

        last = self.history_of(event_id)[-1]
        self.assertEqual(last["action"], "changes_requested")
        self.assertEqual(last["status"], "rejected")
        self.assertEqual(last["note"], "Add a budget estimate.")

    def test_draft_saves_stay_out_of_the_trail_until_submitted(self) -> None:
        draft = {**EVENT_PAYLOAD, "save_as_draft": True}
        event_id = self.client.post(
            "/teacher/events", json=draft, headers=self.as_teacher()
        ).json()["event"]["id"]

        # The wizard autosaves; none of these are steps worth showing.
        for _ in range(3):
            response = self.client.patch(
                f"/teacher/events/{event_id}", json=draft, headers=self.as_teacher()
            )
            self.assertEqual(response.status_code, 200, response.text)

        self.client.patch(f"/teacher/events/{event_id}", json=EVENT_PAYLOAD, headers=self.as_teacher())

        self.assertEqual(
            [entry["action"] for entry in self.history_of(event_id)],
            ["created", "submitted"],
        )

    def test_delivery_stages_are_recorded(self) -> None:
        event_id = self.client.post(
            "/teacher/events", json=EVENT_PAYLOAD, headers=self.as_teacher()
        ).json()["event"]["id"]
        self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())

        for stage in ("in_progress", "completed"):
            response = self.client.patch(
                f"/dean/events/{event_id}/stage", params={"stage": stage}, headers=self.as_dean()
            )
            self.assertEqual(response.status_code, 200, response.text)

        tail = self.history_of(event_id)[-2:]
        self.assertEqual([entry["action"] for entry in tail], ["stage_changed", "stage_changed"])
        self.assertEqual([entry["status"] for entry in tail], ["in_progress", "completed"])
        self.assertEqual(tail[0]["from_status"], "approved")


if __name__ == "__main__":
    unittest.main()
