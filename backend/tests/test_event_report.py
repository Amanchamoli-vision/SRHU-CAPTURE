from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import quote

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


    def test_long_description_runs_over_several_pages(self) -> None:
        # B-3: ~20,000 characters used to raise LayoutError (one-cell table).
        paragraph = ("The workshop covered supervised learning in depth. " * 40).strip()
        long_text = "\n\n".join([paragraph] * 8)[:20000]
        one_line = "word " * 4000  # a single line with no breaks at all
        for description in (long_text, one_line):
            with self.subTest(lines=description.count("\n")):
                pdf = build_event_report_pdf(
                    approved_event(description=description), {"name": "T"}, [], []
                ).getvalue()
                self.assertTrue(pdf.startswith(b"%PDF"))
                self.assertGreater(pdf.count(b"/Type /Page\n") + pdf.count(b"/Type /Page "), 1)

    def test_numeric_and_odd_metadata_values_do_not_crash(self) -> None:
        # B-12: {"startTime": 930} raised AttributeError on .strip().
        meta = '{"startTime":930,"endTime":1645.5,"department":["x"],"organizer":null,"contactInfo":true}'
        event = approved_event(description=f"Text\n<!--CC_METADATA:{meta}-->")
        _, parsed = split_description(event["description"])
        self.assertEqual(parsed, {"startTime": "930", "endTime": "1645.5"})
        pdf = build_event_report_pdf(event, {"name": "T"}, [], []).getvalue()
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_non_http_social_link_is_not_clickable(self) -> None:
        pdf = build_event_report_pdf(
            approved_event(social_network_url="javascript:alert(1)"), {"name": "T"}, [], []
        ).getvalue()
        self.assertNotIn(b"/URI", pdf)  # no link annotation at all

        linked = build_event_report_pdf(approved_event(), {"name": "T"}, [], []).getvalue()
        self.assertIn(b"/URI", linked)


    def test_missing_social_link_renders_not_provided(self) -> None:
        # PRD 17: the link is optional, so its absence must not blank the row
        # or crash the build -- it reads "Not provided" and is not a link.
        pdf = build_event_report_pdf(
            approved_event(social_network_url=None), {"name": "T"}, [], []
        ).getvalue()
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertNotIn(b"/URI", pdf)


def download(event: dict):
    client = TestClient(app)
    with patch("app.routers.reports.get_current_user", return_value={"role": "dean"}), \
            patch("app.routers.reports.get_event", return_value=event), \
            patch("app.routers.reports.get_report", return_value={"event_id": "x"}), \
            patch("app.routers.reports.get_event_media", return_value=[]), \
            patch("app.routers.reports.get_event_documents", return_value=[]), \
            patch("app.routers.reports.get_teacher", return_value={"name": "T"}):
        return client.get(
            "/dean/events/6aac7ecbee2ad335979f1268/report/download",
            headers={"Authorization": "Bearer t"},
        )


class DownloadEndpointTests(unittest.TestCase):
    def test_dean_downloads_the_report(self) -> None:
        response = download(approved_event())

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn('filename="AI_Workshop_Report.pdf"', response.headers["content-disposition"])

    def test_hindi_event_name_download_header(self) -> None:
        # B-11: a Devanagari name raised UnicodeEncodeError in the header.
        response = download(approved_event(event_name="वार्षिक खेल दिवस"))
        self.assertEqual(response.status_code, 200, response.text)
        disposition = response.headers["content-disposition"]
        disposition.encode("latin-1")  # the header must be encodable
        self.assertTrue(disposition.startswith("attachment;"))
        self.assertIn('filename="', disposition)
        fallback = disposition.split('filename="')[1].split('"')[0]
        self.assertTrue(fallback.isascii() and fallback.endswith(".pdf"), fallback)
        self.assertIn(
            "filename*=UTF-8''" + quote("वार्षिक खेल दिवस_Report.pdf", safe=""), disposition
        )

    def test_numeric_start_time_downloads(self) -> None:
        event = approved_event(description='Text\n<!--CC_METADATA:{"startTime":930}-->')
        self.assertEqual(download(event).status_code, 200)

    def test_download_without_social_link(self) -> None:
        # PRD 17: previously 400 "Social Network Link is required".
        for missing in (None, "", "   "):
            with self.subTest(social=missing):
                response = download(approved_event(social_network_url=missing))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(response.content.startswith(b"%PDF"))


class GenerateWithoutSocialLinkTests(unittest.TestCase):
    """PRD 17: a missing Social Network Link no longer blocks generation."""

    def test_generate_succeeds_without_social_link(self) -> None:
        client = TestClient(app)
        reports = MagicMock()
        with patch("app.routers.reports.get_current_user", return_value={"role": "dean"}), \
                patch("app.routers.reports.get_event",
                      return_value=approved_event(social_network_url=None)), \
                patch("app.routers.reports.get_event_media", return_value=[]), \
                patch("app.routers.reports.get_event_documents", return_value=[]), \
                patch("app.routers.reports.get_teacher", return_value={"name": "T"}), \
                patch("app.routers.reports.event_reports", reports):
            response = client.post(
                "/dean/events/6aac7ecbee2ad335979f1268/generate-report",
                headers={"Authorization": "Bearer t"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(reports.replace_one.called)

    def test_generated_body_says_not_provided(self) -> None:
        from app.routers.reports import build_report_content

        body = build_report_content(
            approved_event(social_network_url=None), {"name": "T", "email": "t@x"}, [], []
        )
        self.assertIn("Not provided", body)


class DraftVisibilityTests(unittest.TestCase):
    """B-28: report endpoints treat a draft as missing, like GET /dean/events/{id}."""

    def test_report_status_and_documents_hide_drafts(self) -> None:
        from bson import ObjectId

        draft_id = ObjectId()
        fake_events = MagicMock()
        fake_events.find_one.return_value = {"_id": draft_id, "status": "draft"}
        client = TestClient(app)
        with patch("app.routers.reports.get_current_user", return_value={"role": "dean"}), \
                patch("app.routers.reports.check_event_viewer"), \
                patch("app.routers.reports.events", fake_events):
            for path in ("report-status", "documents"):
                with self.subTest(path=path):
                    response = client.get(
                        f"/dean/events/{draft_id}/{path}", headers={"Authorization": "Bearer t"}
                    )
                    self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
