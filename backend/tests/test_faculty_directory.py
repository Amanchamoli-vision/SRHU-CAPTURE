"""The faculty coordinator directory (PRD 5).

The property that matters most here is negative: a teacher filling in a form
must not be able to read colleagues' email addresses or roles out of an
autocomplete. The endpoint projects name and phone only, and these tests assert
that nothing else ever appears in a response.
"""

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

TEACHER = {"id": "teacher1", "role": "teacher", "name": "T"}
DEAN = {"id": "dean1", "role": "dean", "name": "D"}

client = TestClient(app)


def _matches(doc: dict, query: dict) -> bool:
    for key, wanted in query.items():
        value = doc.get(key)
        if isinstance(wanted, dict):
            if "$nin" in wanted and value in wanted["$nin"]:
                return False
        elif value != wanted:
            return False
    return True


class FakeCollection:
    """find/find_one/insert_one/update_one with projection support."""

    def __init__(self, *documents: dict) -> None:
        self.docs: list[dict] = []
        for document in documents:
            self.insert_one(copy.deepcopy(document))

    def insert_one(self, document: dict):
        document.setdefault("_id", ObjectId())
        self.docs.append(document)
        return MagicMock(inserted_id=document["_id"])

    def find(self, query: dict | None = None, projection: dict | None = None):
        rows = [copy.deepcopy(d) for d in self.docs if _matches(d, query or {})]
        if projection:
            keep = {k for k, v in projection.items() if v} | {"_id"}
            rows = [{k: v for k, v in row.items() if k in keep} for row in rows]
        return rows

    def find_one(self, query: dict, projection: dict | None = None):
        return next(iter(self.find(query, projection)), None)

    def update_one(self, query: dict, update: dict, upsert: bool = False):
        for doc in self.docs:
            if _matches(doc, query):
                doc.update(update.get("$set", {}))
                return MagicMock(matched_count=1)
        return MagicMock(matched_count=0)


def staff(name, phone, **extra):
    return {
        "name": name,
        "email": f"{name.split()[-1].lower()}@srhu.edu.in",
        "role": "teacher",
        "phone": phone,
        "password_hash": "x",
        "email_verified": True,
        **extra,
    }


class ListingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.users = FakeCollection(
            staff("Dr. Rajesh Sharma", "9876543210"),
            staff("Dr. Anita Rao", "9000000001"),
            staff("No Number Person", None),
            staff("Blank Number Person", ""),
        )
        self.cards = FakeCollection(
            {"name": "Prof. Guest Lecturer", "name_key": "prof. guest lecturer",
             "phone": "9111111111"},
        )

    def get(self, query: str = "", user=TEACHER):
        with patch("app.routers.directory.get_current_user", return_value=user), \
                patch("app.routers.directory.users", self.users), \
                patch("app.routers.directory.faculty_coordinators", self.cards):
            return client.get(
                f"/faculty/coordinators{query}", headers={"Authorization": "Bearer t"}
            )

    def test_lists_staff_with_a_number_and_standalone_cards(self) -> None:
        body = self.get().json()
        names = [c["name"] for c in body["coordinators"]]

        self.assertIn("Dr. Rajesh Sharma", names)
        self.assertIn("Prof. Guest Lecturer", names)

    def test_staff_without_a_number_are_omitted(self) -> None:
        names = [c["name"] for c in self.get().json()["coordinators"]]

        # Publishing a number is the opt-in; no number means not listed.
        self.assertNotIn("No Number Person", names)
        self.assertNotIn("Blank Number Person", names)

    def test_no_email_or_role_ever_leaks(self) -> None:
        response = self.get()

        self.assertEqual(response.status_code, 200, response.text)
        for entry in response.json()["coordinators"]:
            self.assertEqual(set(entry) - {"id", "name", "phone", "source"}, set())
        # Belt and braces: the raw body must not contain an address at all.
        self.assertNotIn("@srhu.edu.in", response.text)
        self.assertNotIn("password", response.text)

    def test_results_are_sorted_by_name(self) -> None:
        names = [c["name"] for c in self.get().json()["coordinators"]]
        self.assertEqual(names, sorted(names, key=str.casefold))

    def test_search_filters_by_name(self) -> None:
        body = self.get("?q=anita").json()
        self.assertEqual([c["name"] for c in body["coordinators"]], ["Dr. Anita Rao"])

    def test_limit_caps_the_page_but_total_counts_all(self) -> None:
        body = self.get("?limit=1").json()
        self.assertEqual(len(body["coordinators"]), 1)
        self.assertEqual(body["total"], 3)

    def test_a_card_duplicating_a_staff_member_collapses(self) -> None:
        self.cards.insert_one({
            "name": "dr. rajesh sharma", "name_key": "dr. rajesh sharma",
            "phone": "9999999999",
        })
        entries = self.get().json()["coordinators"]
        matching = [e for e in entries if e["name"].casefold() == "dr. rajesh sharma"]

        self.assertEqual(len(matching), 1)
        # The account wins: its number is the self-maintained one.
        self.assertEqual(matching[0]["phone"], "9876543210")
        self.assertEqual(matching[0]["source"], "user")

    def test_dean_may_also_read_the_directory(self) -> None:
        self.assertEqual(self.get(user=DEAN).status_code, 200)


class AddCoordinatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cards = FakeCollection()

    def post(self, payload: dict, user=TEACHER):
        with patch("app.routers.directory.get_current_user", return_value=user), \
                patch("app.routers.directory.faculty_coordinators", self.cards):
            return client.post(
                "/faculty/coordinators", json=payload, headers={"Authorization": "Bearer t"}
            )

    def test_teacher_adds_a_coordinator(self) -> None:
        response = self.post({"name": "  Prof.  New  Person ", "phone": "+91 98765 43210"})

        self.assertEqual(response.status_code, 201, response.text)
        coordinator = response.json()["coordinator"]
        self.assertEqual(coordinator["name"], "Prof. New Person")
        self.assertEqual(coordinator["phone"], "9876543210")
        self.assertEqual(len(self.cards.docs), 1)

    def test_adding_the_same_name_updates_rather_than_duplicates(self) -> None:
        self.post({"name": "Prof. Person", "phone": "9876543210"})
        response = self.post({"name": "prof.  person", "phone": "9000000000"})

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(self.cards.docs), 1, "a near-duplicate row was created")
        self.assertEqual(self.cards.docs[0]["phone"], "9000000000")

    def test_phone_is_required_and_validated(self) -> None:
        for phone in ("", "12345", "not-a-number", "98765432100"):
            with self.subTest(phone=phone):
                self.assertEqual(
                    self.post({"name": "Prof. X", "phone": phone}).status_code, 422
                )

    def test_name_is_required(self) -> None:
        self.assertEqual(self.post({"name": "   ", "phone": "9876543210"}).status_code, 422)

    def test_dean_may_not_add(self) -> None:
        self.assertEqual(
            self.post({"name": "Prof. X", "phone": "9876543210"}, user=DEAN).status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main()
