from __future__ import annotations

import os
import unittest
from unittest.mock import patch

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.report_pdf import (  # noqa: E402
    LOGO_PATH,
    approval_record,
    build_event_report_pdf,
    split_description,
    verbatim_markup,
)

TEACHER_TEXT = "Line one & <two>\n\n  Indented   with  gaps\nLast line"
META = '{"startTime":"09:30","endTime":"16:45","department":"CSE"}'


def approved_event(**overrides) -> dict:
    event = {
        "id": "6aac7ecbee2ad335979f1268",
        "event_name": "AI Workshop",
        "event_type": "Workshop",
        "event_date": "2026-10-15",
        "location": "Main Auditorium",
        "description": f"{TEACHER_TEXT}\n\n<!--CC_METADATA:{META}-->",
        "social_network_url": "https://example.com/post",
        "status": "approved",
        "history": [{"action": "approved", "actor_name": "Dr. Dean", "created_at": "2026-09-18T10:00:00+00:00"}],
    }
    event.update(overrides)
    return event


class DescriptionTests(unittest.TestCase):
    def test_teacher_text_is_returned_unchanged(self) -> None:
        text, meta = split_description(approved_event()["description"])
        self.assertEqual(text, TEACHER_TEXT)
        self.assertEqual(meta["department"], "CSE")

    def test_description_without_metadata(self) -> None:
        self.assertEqual(split_description("Just text")[0], "Just text")
        self.assertEqual(split_description(None), ("", {}))

    def test_markup_keeps_breaks_spaces_and_escapes(self) -> None:
        markup = verbatim_markup(TEACHER_TEXT)
        self.assertIn("&amp; &lt;two&gt;", markup)
        self.assertEqual(markup.count("<br/>"), 3)
        self.assertIn("<br/>&nbsp;&nbsp;Indented &nbsp;&nbsp;with &nbsp;gaps<br/>", markup)

    def test_approval_uses_latest_history_entry(self) -> None:
        self.assertEqual(approval_record(approved_event()), ("Dr. Dean", "18 September 2026"))
        self.assertEqual(approval_record(approved_event(history=[]))[0], "Dean")


class PdfTests(unittest.TestCase):
    def test_logo_asset_is_bundled(self) -> None:
        self.assertTrue(LOGO_PATH.is_file())

    def test_builds_a_pdf(self) -> None:
        pdf = build_event_report_pdf(approved_event(), {"name": "T", "email": "t@x.in"}, [], []).getvalue()
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn(b"/Image", pdf)  # the SRHU crest is embedded


class DownloadEndpointTests(unittest.TestCase):
    def test_dean_downloads_the_report(self) -> None:
        client = TestClient(app)
        with patch("app.routers.reports.get_current_user", return_value={"role": "dean"}), \
                patch("app.routers.reports.get_event", return_value=approved_event()), \
                patch("app.routers.reports.get_report", return_value={"event_id": "x"}), \
                patch("app.routers.reports.get_event_media", return_value=[]), \
                patch("app.routers.reports.get_event_documents", return_value=[]), \
                patch("app.routers.reports.get_teacher", return_value={"name": "T"}):
            response = client.get(
                "/dean/events/6aac7ecbee2ad335979f1268/report/download",
                headers={"Authorization": "Bearer t"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
