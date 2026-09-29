"""Report download names: the event title, safe on every file system."""

import unittest

from app.utils.file_names import MAX_STEM_LENGTH, report_file_name


class ReportFileNameTests(unittest.TestCase):
    def test_uses_the_event_title(self) -> None:
        self.assertEqual(report_file_name("IEEE Conference"), "IEEE Conference.pdf")

    def test_invalid_characters_are_replaced_and_spaces_collapsed(self) -> None:
        self.assertEqual(report_file_name('AI: "Ethics" / Law? <2026>|*'), "AI Ethics Law 2026.pdf")
        self.assertEqual(report_file_name("Line\nbreak\tand\x00null"), "Line break and null.pdf")

    def test_extension_appears_once(self) -> None:
        self.assertEqual(report_file_name("Budget.pdf"), "Budget.pdf")
        self.assertEqual(report_file_name("Budget.PDF"), "Budget.pdf")

    def test_long_titles_are_cut_at_a_word(self) -> None:
        title = "International Conference on Advances in Computing Communication and Sustainable Engineering Practices 2026"
        name = report_file_name(title)
        stem = name[:-4]
        self.assertTrue(name.endswith(".pdf"))
        self.assertLessEqual(len(stem), MAX_STEM_LENGTH)
        self.assertTrue(title.startswith(stem))
        self.assertFalse(stem.endswith(" "))
        self.assertIn(title[len(stem)], " ")  # cut between words, not inside one

    def test_one_very_long_word_is_cut_hard(self) -> None:
        self.assertEqual(len(report_file_name("x" * 300)), MAX_STEM_LENGTH + 4)

    def test_empty_or_unusable_titles_fall_back(self) -> None:
        for title in (None, "", "   ", "???", "..."):
            with self.subTest(title=title):
                self.assertEqual(report_file_name(title), "Event Report.pdf")

    def test_reserved_windows_names(self) -> None:
        self.assertEqual(report_file_name("CON"), "CON Report.pdf")
        self.assertEqual(report_file_name("com1"), "com1 Report.pdf")

    def test_non_ascii_titles_are_kept(self) -> None:
        self.assertEqual(report_file_name("वार्षिक खेल दिवस"), "वार्षिक खेल दिवस.pdf")

    def test_trailing_dots_and_spaces_go(self) -> None:
        self.assertEqual(report_file_name(" Annual Day. "), "Annual Day.pdf")


class ExposedHeaderTests(unittest.TestCase):
    def test_the_page_may_read_the_download_name(self) -> None:
        # Cross-origin, the browser hides Content-Disposition unless exposed.
        from fastapi.testclient import TestClient

        from app.config import settings
        from app.main import app

        origin = settings.allowed_cors_origins[0]
        response = TestClient(app).get("/", headers={"Origin": origin})
        self.assertIn("content-disposition", response.headers.get("access-control-expose-headers", "").lower())


if __name__ == "__main__":
    unittest.main()
