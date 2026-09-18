from __future__ import annotations

import copy
import os
import re
import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch

from bson import ObjectId

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.schemas.events import campus_now  # noqa: E402


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




TEACHER = {"id": "teacher-1", "name": "Meera Joshi", "email": "meera@srhu.edu.in", "role": "teacher"}
DEAN = {"id": "dean-1", "name": "Aparna Sharma", "email": "dean@srhu.edu.in", "role": "dean"}

# The bearer token picks the signed-in user, so one client can play both roles.
TOKENS = {"Bearer teacher": TEACHER, "Bearer dean": DEAN}


class FakeEventCursor(list):
    """The cursor surface paginate() uses: sort, then skip/limit."""

    def sort(self, key, direction):
        return FakeEventCursor(
            sorted(self, key=lambda d: d.get(key) or "", reverse=direction == -1)
        )

    def skip(self, count):
        return FakeEventCursor(self[count:]) if count else self

    def limit(self, count):
        return FakeEventCursor(self[:count]) if count else self


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

    @staticmethod
    def _matches(doc: dict, query: dict) -> bool:
        """Equality, `$in`, `$ne` and `$exists`.

        `$ne` matters for the Dean list (which excludes drafts) and the archive
        axis; MongoDB treats a missing key and an explicit None as equal, so
        `doc.get(key)` reproducing that is deliberate, not sloppy.
        """
        for key, expected in query.items():
            if key == "$or":
                if not any(FakeEvents._matches(doc, clause) for clause in expected):
                    return False
                continue

            value = doc.get(key)
            if isinstance(expected, dict):
                if "$in" in expected and value not in expected["$in"]:
                    return False
                if "$ne" in expected and value == expected["$ne"]:
                    return False
                if "$exists" in expected and (key in doc) != expected["$exists"]:
                    return False
                if "$nin" in expected and value in expected["$nin"]:
                    return False
                if "$regex" in expected:
                    flags = re.I if "i" in expected.get("$options", "") else 0
                    if not isinstance(value, str) or not re.search(
                        expected["$regex"], value, flags
                    ):
                        return False
            elif value != expected:
                return False
        return True

    def count_documents(self, query: dict) -> int:
        return sum(1 for doc in self.docs.values() if self._matches(doc, query))

    def find(self, query: dict, *_args, **_kwargs):
        return FakeEventCursor(
            copy.deepcopy(doc)
            for doc in self.docs.values()
            if self._matches(doc, query)
        )

    def _find(self, query: dict) -> dict | None:
        doc = self.docs.get(query.get("_id"))
        return doc if doc is not None and self._matches(doc, query) else None

    def find_one(self, query: dict, *_args, **_kwargs):
        doc = self._find(query)
        return copy.deepcopy(doc) if doc else None

    def find_one_and_update(self, query: dict, update: dict, **_kwargs):
        doc = self._find(query)
        if doc is None:
            return None
        doc.update(update.get("$set", {}))
        for field, value in update.get("$push", {}).items():
            doc.setdefault(field, []).append(value)
        return copy.deepcopy(doc)

    def delete_one(self, query: dict):
        doc = self._find(query)
        if doc is None:
            return MagicMock(deleted_count=0)
        del self.docs[doc["_id"]]
        return MagicMock(deleted_count=1)

    def set_status(self, event_id: str, status: str) -> None:
        self.docs[ObjectId(event_id)]["status"] = status


class NoUsers:
    """No Dean accounts: keeps notify_deans off the real database."""

    def find(self, *_args, **_kwargs):
        return []

    def find_one(self, *_args, **_kwargs):
        return None


def fake_current_user(authorization):
    return TOKENS[authorization]


def future_date(days: int = 30) -> str:
    """A date safely in the future, in the campus timezone the schema uses.

    Hardcoding one would turn every create-event test into a time bomb the day
    it passed, now that the schema rejects past dates (PRD 3).
    """
    return (campus_now() + timedelta(days=days)).strftime("%Y-%m-%d")


