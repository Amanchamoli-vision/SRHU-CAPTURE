from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from tests.test_event_history import FakeEvents  # noqa: E402


class DateRangeFilterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.dean_user = {
            "id": "dean-1",
            "name": "Dr. Dean",
            "email": "dean@srhu.edu.in",
            "role": "dean",
        }
        self.auth_patcher = patch(
            "app.routers.events.get_current_user",
            return_value=self.dean_user,
        )
        self.auth_patcher.start()

        self.fake_events = FakeEvents()
        self.fake_events.docs = {
            "1": {
                "_id": ObjectId("507f1f77bcf86cd799439011"),
                "event_name": "New Year Kickoff",
                "event_date": "2026-01-05",
                "status": "pending",
                "archived_at": None,
                "teacher_id": "t-1",
            },
            "2": {
                "_id": ObjectId("507f1f77bcf86cd799439012"),
                "event_name": "Mid-Year Symposium",
                "event_date": "2026-06-15",
                "status": "pending",
                "archived_at": None,
                "teacher_id": "t-1",
            },
            "3": {
                "_id": ObjectId("507f1f77bcf86cd799439013"),
                "event_name": "Year End Gala",
                "event_date": "2026-12-20",
                "status": "pending",
                "archived_at": None,
                "teacher_id": "t-1",
            },
        }

        self.events_patcher = patch("app.routers.events.events", self.fake_events)
        self.events_patcher.start()

        # Mock managed_events as empty
        self.fake_managed = FakeEvents()
        self.fake_managed.docs = {}
        self.managed_patcher = patch("app.routers.events.managed_events", self.fake_managed)
        self.managed_patcher.start()

    def tearDown(self) -> None:
        self.auth_patcher.stop()
        self.events_patcher.stop()
        self.managed_patcher.stop()

    def test_filter_by_start_date_and_end_date(self) -> None:
        response = self.client.get(
            "/dean/events?start_date=2026-01-01&end_date=2026-06-30",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [e["event_name"] for e in data["events"]]
        self.assertIn("New Year Kickoff", names)
        self.assertIn("Mid-Year Symposium", names)
        self.assertNotIn("Year End Gala", names)
        self.assertEqual(data["filters"]["start_date"], "2026-01-01")
        self.assertEqual(data["filters"]["end_date"], "2026-06-30")

    def test_filter_by_start_date_only(self) -> None:
        response = self.client.get(
            "/dean/events?start_date=2026-06-01",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [e["event_name"] for e in data["events"]]
        self.assertNotIn("New Year Kickoff", names)
        self.assertIn("Mid-Year Symposium", names)
        self.assertIn("Year End Gala", names)

    def test_filter_by_end_date_only(self) -> None:
        response = self.client.get(
            "/dean/events?end_date=2026-06-01",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [e["event_name"] for e in data["events"]]
        self.assertIn("New Year Kickoff", names)
        self.assertNotIn("Mid-Year Symposium", names)
        self.assertNotIn("Year End Gala", names)

    def test_invalid_start_date_format_returns_400(self) -> None:
        response = self.client.get(
            "/dean/events?start_date=not-a-date",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid start_date format", response.json()["detail"])

    def test_invalid_end_date_format_returns_400(self) -> None:
        response = self.client.get(
            "/dean/events?end_date=2026/05/12",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid end_date format", response.json()["detail"])

    def test_start_date_after_end_date_returns_400(self) -> None:
        response = self.client.get(
            "/dean/events?start_date=2026-07-01&end_date=2026-06-01",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("start_date cannot be after end_date", response.json()["detail"])

    def test_dean_event_ids_with_date_range(self) -> None:
        response = self.client.get(
            "/dean/events/ids?start_date=2026-01-01&end_date=2026-06-30",
            headers={"Authorization": "Bearer mock-dean-token"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = [e["event_name"] for e in data["events"]]
        self.assertIn("New Year Kickoff", names)
        self.assertIn("Mid-Year Symposium", names)
        self.assertNotIn("Year End Gala", names)
