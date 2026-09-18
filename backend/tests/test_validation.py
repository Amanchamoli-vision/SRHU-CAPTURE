"""Shared schema validators (app/schemas/common.py).

Pure unit tests -- no TestClient, no database, no settings bootstrap needed.
"""

from __future__ import annotations

import unittest

from app.schemas.common import normalize_hhmm, normalize_phone


class PhoneTests(unittest.TestCase):
    def test_plain_ten_digits(self) -> None:
        self.assertEqual(normalize_phone("9876543210"), "9876543210")

    def test_separators_are_stripped(self) -> None:
        for raw in ("98765 43210", "98765-43210", "(98765) 43210", "98765.43210"):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_phone(raw), "9876543210")

    def test_country_prefix_is_stripped(self) -> None:
        for raw in ("+919876543210", "919876543210", "09876543210", "+91 98765 43210"):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_phone(raw), "9876543210")

    def test_leading_zero_number_is_not_mangled(self) -> None:
        # Already ten digits, so the 0-prefix rule must not fire and leave nine.
        self.assertEqual(normalize_phone("0123456789"), "0123456789")

    def test_blank_is_none_when_optional(self) -> None:
        for raw in (None, "", "   "):
            with self.subTest(raw=raw):
                self.assertIsNone(normalize_phone(raw))

    def test_blank_raises_when_required(self) -> None:
        with self.assertRaises(ValueError):
            normalize_phone("", required=True)

    def test_letters_and_wrong_lengths_are_rejected(self) -> None:
        # PRD 6: exactly ten digits, numeric only.
        for raw in ("12345", "abcdefghij", "98765432100", "9876 54321a", "98765-4321x"):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    normalize_phone(raw)

    def test_message_is_user_safe(self) -> None:
        with self.assertRaises(ValueError) as caught:
            normalize_phone("123")
        self.assertIn("10 digits", str(caught.exception))


class HhmmTests(unittest.TestCase):
    def test_canonical_values_pass_through(self) -> None:
        for raw in ("00:00", "09:30", "14:00", "23:59"):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_hhmm(raw), raw)

    def test_single_digit_hour_is_padded(self) -> None:
        # String comparison of times is only correct while every value is
        # zero-padded, so "9:30" must not survive as-is.
        self.assertEqual(normalize_hhmm("9:30"), "09:30")
        self.assertEqual(normalize_hhmm("9:5"), "09:05")

    def test_blank_is_none(self) -> None:
        for raw in (None, "", "  "):
            with self.subTest(raw=raw):
                self.assertIsNone(normalize_hhmm(raw))

    def test_out_of_range_and_garbage_rejected(self) -> None:
        for raw in ("24:00", "12:60", "25:10", "noon", "14", "14:00:00", "-1:00"):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    normalize_hhmm(raw)

    def test_field_name_appears_in_message(self) -> None:
        with self.assertRaises(ValueError) as caught:
            normalize_hhmm("99:99", field="Start time")
        self.assertIn("Start time", str(caught.exception))


if __name__ == "__main__":
    unittest.main()


# ============================================================
# SCHEDULE RULES (PRD 3) + METADATA PROMOTION
# ============================================================

import os  # noqa: E402

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from datetime import timedelta  # noqa: E402

from pydantic import ValidationError  # noqa: E402

from app.schemas.events import (  # noqa: E402
    EventCreateRequest,
    EventUpdateRequest,
    campus_now,
)
from app.services.event_fields import with_legacy_metadata  # noqa: E402


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



BASE = {"event_name": "Summit", "event_type": "Seminar", "location": "Hall"}


def offset_date(days: int) -> str:
    return (campus_now() + timedelta(days=days)).strftime("%Y-%m-%d")


def make(cls=EventCreateRequest, **overrides):
    return cls(**{**BASE, **overrides})


class SchedulePastTests(unittest.TestCase):
    def test_future_date_is_accepted(self) -> None:
        request = make(event_date=offset_date(7), start_time="09:00", end_time="17:00")
        self.assertEqual(request.start_time, "09:00")

    def test_past_date_is_rejected_on_create(self) -> None:
        with self.assertRaises(ValidationError) as caught:
            make(event_date=offset_date(-1))
        self.assertIn("past", str(caught.exception))

    def test_today_is_accepted(self) -> None:
        # The boundary: today is not "in the past".
        request = make(event_date=offset_date(0))
        self.assertEqual(request.event_date, offset_date(0))

    def test_past_time_today_is_rejected(self) -> None:
        now = campus_now()
        if now.hour == 0 and now.minute == 0:
            self.skipTest("no earlier time exists today at midnight")
        earlier = (now - timedelta(hours=1)).strftime("%H:%M")
        with self.assertRaises(ValidationError):
            make(event_date=offset_date(0), start_time=earlier, end_time="23:59")

    def test_draft_may_hold_a_past_date(self) -> None:
        # A draft is a scratchpad, not a commitment.
        request = make(event_date=offset_date(-30), save_as_draft=True)
        self.assertEqual(request.event_date, offset_date(-30))