EVENT_PAYLOAD = {
    "event_name": "Himalayan Innovation Summit",
    "event_date": future_date(),
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
            patch("app.routers.events.users", NoUsers()),
            patch("app.routers.events.event_reports", MagicMock()),
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


class DeanTransitionTests(EventHistoryTests):
    """B-4 / B-13 / B-27: decisions only from pending, and every write is
    filtered on the status that was checked."""

    # Don't re-run the parent's tests under this class.
    test_full_review_cycle_is_recorded_in_order = None
    test_request_changes_records_the_remarks = None
    test_draft_saves_stay_out_of_the_trail_until_submitted = None
    test_delivery_stages_are_recorded = None

    def submit(self, **extra) -> str:
        response = self.client.post(
            "/teacher/events", json={**EVENT_PAYLOAD, **extra}, headers=self.as_teacher()
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["event"]["id"]

    def test_approve_twice_is_409_and_records_one_entry(self) -> None:
        event_id = self.submit()
        first = self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())
        self.assertEqual(first.status_code, 200, first.text)

        second = self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["detail"], "This event is already approved.")
        self.assertEqual(
            [entry["action"] for entry in self.history_of(event_id)], ["submitted", "approved"]
        )

    def test_completed_event_cannot_be_rejected_or_sent_back(self) -> None:
        event_id = self.submit()
        self.events.set_status(event_id, "completed")

        rejected = self.client.patch(
            f"/dean/events/{event_id}/reject",
            json={"rejection_reason": "Too late"},
            headers=self.as_dean(),
        )
        self.assertEqual(rejected.status_code, 409)
        self.assertEqual(rejected.json()["detail"], "Only pending events can be rejected.")

        changes = self.client.patch(
            f"/dean/events/{event_id}/request-changes",
            params={"remarks": "More"},
            headers=self.as_dean(),
        )
        self.assertEqual(changes.status_code, 409)

        approved = self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())
        self.assertEqual(approved.status_code, 409)
        self.assertEqual(self.events.docs[ObjectId(event_id)]["status"], "completed")

    def test_rejected_event_cannot_be_approved_until_resubmitted(self) -> None:
        event_id = self.submit()
        self.client.patch(
            f"/dean/events/{event_id}/reject", params={"rejection_reason": "No"}, headers=self.as_dean()
        )
        response = self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "Only pending events can be approved.")

    def test_drafts_are_invisible_to_dean_decisions(self) -> None:
        event_id = self.submit(save_as_draft=True)
        response = self.client.patch(f"/dean/events/{event_id}/approve", headers=self.as_dean())
        self.assertEqual(response.status_code, 404)

    def test_reject_accepts_a_json_body(self) -> None:
        event_id = self.submit()
        response = self.client.patch(
            f"/dean/events/{event_id}/reject",
            json={"rejection_reason": "  Venue clash.  "},
            headers=self.as_dean(),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["event"]["rejection_reason"], "Venue clash.")
        self.assertEqual(self.history_of(event_id)[-1]["note"], "Venue clash.")

    def test_request_changes_accepts_a_json_body(self) -> None:
        event_id = self.submit()
        response = self.client.patch(
            f"/dean/events/{event_id}/request-changes",
            json={"remarks": "Add a budget."},
            headers=self.as_dean(),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.history_of(event_id)[-1]["action"], "changes_requested")

    def test_empty_reason_is_still_400(self) -> None:
        event_id = self.submit()
        for kwargs in ({"params": {"rejection_reason": "   "}}, {"json": {"rejection_reason": ""}}, {}):
            with self.subTest(kwargs=kwargs):
                response = self.client.patch(
                    f"/dean/events/{event_id}/reject", headers=self.as_dean(), **kwargs
                )
                self.assertEqual(response.status_code, 400)

    def test_teacher_edit_racing_an_approval_is_409(self) -> None:
        event_id = self.submit()

        from app.routers import events as events_router

        real_find = events_router.find_teacher_event_or_404
        calls = {"n": 0}

        def stale_read(event_id_arg, teacher_id):
            event = real_find(event_id_arg, teacher_id)
            calls["n"] += 1
            if calls["n"] == 1:
                # The Dean approves between the teacher's read and write.
                self.events.set_status(event_id, "approved")
            return event

        with patch("app.routers.events.find_teacher_event_or_404", stale_read):
            response = self.client.patch(
                f"/teacher/events/{event_id}",
                json={**EVENT_PAYLOAD, "event_name": "Changed"},
                headers=self.as_teacher(),
            )

        self.assertEqual(response.status_code, 409, response.text)
        stored = self.events.docs[ObjectId(event_id)]
        self.assertEqual(stored["status"], "approved")
        self.assertEqual(stored["event_name"], EVENT_PAYLOAD["event_name"])

    def test_resubmit_is_only_for_events_out_of_the_queue(self) -> None:
        event_id = self.submit()
        pending = self.client.patch(f"/teacher/events/{event_id}/resubmit", headers=self.as_teacher())
        self.assertEqual(pending.status_code, 409)

        self.client.patch(
            f"/dean/events/{event_id}/reject", params={"rejection_reason": "No"}, headers=self.as_dean()
        )
        resubmitted = self.client.patch(f"/teacher/events/{event_id}/resubmit", headers=self.as_teacher())
        self.assertEqual(resubmitted.status_code, 200, resubmitted.text)
        self.assertEqual(resubmitted.json()["event"]["status"], "pending")

    def test_teacher_social_link_uses_the_dean_rules(self) -> None:
        bad = self.client.post(
            "/teacher/events",
            json={**EVENT_PAYLOAD, "social_network_url": "javascript:alert(1)"},
            headers=self.as_teacher(),
        )
        self.assertEqual(bad.status_code, 422)

        good = self.client.post(
            "/teacher/events",
            json={**EVENT_PAYLOAD, "social_network_url": "www.instagram.com/p/abc"},
            headers=self.as_teacher(),
        )
        self.assertEqual(good.status_code, 201, good.text)
        self.assertEqual(good.json()["event"]["social_network_url"], "https://www.instagram.com/p/abc")


