"""The whole lifecycle, walked end to end in one go.

Creation -> Approval -> Re-approval -> Revoke -> Accepted (Completed).

The per-action tests in test_event_history.py each check one transition from a
clean start. This walks the arc a real event takes, in order, so a change that
leaves two neighbouring steps individually correct but unable to follow one
another is caught. It is also the test that pins the re-approval routes back
from a refusal, which the UI has always offered and the server used to refuse.
"""

from __future__ import annotations

import unittest

# Imported as a module, not by name: pulling EventHistoryTests into this
# namespace would make unittest collect and re-run every one of its cases here.
from tests import test_event_history as history
from tests.test_event_history import (  # noqa: F401  (unittest calls these)
    setUpModule,
    tearDownModule,
)

EVENT_PAYLOAD = history.EVENT_PAYLOAD


class EventLifecycleTests(history.EventHistoryTests):
    """Inherits the in-memory collections and the two-role client."""

    # Only the walk below; the inherited per-transition cases run in their own
    # module and would just be repeated here.
    test_full_review_cycle_is_recorded_in_order = None
    test_request_changes_records_the_remarks = None
    test_draft_saves_stay_out_of_the_trail_until_submitted = None
    test_delivery_stages_are_recorded = None

    def submit(self) -> str:
        """An event in the Dean's queue, reached the way a teacher reaches it."""
        return self.create_pending_event()

    def status_of(self, event_id: str) -> str:
        response = self.client.get(
            f"/dean/events/{event_id}", headers=self.as_dean()
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["event"]["status"]

    def approve(self, event_id: str):
        return self.client.patch(
            f"/dean/events/{event_id}/approve", headers=self.as_dean()
        )

    def revoke(self, event_id: str, reason="Venue withdrew"):
        return self.client.patch(
            f"/dean/events/{event_id}/revoke",
            json={"revocation_reason": reason},
            headers=self.as_dean(),
        )

    def stage(self, event_id: str, stage: str):
        return self.client.patch(
            f"/dean/events/{event_id}/stage",
            params={"stage": stage},
            headers=self.as_dean(),
        )

    # ------------------------------------------------------------------
    # The happy path, all the way to the end
    # ------------------------------------------------------------------

    def test_creation_through_to_accepted(self) -> None:
        event_id = self.submit()
        self.assertEqual(self.status_of(event_id), "pending")

        self.assertEqual(self.approve(event_id).status_code, 200)
        self.assertEqual(self.status_of(event_id), "approved")

        # "In Progress" was removed from tracking: approved goes straight to
        # completed, and in_progress is no longer a stage the Dean can set.
        self.assertEqual(self.stage(event_id, "in_progress").status_code, 400)
        self.assertEqual(self.status_of(event_id), "approved")

        self.assertEqual(self.stage(event_id, "completed").status_code, 200)
        self.assertEqual(self.status_of(event_id), "completed")

        self.assertEqual(
            [entry["action"] for entry in self.history_of(event_id)],
            ["created", "submitted", "approved", "stage_changed"],
        )

    # ------------------------------------------------------------------
    # The arc the request was about: refuse, reconsider, carry on
    # ------------------------------------------------------------------

    def test_approve_revoke_reapprove_then_accepted(self) -> None:
        event_id = self.submit()
        self.assertEqual(self.approve(event_id).status_code, 200)

        revoked = self.revoke(event_id)
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(revoked.json()["event"]["status"], "revoked")
        self.assertEqual(
            revoked.json()["event"]["revocation_reason"], "Venue withdrew"
        )

        # Delivery stages are out of reach while the approval is withdrawn.
        self.assertEqual(self.stage(event_id, "completed").status_code, 400)

        restored = self.approve(event_id)
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()["event"]["status"], "approved")
        self.assertIsNone(restored.json()["event"]["revocation_reason"])
        self.assertIsNone(restored.json()["event"]["revoked_at"])

        # ...and back within reach once it is restored.
        self.assertEqual(self.stage(event_id, "completed").status_code, 200)
        self.assertEqual(self.status_of(event_id), "completed")

        self.assertEqual(
            [entry["action"] for entry in self.history_of(event_id)],
            [
                # The wizard saves a draft before it can submit, so the trail
                # opens with "created".
                "created",
                "submitted",
                "approved",
                "revoked",
                "approved",
                "stage_changed",
            ],
        )

    def test_reject_reapprove_then_accepted(self) -> None:
        event_id = self.submit()

        rejected = self.client.patch(
            f"/dean/events/{event_id}/reject",
            json={"rejection_reason": "Clashes with exams"},
            headers=self.as_dean(),
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)

        restored = self.approve(event_id)
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertIsNone(restored.json()["event"]["rejection_reason"])

        self.assertEqual(self.stage(event_id, "completed").status_code, 200)
        self.assertEqual(self.status_of(event_id), "completed")

    # ------------------------------------------------------------------
    # The other way back from a refusal stays open
    # ------------------------------------------------------------------

    def test_revoked_event_resubmitted_by_the_teacher_is_pending_again(self) -> None:
        event_id = self.submit()
        self.approve(event_id)
        self.revoke(event_id)

        resubmitted = self.client.patch(
            f"/teacher/events/{event_id}/resubmit", headers=self.as_teacher()
        )

        self.assertEqual(resubmitted.status_code, 200, resubmitted.text)
        event = resubmitted.json()["event"]
        self.assertEqual(event["status"], "pending")
        # The refusal is cleared, or the teacher's own page still reads revoked.
        self.assertIsNone(event["revocation_reason"])
        self.assertIsNone(event["revoked_at"])

        self.assertEqual(self.approve(event_id).status_code, 200)
        self.assertEqual(self.status_of(event_id), "approved")

    # ------------------------------------------------------------------
    # What must stay refused
    # ------------------------------------------------------------------

    def test_a_completed_event_is_not_approved_again(self) -> None:
        event_id = self.submit()
        self.approve(event_id)
        self.stage(event_id, "completed")

        response = self.approve(event_id)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "This event is already approved.")

    def test_a_draft_is_still_invisible_to_re_approval(self) -> None:
        created = self.client.post(
            "/teacher/events",
            json={**EVENT_PAYLOAD, "save_as_draft": True},
            headers=self.as_teacher(),
        )
        event_id = created.json()["event"]["id"]

        self.assertEqual(self.approve(event_id).status_code, 404)


if __name__ == "__main__":
    unittest.main()