class ScheduleOrderTests(unittest.TestCase):
    def test_end_must_follow_start(self) -> None:
        for start, end in (("17:00", "09:00"), ("10:00", "10:00")):
            with self.subTest(start=start, end=end):
                with self.assertRaises(ValidationError) as caught:
                    make(event_date=offset_date(3), start_time=start, end_time=end)
                self.assertIn("End time must be after start time", str(caught.exception))

    def test_order_is_checked_even_for_a_draft(self) -> None:
        # A reversed range is wrong whatever the event's state.
        with self.assertRaises(ValidationError):
            make(event_date=offset_date(3), start_time="17:00", end_time="09:00",
                 save_as_draft=True)

    def test_one_sided_range_is_allowed(self) -> None:
        self.assertIsNone(make(event_date=offset_date(3), start_time="09:00").end_time)


class UpdateExemptionTests(unittest.TestCase):
    """A rejected event whose date has lapsed must stay resubmittable."""

    def test_update_accepts_a_past_date(self) -> None:
        request = make(EventUpdateRequest, event_date=offset_date(-10))
        self.assertEqual(request.event_date, offset_date(-10))

    def test_update_still_enforces_time_order(self) -> None:
        with self.assertRaises(ValidationError):
            make(EventUpdateRequest, event_date=offset_date(-10),
                 start_time="17:00", end_time="09:00")


class PromotedFieldTests(unittest.TestCase):
    def test_contact_is_optional_and_normalised(self) -> None:
        self.assertIsNone(make(event_date=offset_date(3)).coordinator_contact)
        self.assertEqual(
            make(event_date=offset_date(3), coordinator_contact="+91 98765 43210")
            .coordinator_contact,
            "9876543210",
        )

    def test_times_are_padded(self) -> None:
        request = make(event_date=offset_date(3), start_time="9:5", end_time="17:0")
        self.assertEqual((request.start_time, request.end_time), ("09:05", "17:00"))


class LegacyMetadataTests(unittest.TestCase):
    BLOB = (
        'Body\n\n<!--CC_METADATA:{"startTime":"09:30","endTime":"16:45",'
        '"organizer":"Dr. Rajesh","contactInfo":"9876543210","department":"CSE"}-->'
    )

    def test_old_event_is_filled_from_the_blob(self) -> None:
        event = with_legacy_metadata({"description": self.BLOB})
        self.assertEqual(event["start_time"], "09:30")
        self.assertEqual(event["end_time"], "16:45")
        self.assertEqual(event["organizer"], "Dr. Rajesh")
        self.assertEqual(event["coordinator_contact"], "9876543210")

    def test_real_fields_win_over_a_stale_blob(self) -> None:
        event = with_legacy_metadata({
            "start_time": "11:00",
            "organizer": "Dr. New",
            "description": self.BLOB,
        })
        self.assertEqual(event["start_time"], "11:00")
        self.assertEqual(event["organizer"], "Dr. New")
        # The ones not set on the document still come from the blob.
        self.assertEqual(event["end_time"], "16:45")

    def test_event_without_a_blob_is_untouched(self) -> None:
        event = with_legacy_metadata({"description": "Just prose"})
        self.assertNotIn("start_time", event)

    def test_none_is_safe(self) -> None:
        self.assertIsNone(with_legacy_metadata(None))