if __name__ == "__main__":
    unittest.main()


class RevokeTests(DeanTransitionTests):
    """PRD 18: revoke is its own action over its own status set.

    The old UI offered "Revoke & Reject" on an approved event, which called
    /reject -- and rejection only accepts a *pending* event, so the request
    came back 409. Revoking was unreachable, not just ambiguous.
    """

    test_approve_twice_is_409_and_records_one_entry = None
    test_completed_event_cannot_be_rejected_or_sent_back = None

    def approve(self) -> str:
        event_id = self.submit()
        response = self.client.patch(
            f"/dean/events/{event_id}/approve", headers=self.as_dean()
        )
        self.assertEqual(response.status_code, 200, response.text)
        return event_id

    def revoke(self, event_id, reason="Venue withdrew"):
        return self.client.patch(
            f"/dean/events/{event_id}/revoke",
            json={"revocation_reason": reason},
            headers=self.as_dean(),
        )

    def test_approved_event_can_be_revoked(self) -> None:
        event_id = self.approve()

        response = self.revoke(event_id)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["event"]["status"], "revoked")
        self.assertEqual(
            response.json()["event"]["revocation_reason"], "Venue withdrew"
        )

    def test_rejecting_an_approved_event_is_still_refused(self) -> None:
        # The old broken path stays closed: reject means "never approved".
        event_id = self.approve()

        response = self.client.patch(
            f"/dean/events/{event_id}/reject",
            json={"rejection_reason": "nope"},
            headers=self.as_dean(),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "Only pending events can be rejected.")

    def test_pending_event_cannot_be_revoked(self) -> None:
        response = self.revoke(self.submit())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Only an approved event can have its approval revoked.",
        )

    def test_revoking_twice_is_409(self) -> None:
        event_id = self.approve()
        self.assertEqual(self.revoke(event_id).status_code, 200)

        second = self.revoke(event_id)

        self.assertEqual(second.status_code, 409)
        self.assertEqual(
            second.json()["detail"], "This event's approval has already been revoked."
        )

    def test_reason_is_required(self) -> None:
        event_id = self.approve()

        response = self.client.patch(
            f"/dean/events/{event_id}/revoke",
            json={"revocation_reason": "   "},
            headers=self.as_dean(),
        )

        self.assertEqual(response.status_code, 400)

    def test_revoked_event_can_be_resubmitted_by_the_teacher(self) -> None:
        # Otherwise revoking would strand the event with nobody able to act.
        event_id = self.approve()
        self.revoke(event_id)

        response = self.client.patch(
            f"/teacher/events/{event_id}/resubmit", headers=self.as_teacher()
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["event"]["status"], "pending")

    def test_history_records_the_whole_arc(self) -> None:
        event_id = self.approve()
        self.revoke(event_id)
        self.client.patch(f"/teacher/events/{event_id}/resubmit", headers=self.as_teacher())

        self.assertEqual(
            [entry["action"] for entry in self.history_of(event_id)],
            ["submitted", "approved", "revoked", "resubmitted"],
        )

    def test_revocation_reason_is_separate_from_rejection_reason(self) -> None:
        # Merging the two fields is how the actions became indistinguishable.
        event_id = self.approve()
        event = self.revoke(event_id).json()["event"]

        self.assertEqual(event["revocation_reason"], "Venue withdrew")
        self.assertIsNone(event["rejection_reason"])
