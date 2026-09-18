"""Event categories as data (PRD 4 / 14).

The list used to be hardcoded in three places that had drifted apart. These
tests pin the two properties that fix: one source of truth, and a teacher's
own category surviving into the Dean's filter.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.models.documents import DEFAULT_EVENT_TYPES  # noqa: E402
from app.services.event_types import (  # noqa: E402
    clean_event_type_name,
    list_event_type_names,
    resolve_event_type,
)
from tests.fake_event_types import FakeEventTypes  # noqa: E402

TEACHER = {"id": "teacher1", "role": "teacher", "name": "T"}
DEAN = {"id": "dean1", "role": "dean", "name": "D"}

client = TestClient(app)


class NameShapeTests(unittest.TestCase):
    def test_whitespace_is_collapsed(self) -> None:
        self.assertEqual(clean_event_type_name("  Tech   Fest "), "Tech Fest")

    def test_empty_is_rejected(self) -> None:
        for raw in (None, "", "   "):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    clean_event_type_name(raw)

    def test_overlong_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            clean_event_type_name("x" * 61)

    def test_control_characters_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            clean_event_type_name("Tech\x00Fest")


class ResolveTests(unittest.TestCase):
    def test_known_type_keeps_canonical_spelling(self) -> None:
        with patch("app.services.event_types.event_types", FakeEventTypes()):
            # Whatever case the caller sends, the stored spelling comes back.
            self.assertEqual(resolve_event_type("workshop"), "Workshop")
            self.assertEqual(resolve_event_type("WORKSHOP"), "Workshop")

    def test_new_type_is_created_once(self) -> None:
        store = FakeEventTypes()
        with patch("app.services.event_types.event_types", store):
            self.assertEqual(resolve_event_type("Hackathon", created_by="u1"), "Hackathon")
            # A second teacher typing it differently must not create a twin.
            self.assertEqual(resolve_event_type("hackathon", created_by="u2"), "Hackathon")

        self.assertEqual(
            [n for n in store.names() if n.casefold() == "hackathon"], ["Hackathon"]
        )

    def test_create_false_does_not_persist(self) -> None:
        store = FakeEventTypes()
        with patch("app.services.event_types.event_types", store):
            self.assertEqual(resolve_event_type("Robo War", create=False), "Robo War")
        self.assertNotIn("Robo War", store.names())

    def test_listing_falls_back_when_empty(self) -> None:
        with patch("app.services.event_types.event_types", FakeEventTypes(seed_defaults=False)):
            self.assertEqual(list_event_type_names(), list(DEFAULT_EVENT_TYPES))

    def test_custom_types_sort_after_defaults(self) -> None:
        store = FakeEventTypes()
        with patch("app.services.event_types.event_types", store):
            resolve_event_type("Aardvark Fest", created_by="u1")
            names = list_event_type_names()
        # Alphabetically first, but not a default, so it comes last.
        self.assertEqual(names[-1], "Aardvark Fest")
        self.assertEqual(names[0], "Academic")


class EndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeEventTypes()

    def get(self, user=TEACHER):
        with patch("app.routers.directory.get_current_user", return_value=user), \
                patch("app.services.event_types.event_types", self.store):
            return client.get("/event-types", headers={"Authorization": "Bearer t"})

    def post(self, name, user=TEACHER):
        with patch("app.routers.directory.get_current_user", return_value=user), \
                patch("app.services.event_types.event_types", self.store):
            return client.post(
                "/event-types", json={"name": name}, headers={"Authorization": "Bearer t"}
            )

    def test_any_role_may_read_the_list(self) -> None:
        for user in (TEACHER, DEAN):
            with self.subTest(role=user["role"]):
                response = self.get(user)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(
                    sorted(response.json()["event_types"]), sorted(DEFAULT_EVENT_TYPES)
                )

    def test_teacher_adds_a_type_and_it_appears_in_the_list(self) -> None:
        response = self.post("Hackathon")

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["event_type"], "Hackathon")
        self.assertIn("Hackathon", response.json()["event_types"])
        # And a later read sees it too -- i.e. it was persisted, not echoed.
        self.assertIn("Hackathon", self.get().json()["event_types"])

    def test_adding_an_existing_type_is_not_an_error(self) -> None:
        response = self.post("workshop")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["event_type"], "Workshop")

    def test_dean_may_not_add_a_type(self) -> None:
        self.assertEqual(self.post("Hackathon", user=DEAN).status_code, 403)

    def test_blank_and_overlong_names_are_rejected(self) -> None:
        for name in ("", "   ", "x" * 61):
            with self.subTest(name=name[:10]):
                self.assertEqual(self.post(name).status_code, 422)


if __name__ == "__main__":
    unittest.main()