class ResubmitLapsedEventTests(unittest.TestCase):
    """The router re-applies the past-date rule only to a date that moved.

    Without this, the schema exemption above would be pointless: a teacher
    whose rejected event has since lapsed could never resubmit it.
    """

    def setUp(self) -> None:
        from fastapi.testclient import TestClient

        from app.main import app
        from app.models.documents import new_event_document
        from tests.test_event_history import FakeEvents

        self.client = TestClient(app)
        self.store = FakeEvents()
        document = new_event_document(
            teacher_id="teacher1",
            event_name="Lapsed Summit",
            event_date=offset_date(-10),      # rejected, and the date has passed
            event_type="Seminar",
            location="Hall",
            description="Body",
            social_network_url=None,
            status="rejected",
        )
        result = self.store.insert_one(document)
        self.event_id = str(result.inserted_id)

    def patch(self, **overrides):
        from unittest.mock import patch as mock_patch

        payload = {
            "event_name": "Lapsed Summit",
            "event_date": offset_date(-10),
            "event_type": "Seminar",
            "location": "Hall",
            "description": "Body",
            **overrides,
        }
        with mock_patch(
            "app.routers.events.get_current_user",
            return_value={"id": "teacher1", "role": "teacher", "name": "T"},
        ), mock_patch("app.routers.events.events", self.store), \
                mock_patch("app.routers.events.announce_to_deans"), \
                mock_patch("app.routers.events.invalidate_report"):
            return self.client.patch(
                f"/teacher/events/{self.event_id}",
                json=payload,
                headers={"Authorization": "Bearer t"},
            )

    def test_resubmitting_an_unchanged_past_date_succeeds(self) -> None:
        response = self.patch()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["event"]["status"], "pending")

    def test_moving_the_date_further_into_the_past_is_rejected(self) -> None:
        response = self.patch(event_date=offset_date(-3))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("past", response.json()["detail"].lower())

    def test_moving_the_date_into_the_future_succeeds(self) -> None:
        response = self.patch(event_date=offset_date(14))
        self.assertEqual(response.status_code, 200, response.text)


class MultiDayEventTests(unittest.TestCase):
    """Events that run past midnight or over several days.

    Before `end_date` existed, the only rule was end_time > start_time, which
    made an 18:00-02:00 event impossible to express.
    """

    def test_same_day_still_requires_ordered_times(self) -> None:
        with self.assertRaises(ValidationError) as caught:
            make(event_date=offset_date(5), start_time="17:00", end_time="09:00")
        self.assertIn("single day", str(caught.exception))

    def test_overnight_event_is_allowed_across_two_days(self) -> None:
        request = make(
            event_date=offset_date(5),
            end_date=offset_date(6),
            start_time="18:00",
            end_time="02:00",
        )
        self.assertEqual(request.end_date, offset_date(6))

    def test_multi_day_event_over_several_days(self) -> None:
        request = make(
            event_date=offset_date(5),
            end_date=offset_date(8),
            start_time="09:00",
            end_time="17:00",
        )
        self.assertEqual(request.end_date, offset_date(8))

    def test_end_date_equal_to_start_normalises_to_none(self) -> None:
        # One representation for "same day", so nothing has to compare the two.
        request = make(
            event_date=offset_date(5),
            end_date=offset_date(5),
            start_time="09:00",
            end_time="17:00",
        )
        self.assertIsNone(request.end_date)

    def test_end_date_before_start_is_rejected(self) -> None:
        with self.assertRaises(ValidationError) as caught:
            make(event_date=offset_date(5), end_date=offset_date(4))
        self.assertIn("End date cannot be before", str(caught.exception))

    def test_absent_end_date_is_none(self) -> None:
        self.assertIsNone(make(event_date=offset_date(5)).end_date)

    def test_blank_end_date_is_none(self) -> None:
        # The form sends "" when the teacher picks "Same day".
        self.assertIsNone(make(event_date=offset_date(5), end_date="").end_date)

    def test_malformed_end_date_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            make(event_date=offset_date(5), end_date="15-10-2026")

    def test_a_draft_may_hold_any_range(self) -> None:
        request = make(
            event_date=offset_date(-10),
            end_date=offset_date(-5),
            save_as_draft=True,
        )
        self.assertEqual(request.end_date, offset_date(-5))

    def test_reversed_range_is_rejected_even_for_a_draft(self) -> None:
        with self.assertRaises(ValidationError):
            make(event_date=offset_date(5), end_date=offset_date(4), save_as_draft=True)


class DateRangeFormatTests(unittest.TestCase):
    def test_formats(self) -> None:
        from app.services.report_pdf import format_date_range

        cases = [
            (("2026-10-15", None), "15 October 2026"),
            (("2026-10-15", "2026-10-15"), "15 October 2026"),
            (("2026-10-15", "2026-10-17"), "15 - 17 October 2026"),
            (("2026-10-30", "2026-11-02"), "30 October 2026 - 2 November 2026"),
        ]
        for args, expected in cases:
            with self.subTest(args=args):
                self.assertEqual(format_date_range(*args), expected)
