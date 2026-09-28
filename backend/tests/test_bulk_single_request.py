"""Bulk operations handle the whole selection in one request, with batched queries."""

from __future__ import annotations

import copy
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.services import storage_service
from tests.test_dean_event_admin import EventAdminTests
from tests.test_dean_teacher_management import DeanTeacherTestCase, _user


class EventBulkTests(EventAdminTests):
    def test_ids_endpoint_matches_the_list_filters(self) -> None:
        a = self.create_pending_event(event_name="Robotics Workshop")
        b = self.create_pending_event(event_name="Music Night")
        self.create_draft(event_name="Robotics draft")  # never visible to a Dean
        everyone = self.client.get("/dean/events/ids", headers=self.as_dean()).json()
        self.assertEqual(sorted(e["id"] for e in everyone["events"]), sorted([a, b]))
        # Search also looks teachers up by name; this harness has no users.
        no_teachers = MagicMock()
        no_teachers.find.return_value.limit.return_value = []
        with patch("app.routers.events.users", no_teachers):
            robotics = self.client.get("/dean/events/ids?q=robotics", headers=self.as_dean()).json()
        self.assertEqual([e["id"] for e in robotics["events"]], [a])
        self.assertEqual(robotics["events"][0]["event_name"], "Robotics Workshop")
        self.assertEqual(self.client.get("/dean/events/ids", headers=self.as_teacher()).status_code, 403)

    def test_bulk_archive_in_one_request(self) -> None:
        pending = self.create_pending_event(event_name="Pending one")
        approved = self.create_pending_event(event_name="Approved one")
        self.client.patch(f"/dean/events/{approved}/approve", headers=self.as_dean())
        already = self.create_pending_event(event_name="Already archived")
        self.client.patch(f"/dean/events/{already}/archive", headers=self.as_dean())
        draft = self.create_draft()

        response = self.client.post(
            "/dean/events/bulk-archive",
            json={"event_ids": [pending, approved, already, draft, str(ObjectId())], "reason": "Term over"},
            headers=self.as_dean(),
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data["requested_count"], data["archived_count"], data["skipped_count"]), (5, 2, 3))
        for event_id, status in ((pending, "pending"), (approved, "approved")):
            doc = self.events.docs[ObjectId(event_id)]
            self.assertIsNotNone(doc["archived_at"])
            self.assertEqual(doc["status"], status)  # archiving never changes the status
            self.assertEqual(doc["archive_reason"], "Term over")
            last = doc["history"][-1]
            self.assertEqual((last["action"], last["status"]), ("archived", status))
        self.assertIsNone(self.events.docs[ObjectId(draft)].get("archived_at"))
        self.assertEqual(self.dean_list(), [])
        self.assertIn("events_bulk_archived", self.audit_actions())

        teacher = self.client.post("/dean/events/bulk-archive", json={"event_ids": [pending]},
                                   headers=self.as_teacher())
        self.assertEqual(teacher.status_code, 403)

    def test_bulk_delete_resolves_the_selection_in_one_query(self) -> None:
        ids = [self.create_pending_event(event_name=f"E{i}") for i in range(6)]
        with patch.object(self.events, "find_one", wraps=self.events.find_one) as find_one, \
             patch.object(self.events, "find", wraps=self.events.find) as find:
            response = self.client.post("/dean/events/bulk-delete", json={"event_ids": ids}, headers=self.as_dean())
        self.assertEqual(response.json()["deleted_count"], 6)
        self.assertEqual(find_one.call_count, 0)  # no per-event lookups
        self.assertEqual(find.call_count, 1)


class TeacherBulkTests(DeanTeacherTestCase):
    def test_ids_endpoint_matches_the_list_filters(self) -> None:
        data = self.client.get("/dean/teachers/ids?status=inactive", headers=self.auth(self.dean)).json()
        self.assertEqual([t["email"] for t in data["teachers"]], [self.inactive_teacher["email"]])
        everyone = self.client.get("/dean/teachers/ids", headers=self.auth(self.dean)).json()
        self.assertEqual(everyone["total"], 3)
        self.assertEqual(self.client.get("/dean/teachers/ids", headers=self.auth(self.teacher)).status_code, 403)

    def test_thirty_invitations_in_one_request(self) -> None:
        extra = [_user("teacher", name=f"New {i}", email=f"new{i}@srhu.edu.in") for i in range(30)]
        self.users.documents.extend(copy.deepcopy(t) for t in extra)
        with patch.object(self.users, "find_one", wraps=self.users.find_one) as find_one:
            response = self.client.post(
                "/dean/teachers/invite",
                json={"user_ids": [str(t["_id"]) for t in extra]},
                headers=self.auth(self.dean),
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["sent_count"], 30)
        self.assertEqual(len(self.sent_invites), 30)
        # The single find_one is the Dean's own sign-in check; the 30
        # selected teachers are resolved in one find(), not one lookup each.
        self.assertEqual(find_one.call_count, 1)
        self.assertEqual(self.audit.actions(), ["teachers_invited"])

    def test_bulk_remove_uses_grouped_updates(self) -> None:
        with patch.object(self.users, "update_one", wraps=self.users.update_one) as update_one:
            response = self.client.post(
                "/dean/teachers/bulk-remove",
                json={"user_ids": [str(t["_id"]) for t in (self.teacher, self.signed_in_teacher, self.inactive_teacher)]},
                headers=self.auth(self.dean),
            )
        self.assertEqual(response.json()["done_count"], 3)
        self.assertEqual(update_one.call_count, 0)
        self.assertIs(self.doc(self.inactive_teacher)["removed_was_active"], False)
        self.assertIs(self.doc(self.teacher)["removed_was_active"], True)


class CascadeBatchTests(unittest.TestCase):
    def test_events_cascade_is_one_query_per_collection(self) -> None:
        ids = [str(ObjectId()) for _ in range(3)]
        cols = {name: MagicMock() for name in ("events", "event_media", "event_documents", "notifications", "event_reports")}
        cols["event_media"].find.return_value = [{"object_key": "a"}, {"object_key": "b"}]
        cols["event_documents"].find.return_value = [{"object_key": "c"}]
        with patch.multiple(storage_service, **cols), patch.object(storage_service, "delete_stored") as stored:
            storage_service.delete_events_cascade(ids)
        self.assertEqual(stored.call_count, 3)  # every stored file still removed
        for name, col in cols.items():
            calls = col.delete_many.call_args_list
            self.assertEqual(len(calls), 1, name)
            (query,), _ = calls[0]
            self.assertIn("$in", next(iter(query.values())), name)

    def test_users_cascade_batches_too(self) -> None:
        ids = [str(ObjectId()) for _ in range(4)]
        cols = {name: MagicMock() for name in ("events", "users", "notifications")}
        cols["events"].find.return_value = []
        with patch.multiple(storage_service, **cols), \
             patch.object(storage_service, "delete_events_cascade") as events_cascade:
            storage_service.delete_users_cascade(ids)
        events_cascade.assert_not_called()  # none of them own events
        self.assertEqual(cols["users"].delete_many.call_count, 1)
        self.assertEqual(len(cols["users"].delete_many.call_args.args[0]["_id"]["$in"]), 4)
        self.assertEqual(cols["notifications"].delete_many.call_count, 1)


if __name__ == "__main__":
    unittest.main()
