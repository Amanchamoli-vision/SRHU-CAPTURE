"""Paging on the list endpoints (app/routers/events.py).

The point of these tests is the `total` field: it reports how many documents
match the filter, not how many are on the page. A paging UI cannot render
"1-25 of 312" or decide whether a next page exists without that distinction.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.documents import new_event_document  # noqa: E402
from tests.test_event_history import FakeEvents  # noqa: E402

DEAN = {"id": "dean1", "role": "dean", "name": "Dr. Dean"}
TEACHER = {"id": "teacher1", "role": "teacher", "name": "T"}

client = TestClient(app)


def seeded(count: int, *, teacher_id: str = "teacher1", status: str = "pending") -> FakeEvents:
    store = FakeEvents()
    for index in range(count):
        document = new_event_document(
            teacher_id=teacher_id,
            event_name=f"Event {index:03d}",
            event_date="2026-10-15",
            event_type="Workshop",
            location="Hall",
            description="Body",
            social_network_url=None,
            status=status,
        )
        # Distinct, ordered timestamps so the sort is deterministic.
        document["created_at"] = f"2026-09-{index + 1:02d}T00:00:00+00:00"
        store.insert_one(document)
    return store


def dean_list(store, query: str = ""):
    with patch("app.routers.events.get_current_user", return_value=DEAN), \
            patch("app.routers.events.events", store):
        return client.get(f"/dean/events{query}", headers={"Authorization": "Bearer t"})


def teacher_list(store, query: str = ""):
    with patch("app.routers.events.get_current_user", return_value=TEACHER), \
            patch("app.routers.events.events", store):
        return client.get(f"/teacher/events{query}", headers={"Authorization": "Bearer t"})


class DeanListPagingTests(unittest.TestCase):
    def test_total_is_the_whole_result_set_not_the_page(self) -> None:
        body = dean_list(seeded(30), "?skip=0&limit=10").json()

        self.assertEqual(body["total"], 30)
        self.assertEqual(body["count"], 10)
        self.assertEqual(len(body["events"]), 10)
        self.assertTrue(body["has_more"])

    def test_last_page_reports_no_more(self) -> None:
        body = dean_list(seeded(30), "?skip=20&limit=10").json()

        self.assertEqual(body["total"], 30)
        self.assertEqual(body["count"], 10)
        self.assertFalse(body["has_more"])

    def test_partial_last_page(self) -> None:
        body = dean_list(seeded(25), "?skip=20&limit=10").json()

        self.assertEqual(body["total"], 25)
        self.assertEqual(body["count"], 5)
        self.assertFalse(body["has_more"])

    def test_unpaged_request_still_returns_everything(self) -> None:
        # No skip/limit is the existing default and must not start capping.
        body = dean_list(seeded(12)).json()

        self.assertEqual(body["total"], 12)
        self.assertEqual(len(body["events"]), 12)
        self.assertFalse(body["has_more"])

    def test_total_respects_the_filter(self) -> None:
        # Drafts are invisible to the Dean, so they must not inflate the count.
        store = seeded(10)
        for document in list(store.docs.values())[:4]:
            document["status"] = "draft"

        body = dean_list(store, "?limit=3").json()

        self.assertEqual(body["total"], 6)
        self.assertEqual(body["count"], 3)

    def test_pages_do_not_overlap_or_skip(self) -> None:
        store = seeded(9)
        first = dean_list(store, "?skip=0&limit=4").json()["events"]
        second = dean_list(store, "?skip=4&limit=4").json()["events"]
        third = dean_list(store, "?skip=8&limit=4").json()["events"]

        names = [e["event_name"] for e in first + second + third]
        self.assertEqual(len(names), 9)
        self.assertEqual(len(set(names)), 9, "a page repeated a row")


class TeacherListPagingTests(unittest.TestCase):
    def test_total_counts_only_the_callers_events(self) -> None:
        store = seeded(8, teacher_id="teacher1")
        for index in range(5):
            document = new_event_document(
                teacher_id="someone-else",
                event_name=f"Other {index}",
                event_date="2026-10-15",
                event_type="Workshop",
                location="Hall",
                description="Body",
                social_network_url=None,
            )
            store.insert_one(document)

        body = teacher_list(store, "?limit=3").json()

        self.assertEqual(body["total"], 8)
        self.assertEqual(body["count"], 3)
        self.assertTrue(body["has_more"])

    def test_drafts_are_included_for_their_owner(self) -> None:
        body = teacher_list(seeded(4, status="draft")).json()
        self.assertEqual(body["total"], 4)


if __name__ == "__main__":
    unittest.main()


class DeanFilterTests(unittest.TestCase):
    """Search and status filtering happen server-side (PRD 1 / 15).

    They have to: with client-side filtering over a server-paged list you
    would be filtering 25 rows out of 25 and showing "3 results" on page 1
    of 13.
    """

    def setUp(self) -> None:
        self.store = FakeEvents()
        for name, status, location in [
            ("Robotics Workshop", "pending", "Lab A"),
            ("Cultural Night", "approved", "Auditorium"),
            ("C++ Bootcamp", "rejected", "Lab B"),
            ("Sports Meet", "completed", "Ground"),
            ("Robotics Expo", "revoked", "Lab A"),
        ]:
            document = new_event_document(
                teacher_id="teacher1",
                event_name=name,
                event_date="2099-10-15",
                event_type="Workshop",
                location=location,
                description="Body",
                social_network_url=None,
                status=status,
            )
            self.store.insert_one(document)

    def get(self, query=""):
        return dean_list(self.store, query)

    def test_search_matches_the_event_name(self) -> None:
        body = self.get("?q=robotics").json()

        self.assertEqual(body["total"], 2)
        self.assertEqual(
            sorted(e["event_name"] for e in body["events"]),
            ["Robotics Expo", "Robotics Workshop"],
        )

    def test_search_matches_the_venue(self) -> None:
        self.assertEqual(self.get("?q=auditorium").json()["total"], 1)

    def test_search_is_case_insensitive(self) -> None:
        self.assertEqual(self.get("?q=ROBOTICS").json()["total"], 2)

    def test_regex_characters_are_escaped(self) -> None:
        # "C++" would otherwise be an invalid pattern, or match nothing.
        body = self.get("?q=C%2B%2B").json()

        self.assertEqual(body["total"], 1)
        self.assertEqual(body["events"][0]["event_name"], "C++ Bootcamp")

    def test_status_bucket_groups_related_statuses(self) -> None:
        # "completed" is part of the approved bucket.
        self.assertEqual(self.get("?status_bucket=approved").json()["total"], 2)
        # A revoked event belongs with the rejected ones.
        self.assertEqual(self.get("?status_bucket=rejected").json()["total"], 2)
        self.assertEqual(self.get("?status_bucket=pending").json()["total"], 1)

    def test_unknown_bucket_is_rejected(self) -> None:
        self.assertEqual(self.get("?status_bucket=nonsense").status_code, 400)

    def test_all_bucket_is_everything(self) -> None:
        self.assertEqual(self.get("?status_bucket=all").json()["total"], 5)

    def test_counts_cover_every_bucket(self) -> None:
        counts = self.get().json()["counts"]

        self.assertEqual(counts["all"], 5)
        self.assertEqual(counts["pending"], 1)
        self.assertEqual(counts["approved"], 2)
        self.assertEqual(counts["rejected"], 2)

    def test_counts_respect_the_search_but_not_the_status_tab(self) -> None:
        # Selecting a tab must not zero out the other tabs' numbers.
        body = self.get("?q=robotics&status_bucket=pending").json()

        self.assertEqual(body["total"], 1)
        self.assertEqual(body["counts"]["all"], 2)
        self.assertEqual(body["counts"]["rejected"], 1)

    def test_search_and_paging_combine(self) -> None:
        body = self.get("?q=robotics&skip=0&limit=1").json()

        self.assertEqual(body["total"], 2)
        self.assertEqual(body["count"], 1)
        self.assertTrue(body["has_more"])

    def test_all_count_excludes_drafts(self) -> None:
        # Regression: the counts query drops the `status` key so a selected tab
        # does not skew the others -- which also dropped the base query's
        # {"$ne": "draft"}, making the All tab count events the Dean cannot see.
        document = new_event_document(
            teacher_id="teacher1",
            event_name="Scratch",
            event_date="2099-10-15",
            event_type="Workshop",
            location="Hall",
            description="Body",
            social_network_url=None,
            status="draft",
        )
        self.store.insert_one(document)

        body = self.get().json()

        self.assertEqual(body["total"], 5)
        self.assertEqual(body["counts"]["all"], 5, "a draft was counted in All")
