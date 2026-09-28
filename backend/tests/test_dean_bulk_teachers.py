"""The Dean's bulk teacher delete / remove, and the Active filter."""

from __future__ import annotations

import unittest

from bson import ObjectId

from tests.test_dean_teacher_management import DeanTeacherTestCase


class BulkTeacherTests(DeanTeacherTestCase):
    def ids(self, *teachers) -> list[str]:
        return [str(t["_id"]) for t in teachers]

    def test_bulk_delete_skips_teachers_with_events(self) -> None:
        self.events.add(self.teacher, 2)
        response = self.client.post(
            "/dean/teachers/bulk-delete",
            json={"user_ids": self.ids(self.teacher, self.signed_in_teacher, self.inactive_teacher, self.other_dean)
                  + [str(ObjectId())]},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data["requested_count"], data["done_count"], data["skipped_count"]), (5, 2, 3))
        by_id = {r["user_id"]: r for r in data["results"]}
        self.assertIn("Remove the teacher instead", by_id[str(self.teacher["_id"])]["reason"])
        self.assertIsNotNone(self.doc(self.teacher))          # kept: has events
        self.assertIsNone(self.doc(self.signed_in_teacher))   # deleted
        self.assertIsNone(self.doc(self.inactive_teacher))    # deleted
        self.assertEqual(self.doc(self.other_dean)["role"], "dean")  # never a Dean
        self.assertEqual(self.audit.actions(), ["teachers_bulk_deleted"])

    def test_bulk_remove_keeps_records(self) -> None:
        self.events.add(self.teacher, 2)
        response = self.client.post(
            "/dean/teachers/bulk-remove",
            json={"user_ids": self.ids(self.teacher, self.signed_in_teacher, self.dean)},
            headers=self.auth(self.dean),
        )
        data = response.json()
        self.assertEqual((data["done_count"], data["skipped_count"]), (2, 1))
        for t in (self.teacher, self.signed_in_teacher):
            self.assertIsNotNone(self.doc(t)["removed_at"])
            self.assertIs(self.doc(t)["is_active"], False)
        self.assertEqual(len(self.events.documents), 2)
        again = self.client.post(
            "/dean/teachers/bulk-remove", json={"user_ids": self.ids(self.teacher)}, headers=self.auth(self.dean)
        ).json()
        self.assertEqual(again["results"][0]["reason"], "Already removed.")

    def test_teacher_cannot_bulk_delete(self) -> None:
        for path in ("/dean/teachers/bulk-delete", "/dean/teachers/bulk-remove"):
            response = self.client.post(path, json={"user_ids": self.ids(self.signed_in_teacher)},
                                        headers=self.auth(self.teacher))
            self.assertEqual(response.status_code, 403)
        self.assertIsNotNone(self.doc(self.signed_in_teacher))

    def test_active_filter_shows_only_verified(self) -> None:
        self.users.get(self.teacher["_id"])["email_verified"] = False
        data = self.client.get("/dean/teachers?status=active", headers=self.auth(self.dean)).json()
        self.assertEqual([t["email"] for t in data["teachers"]], [self.signed_in_teacher["email"]])
        self.assertEqual(data["counts"]["active"], 1)
        # Still listed under All.
        everyone = self.client.get("/dean/teachers", headers=self.auth(self.dean)).json()
        self.assertIn(self.teacher["email"], [t["email"] for t in everyone["teachers"]])


if __name__ == "__main__":
    unittest.main()
