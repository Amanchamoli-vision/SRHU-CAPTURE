"""Event ordering, the Dean's bulk delete and the superadmin's event delete."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

from tests.test_event_history import TOKENS, EventHistoryTests

SUPERADMIN = {"id": str(ObjectId()), "name": "Root", "email": "root@srhu.edu.in", "role": "superadmin"}


def any_user(authorization):
    if authorization == "Bearer superadmin":
        return SUPERADMIN
    return TOKENS[authorization]


class EventAdminTests(EventHistoryTests):
    def setUp(self) -> None:
        super().setUp()
        self.audit = MagicMock()
        self.cascade = MagicMock()
        self.bulk_cascade = MagicMock()
        for item in (
            patch("app.routers.events.delete_event_cascade", self.cascade),
            patch("app.routers.events.delete_events_cascade", self.bulk_cascade),
            patch("app.services.audit_service.audit_logs", self.audit),
            patch("app.utils.auth.get_current_user", any_user),
        ):
            item.start()
            self.patches.append(item)

    def submit(self, event_id: str) -> None:
        from tests.test_event_history import EVENT_PAYLOAD

        self.attach_evidence(event_id)
        response = self.client.patch(
            f"/teacher/events/{event_id}",
            json={**EVENT_PAYLOAD, "save_as_draft": False},
            headers=self.as_teacher(),
        )
        self.assertEqual(response.status_code, 200, response.text)

    def dean_list(self) -> list[str]:
        response = self.client.get("/dean/events", headers=self.as_dean())
        self.assertEqual(response.status_code, 200, response.text)
        return [e["id"] for e in response.json()["events"]]

    def audit_actions(self) -> list[str]:
        return [c.args[0]["action"] for c in self.audit.insert_one.call_args_list]

    # ------------------------------------------------------------ ordering
    def test_newest_submission_is_at_the_top(self) -> None:
        drafted_first = self.create_draft(event_name="Drafted first")
        drafted_second = self.create_draft(event_name="Drafted second")
        self.submit(drafted_second)
        self.submit(drafted_first)  # submitted last, though its draft is older
        self.assertEqual(self.dean_list()[:2], [drafted_first, drafted_second])

        newest = self.create_pending_event(event_name="Brand new")
        self.assertEqual(self.dean_list()[0], newest)

    # ------------------------------------------------------------ Dean bulk delete
    def test_dean_bulk_delete(self) -> None:
        a, b, keep = (self.create_pending_event(event_name=n) for n in ("A", "B", "Keep"))
        draft = self.create_draft(event_name="Teacher draft")
        response = self.client.post(
            "/dean/events/bulk-delete",
            json={"event_ids": [a, b, draft, str(ObjectId()), a]},
            headers=self.as_dean(),
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data["requested_count"], data["deleted_count"], data["not_found_count"]), (4, 2, 2))
        self.assertEqual(self.dean_list(), [keep])
        # The teacher's draft is invisible to the Dean, so it survives.
        self.assertIn(ObjectId(draft), self.events.docs)
        # One batched cascade for the whole selection, not one per event.
        self.assertEqual(self.bulk_cascade.call_count, 1)
        self.assertEqual(sorted(self.bulk_cascade.call_args.args[0]), sorted([a, b]))
        self.assertEqual(self.cascade.call_count, 0)
        self.assertEqual(self.audit_actions(), ["events_bulk_deleted"])

    def test_teacher_cannot_bulk_delete(self) -> None:
        event_id = self.create_pending_event()
        response = self.client.post(
            "/dean/events/bulk-delete", json={"event_ids": [event_id]}, headers=self.as_teacher()
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn(ObjectId(event_id), self.events.docs)

    def test_dean_single_delete_is_now_audited(self) -> None:
        event_id = self.create_pending_event()
        response = self.client.delete(f"/dean/events/{event_id}", headers=self.as_dean())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.audit_actions(), ["event_deleted"])

    # ------------------------------------------------------------ superadmin delete
    def test_superadmin_can_delete_any_event(self) -> None:
        pending = self.create_pending_event()
        draft = self.create_draft()
        for event_id in (pending, draft):
            response = self.client.delete(
                f"/superadmin/events/{event_id}", headers={"Authorization": "Bearer superadmin"}
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn(ObjectId(event_id), self.events.docs)
        self.assertEqual(self.audit_actions(), ["event_deleted", "event_deleted"])
        self.assertEqual(self.audit.insert_one.call_args_list[0].args[0]["actor_id"], SUPERADMIN["id"])

        again = self.client.delete(f"/superadmin/events/{pending}", headers={"Authorization": "Bearer superadmin"})
        self.assertEqual(again.status_code, 404)

    def test_only_the_superadmin_uses_the_admin_route(self) -> None:
        event_id = self.create_pending_event()
        for who in ("Bearer dean", "Bearer teacher"):
            response = self.client.delete(f"/superadmin/events/{event_id}", headers={"Authorization": who})
            self.assertEqual(response.status_code, 403, who)
        self.assertIn(ObjectId(event_id), self.events.docs)

    def test_teacher_still_deletes_own_draft(self) -> None:
        draft = self.create_draft()
        response = self.client.delete(f"/teacher/events/{draft}", headers=self.as_teacher())
        self.assertEqual(response.status_code, 200, response.text)


if __name__ == "__main__":
    unittest.main()
