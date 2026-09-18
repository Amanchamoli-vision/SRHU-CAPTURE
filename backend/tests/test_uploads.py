"""Upload validation and bookkeeping (B-2, B-14, B-29), against in-memory
collections: no database, GridFS or R2 is touched."""

from __future__ import annotations

import copy
import io
import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.storage_service import (  # noqa: E402
    content_disposition,
    read_upload,
    serving_policy,
)
from tests.test_event_history import EVENT_PAYLOAD, FakeEvents, NoUsers  # noqa: E402


TEACHER = {"id": str(ObjectId()), "name": "Meera", "email": "m@srhu.edu.in", "role": "teacher"}

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"\x00" * 64
DOCX = b"PK\x03\x04" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


class FakeCursor(list):
    def sort(self, key, direction=1):
        return FakeCursor(sorted(self, key=lambda d: d.get(key), reverse=direction == -1))


class FakeFiles:
    """event_media / event_documents."""

    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.fail_insert = False

    def _matches(self, doc, query):
        return all(doc.get(k) == v for k, v in query.items())

    def count_documents(self, query):
        return sum(1 for d in self.docs if self._matches(d, query))

    def insert_one(self, document):
        if self.fail_insert:
            raise RuntimeError("database down")
        document.setdefault("_id", ObjectId())
        self.docs.append(copy.deepcopy(document))
        return MagicMock(inserted_id=document["_id"])

    def find(self, query, *_args, **_kwargs):
        return FakeCursor(copy.deepcopy(d) for d in self.docs if self._matches(d, query))

    def delete_one(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._matches(d, query)]
        return MagicMock(deleted_count=before - len(self.docs))

    def find_one_and_delete(self, query):
        for d in self.docs:
            if self._matches(d, query):
                self.docs.remove(d)
                return d
        return None


class UploadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.events = FakeEvents()
        self.media = FakeFiles()
        self.documents = FakeFiles()
        self.deleted: list[dict] = []
        self.saved: list[dict] = []

        def fake_save(data, *, file_name, content_type, kind, event_id, teacher_id):
            file_id = str(ObjectId())
            self.saved.append({"content_type": content_type, "file_name": file_name, "size": len(data)})
            return {"storage": "gridfs", "object_key": None, "file_id": file_id, "url": f"/files/{file_id}"}

        self.patches = [
            patch("app.routers.events.events", self.events),
            patch("app.routers.events.event_media", self.media),
            patch("app.routers.events.event_documents", self.documents),
            patch("app.routers.events.event_reports", MagicMock()),
            patch("app.routers.events.notifications", MagicMock()),
            patch("app.routers.events.users", NoUsers()),
            patch("app.routers.events.get_current_user", lambda _auth: TEACHER),
            patch("app.routers.events.save_upload", side_effect=fake_save),
            patch("app.routers.events.delete_stored", side_effect=self.deleted.append),
        ]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

        created = self.client.post(
            "/teacher/events", json={**EVENT_PAYLOAD, "save_as_draft": True}, headers=self.auth
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.event_id = created.json()["event"]["id"]

    auth = {"Authorization": "Bearer teacher"}

    def upload(self, name, data, content_type, kind="media"):
        return self.client.post(
            f"/teacher/events/{self.event_id}/{kind}",
            files={"file": (name, io.BytesIO(data), content_type)},
            headers=self.auth,
        )

    # ---- B-2: type whitelist ------------------------------------------

    def test_svg_upload_is_rejected(self) -> None:
        response = self.upload("logo.svg", SVG, "image/svg+xml")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.saved, [])

    def test_svg_disguised_as_png_is_rejected(self) -> None:
        response = self.upload("logo.png", SVG, "image/png")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.saved, [])

    def test_extension_and_type_must_agree(self) -> None:
        self.assertEqual(self.upload("photo.png", PNG, "video/mp4").status_code, 400)
        self.assertEqual(self.upload("page.pdf", PDF, "text/html", kind="documents").status_code, 400)
        self.assertEqual(self.upload("page.html", PDF, "application/pdf", kind="documents").status_code, 400)

    def test_valid_photo_is_stored_with_the_canonical_type(self) -> None:
        response = self.upload("photo.JPG", JPEG, "image/jpeg")
        self.assertEqual(response.status_code, 201, response.text)
        media = response.json()["media"]
        self.assertEqual(media["media_type"], "image")
        self.assertEqual(media["content_type"], "image/jpeg")
        self.assertRegex(media["media_url"], r"/files/[0-9a-f]{24}\?exp=\d+&sig=[0-9a-f]{64}$")

    def test_document_with_generic_declared_type_is_accepted(self) -> None:
        response = self.upload("report.docx", DOCX, "application/octet-stream", kind="documents")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(
            self.saved[-1]["content_type"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    def test_pdf_must_look_like_a_pdf(self) -> None:
        response = self.upload("fake.pdf", b"<html><script>x</script></html>", "application/pdf", kind="documents")
        self.assertEqual(response.status_code, 400)

    # ---- B-14: per-event caps ------------------------------------------

    def test_photo_and_video_caps(self) -> None:
        for index in range(4):
            self.assertEqual(self.upload(f"p{index}.png", PNG, "image/png").status_code, 201)
        fifth = self.upload("p5.png", PNG, "image/png")
        self.assertEqual(fifth.status_code, 400)
        self.assertIn("4 photos", fifth.json()["detail"])

        for index in range(2):
            self.assertEqual(self.upload(f"v{index}.mp4", MP4, "video/mp4").status_code, 201)
        self.assertEqual(self.upload("v3.mp4", MP4, "video/mp4").status_code, 400)

    # ---- B-29: no orphans -----------------------------------------------

    def test_failed_insert_deletes_the_stored_file(self) -> None:
        self.media.fail_insert = True
        with self.assertRaises(RuntimeError):
            self.upload("photo.png", PNG, "image/png")
        self.assertEqual(len(self.deleted), 1)

    def test_event_deleted_during_upload_rolls_back(self) -> None:
        original = self.events.find_one

        def vanished(query, *args, **kwargs):
            # The post-insert re-check sees the event gone.
            if isinstance(query.get("status"), dict):
                return None
            return original(query, *args, **kwargs)

        with patch.object(self.events, "find_one", side_effect=vanished):
            response = self.upload("photo.png", PNG, "image/png")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.media.docs, [])
        self.assertEqual(len(self.deleted), 1)


class ReadUploadTests(unittest.TestCase):
    def test_stops_reading_past_the_cap(self) -> None:
        upload = MagicMock()
        upload.size = None
        upload.file = io.BytesIO(b"x" * (3 * 1024 * 1024))
        with self.assertRaises(HTTPException) as caught:
            read_upload(upload, max_bytes=1024 * 1024)
        self.assertEqual(caught.exception.status_code, 413)
        # Aborted after at most two 1 MB chunks, not the whole body.
        self.assertLessEqual(upload.file.tell(), 2 * 1024 * 1024)

    def test_declared_size_is_checked_first(self) -> None:
        upload = MagicMock()
        upload.size = 10 ** 10
        with self.assertRaises(HTTPException) as caught:
            read_upload(upload, max_bytes=1024)
        self.assertEqual(caught.exception.status_code, 413)
        upload.file.read.assert_not_called()


class ServingPolicyTests(unittest.TestCase):
    def test_policy(self) -> None:
        self.assertEqual(serving_policy("image/png"), ("image/png", "inline"))
        self.assertEqual(serving_policy("image/png", download=True), ("image/png", "attachment"))
        self.assertEqual(serving_policy("application/pdf"), ("application/pdf", "inline"))
        self.assertEqual(serving_policy("text/csv"), ("text/csv", "attachment"))
        self.assertEqual(serving_policy("image/svg+xml"), ("application/octet-stream", "attachment"))
        self.assertEqual(serving_policy("text/html"), ("application/octet-stream", "attachment"))
        self.assertEqual(serving_policy(None), ("application/octet-stream", "attachment"))

    def test_content_disposition_is_latin1_safe(self) -> None:
        value = content_disposition("attachment", "रिपोर्ट.pdf")
        value.encode("latin-1")
        self.assertIn('filename="download.pdf"', value)
        self.assertIn("filename*=UTF-8''", value)


if __name__ == "__main__":
    unittest.main()
