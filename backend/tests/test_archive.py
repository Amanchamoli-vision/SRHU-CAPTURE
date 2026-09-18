"""The Dean's archive shelf and permanent delete (PRD 1).

Archiving is a second axis, not a status: `status` keeps the review lifecycle
so restore has something to return to. These tests pin that separation, and
that a shelved event disappears from every live view.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.documents import new_event_document  # noqa: E402
from tests.test_event_history import FakeEvents  # noqa: E402

DEAN = {"id": "dean1", "role": "dean", "name": "Dr. Dean"}
TEACHER = {"id": "teacher1", "role": "teacher", "name": "T"}

client = TestClient(app)


class ArchiveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.events = FakeEvents()
        self.cascade = patch("app.routers.events.delete_event_cascade")
        self.cascade_mock = self.cascade.start()
        self.addCleanup(self.cascade.stop)
        self.event_id = self.seed("Live Summit", "approved")

    def seed(self, name: str, status: str = "pending") -> str:
        document = new_event_document(
            teacher_id="teacher1",
            event_name=name,
            event_date="2099-10-15",
            event_type="Seminar",
            location="Hall",
            description="Body",
            social_network_url=None,
            status=status,
        )
        return str(self.events.insert_one(document).inserted_id)

    def call(self, method: str, path: str, user=DEAN, **kwargs):
        with patch("app.routers.events.get_current_user", return_value=user), \
                patch("app.routers.events.events", self.events):
            return getattr(client, method)(
                path, headers={"Authorization": "Bearer t"}, **kwargs
            )

    def archive(self, event_id=None, **kwargs):
        return self.call(
            "patch", f"/dean/events/{event_id or self.event_id}/archive", **kwargs
        )

    def restore(self, event_id=None):
        return self.call("patch", f"/dean/events/{event_id or self.event_id}/restore")

    # -------------------------------------------------- archiving

    def test_archiving_sets_the_shelf_fields_without_touching_status(self) -> None:
        response = self.archive(json={"remarks": "Duplicate entry"})

        self.assertEqual(response.status_code, 200, response.text)
        event = response.json()["event"]
        self.assertIsNotNone(event["archived_at"])
        self.assertEqual(event["archived_by"], "dean1")
        self.assertEqual(event["archive_reason"], "Duplicate entry")
        # The lifecycle is untouched -- that is what restore returns to.
        self.assertEqual(event["status"], "approved")

    def test_archiving_is_recorded_in_the_history(self) -> None:
        self.archive()
        history = self.events.find_one({"_id": self.events.find({})[0]["_id"]})["history"]
        self.assertEqual([h["action"] for h in history], ["archived"])

    def test_archiving_twice_is_409(self) -> None:
        self.assertEqual(self.archive().status_code, 200)
        response = self.archive()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "This event is already archived.")

    def test_a_draft_cannot_be_archived(self) -> None:
        draft_id = self.seed("Scratch", "draft")
        self.assertEqual(self.archive(draft_id).status_code, 404)

    def test_reason_is_optional(self) -> None:
        response = self.archive()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["event"]["archive_reason"])

    # -------------------------------------------------- visibility

    def test_archived_event_leaves_the_dean_list(self) -> None:
        before = self.call("get", "/dean/events").json()
        self.assertEqual(before["total"], 1)

        self.archive()

        after = self.call("get", "/dean/events").json()
        self.assertEqual(after["total"], 0)
        self.assertEqual(after["events"], [])

    def test_archived_event_leaves_the_teacher_list(self) -> None:
        self.archive()
        body = self.call("get", "/teacher/events", user=TEACHER).json()
        self.assertEqual(body["total"], 0)

    def test_archived_event_cannot_be_approved(self) -> None:
        pending_id = self.seed("Pending One", "pending")
        self.archive(pending_id)

        response = self.call("patch", f"/dean/events/{pending_id}/approve")

        self.assertEqual(response.status_code, 404)

    def test_archive_listing_shows_only_shelved_events(self) -> None:
        self.seed("Another Live", "pending")
        self.archive()

        body = self.call("get", "/dean/archive/events").json()

        self.assertEqual(body["total"], 1)
        self.assertEqual(body["events"][0]["event_name"], "Live Summit")

    def test_archive_listing_paginates(self) -> None:
        for index in range(5):
            self.archive(self.seed(f"Old {index}", "completed"))

        body = self.call("get", "/dean/archive/events?skip=0&limit=2").json()

        self.assertEqual(body["total"], 5)
        self.assertEqual(body["count"], 2)
        self.assertTrue(body["has_more"])

    # -------------------------------------------------- restoring

    def test_restore_clears_the_shelf_and_keeps_the_status(self) -> None:
        self.archive()

        response = self.restore()

        self.assertEqual(response.status_code, 200, response.text)
        event = response.json()["event"]
        self.assertIsNone(event["archived_at"])
        self.assertIsNone(event["archived_by"])
        self.assertEqual(event["status"], "approved")
        # And it is back in the live list.
        self.assertEqual(self.call("get", "/dean/events").json()["total"], 1)

    def test_restoring_a_live_event_is_409(self) -> None:
        response = self.restore()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "This event is not archived.")

    # -------------------------------------------------- permanent delete

    def test_dean_deletes_permanently_and_media_is_cascaded(self) -> None:
        response = self.call("delete", f"/dean/events/{self.event_id}")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.events.count_documents({}), 0)
        self.cascade_mock.assert_called_once_with(self.event_id)

    def test_an_archived_event_can_also_be_deleted(self) -> None:
        self.archive()
        self.assertEqual(
            self.call("delete", f"/dean/events/{self.event_id}").status_code, 200
        )

    def test_teacher_may_not_use_the_dean_delete(self) -> None:
        response = self.call("delete", f"/dean/events/{self.event_id}", user=TEACHER)
        self.assertEqual(response.status_code, 403)

    def test_deleting_a_missing_event_is_404(self) -> None:
        self.assertEqual(
            self.call("delete", "/dean/events/6aac7ecbee2ad335979f1268").status_code, 404
        )

    # -------------------------------------------------- readable while archived

    def test_archived_event_can_still_be_opened(self) -> None:
        # The Archive page links to the normal detail route, so hiding the
        # event there made its own View button fail to load.
        self.archive()

        response = self.call("get", f"/dean/events/{self.event_id}")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNotNone(response.json()["event"]["archived_at"])

    def test_archived_event_media_is_still_listed(self) -> None:
        self.archive()

        empty = MagicMock()
        empty.find.return_value.sort.return_value = []
        with patch("app.routers.events.event_media", empty):
            response = self.call("get", f"/dean/events/{self.event_id}/media")

        self.assertEqual(response.status_code, 200, response.text)

    def test_archived_event_still_cannot_be_decided_on(self) -> None:
        # Readable is not the same as actionable.
        pending_id = self.seed("Pending Two", "pending")
        self.archive(pending_id)

        for verb, body in (
            ("approve", None),
            ("reject", {"rejection_reason": "no"}),
        ):
            with self.subTest(verb=verb):
                response = self.call(
                    "patch",
                    f"/dean/events/{pending_id}/{verb}",
                    **({"json": body} if body else {}),
                )
                self.assertEqual(response.status_code, 404)

    def test_a_draft_is_still_hidden_even_when_archived(self) -> None:
        draft_id = self.seed("Scratch Two", "draft")
        self.assertEqual(
            self.call("get", f"/dean/events/{draft_id}").status_code, 404
        )


if __name__ == "__main__":
    unittest.main()
