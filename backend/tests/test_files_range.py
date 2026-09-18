from __future__ import annotations

import io
import os
import time
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

# Provide the settings the app needs even when no .env is present.
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402
from gridfs.errors import NoFile  # noqa: E402

from app.main import app  # noqa: E402
from app.routers.files import parse_range  # noqa: E402
from app.services.storage_service import absolutize  # noqa: E402
from app.utils.file_signing import signed_file_path  # noqa: E402


# 1000 bytes whose value at every offset is predictable, so a slice can be
# checked byte for byte.
PAYLOAD = bytes(i % 251 for i in range(1000))
FILE_ID = ObjectId()


class FakeGridOut:
    """The slice of gridfs.GridOut the files router touches."""

    def __init__(self, data: bytes, filename: str = "clip.mp4", content_type: str = "video/mp4") -> None:
        self._buffer = io.BytesIO(data)
        self.length = len(data)
        self.filename = filename
        self.content_type = content_type
        self.closed = False

    def read(self, size: int = -1) -> bytes:
        return self._buffer.read(size)

    def seek(self, position: int) -> None:
        self._buffer.seek(position)

    def close(self) -> None:
        self.closed = True


class FakeFS:
    def __init__(self) -> None:
        self.opened: list[FakeGridOut] = []
        self.extra: dict = {}

    def get(self, object_id):
        if object_id in self.extra:
            grid_out = FakeGridOut(PAYLOAD, *self.extra[object_id])
        elif object_id == FILE_ID:
            grid_out = FakeGridOut(PAYLOAD)
        else:
            raise NoFile()
        self.opened.append(grid_out)
        return grid_out


def signed(file_id) -> str:
    return signed_file_path(file_id)


class FilesRangeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fs = FakeFS()
        patcher = patch("app.routers.files.fs", self.fs)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.url = signed(FILE_ID)

    def test_whole_file_advertises_range_support(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, PAYLOAD)
        self.assertEqual(response.headers["accept-ranges"], "bytes")
        self.assertEqual(response.headers["content-length"], "1000")
        self.assertTrue(response.headers["content-type"].startswith("video/mp4"))
        self.assertTrue(response.headers["content-disposition"].startswith("inline"))

    def test_bounded_range_returns_exactly_those_bytes(self):
        response = self.client.get(self.url, headers={"Range": "bytes=100-199"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PAYLOAD[100:200])
        self.assertEqual(response.headers["content-range"], "bytes 100-199/1000")
        self.assertEqual(response.headers["content-length"], "100")

    def test_open_ended_range_runs_to_the_end(self):
        # What a <video> element sends first: "bytes=0-".
        response = self.client.get(self.url, headers={"Range": "bytes=0-"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PAYLOAD)
        self.assertEqual(response.headers["content-range"], "bytes 0-999/1000")

    def test_seek_into_the_middle(self):
        response = self.client.get(self.url, headers={"Range": "bytes=900-"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PAYLOAD[900:])
        self.assertEqual(response.headers["content-range"], "bytes 900-999/1000")

    def test_suffix_range_returns_the_tail(self):
        response = self.client.get(self.url, headers={"Range": "bytes=-50"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PAYLOAD[-50:])
        self.assertEqual(response.headers["content-range"], "bytes 950-999/1000")

    def test_end_past_the_file_is_clamped(self):
        response = self.client.get(self.url, headers={"Range": "bytes=990-5000"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PAYLOAD[990:])
        self.assertEqual(response.headers["content-range"], "bytes 990-999/1000")

    def test_start_past_the_end_is_416_and_closes_the_file(self):
        response = self.client.get(self.url, headers={"Range": "bytes=1000-"})
        self.assertEqual(response.status_code, 416)
        self.assertEqual(response.headers["content-range"], "bytes */1000")
        self.assertTrue(all(g.closed for g in self.fs.opened))

    def test_malformed_or_multi_range_falls_back_to_the_whole_file(self):
        for header in ("items=0-10", "bytes=abc", "bytes=0-10,20-30", "bytes=-"):
            with self.subTest(header=header):
                response = self.client.get(self.url, headers={"Range": header})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, PAYLOAD)

    def test_download_flag_still_sets_attachment(self):
        # `download` is not part of the signature, so it can be added to any link.
        response = self.client.get(f"{self.url}&download=true", headers={"Range": "bytes=0-9"})
        self.assertEqual(response.status_code, 206)
        self.assertTrue(response.headers["content-disposition"].startswith("attachment"))

    def test_unknown_file_is_404(self):
        response = self.client.get(signed(ObjectId()))
        self.assertEqual(response.status_code, 404)


class FileSigningTests(unittest.TestCase):
    """B-1: /files/{id} serves only to holders of a valid, unexpired link."""

    def setUp(self) -> None:
        self.fs = FakeFS()
        patcher = patch("app.routers.files.fs", self.fs)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_unsigned_link_is_403(self):
        response = self.client.get(f"/files/{FILE_ID}")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "This file link has expired or is invalid.")
        self.assertEqual(self.fs.opened, [])  # refused before touching storage

    def test_tampered_signature_or_expiry_is_403(self):
        url = signed(FILE_ID)
        path, query = url.split("?")
        params = dict(item.split("=") for item in query.split("&"))

        bad_sig = self.client.get(path, params={"exp": params["exp"], "sig": "0" * 64})
        self.assertEqual(bad_sig.status_code, 403)

        longer = self.client.get(path, params={"exp": int(params["exp"]) + 3600, "sig": params["sig"]})
        self.assertEqual(longer.status_code, 403)

        other_file = self.client.get(f"/files/{ObjectId()}", params=params)
        self.assertEqual(other_file.status_code, 403)

    def test_expired_link_is_403(self):
        old = time.time() - 10 * 24 * 3600
        url = signed_file_path(FILE_ID, now=old)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_signed_link_works_and_is_privately_cached(self):
        response = self.client.get(signed(FILE_ID))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, PAYLOAD)
        cache = response.headers["cache-control"]
        self.assertTrue(cache.startswith("private, max-age="), cache)
        self.assertLessEqual(int(cache.rsplit("=", 1)[1]), 3600)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_upper_case_id_in_path_still_verifies(self):
        url = signed(FILE_ID)
        path, query = url.split("?")
        response = self.client.get(f"/files/{str(FILE_ID).upper()}?{query}")
        self.assertEqual(response.status_code, 200)

    def test_legacy_svg_is_served_as_an_opaque_attachment(self):
        svg_id = ObjectId()
        self.fs.extra[svg_id] = ("x.svg", "image/svg+xml")
        response = self.client.get(signed(svg_id))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("application/octet-stream"))
        self.assertTrue(response.headers["content-disposition"].startswith("attachment"))
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_documents_are_forced_to_download_but_pdf_may_open_inline(self):
        doc_id, pdf_id = ObjectId(), ObjectId()
        self.fs.extra[doc_id] = ("notes.txt", "text/plain")
        self.fs.extra[pdf_id] = ("brochure.pdf", "application/pdf")
        self.assertTrue(
            self.client.get(signed(doc_id)).headers["content-disposition"].startswith("attachment")
        )
        self.assertTrue(
            self.client.get(signed(pdf_id)).headers["content-disposition"].startswith("inline")
        )

    def test_unicode_file_name_uses_rfc5987(self):
        hindi_id = ObjectId()
        self.fs.extra[hindi_id] = ("कार्यक्रम.pdf", "application/pdf")
        response = self.client.get(signed(hindi_id))
        self.assertEqual(response.status_code, 200)
        disposition = response.headers["content-disposition"]
        self.assertIn('filename="', disposition)
        self.assertIn("filename*=UTF-8''%E0%A4", disposition)

    def test_absolutize_signs_gridfs_urls(self):
        request = MagicMock()
        request.base_url = "http://api.test/"
        record = {"file_id": str(FILE_ID), "media_url": f"/files/{FILE_ID}"}
        url = absolutize(request, record, "media_url")["media_url"]
        self.assertRegex(url, rf"^http://api\.test/files/{FILE_ID}\?exp=\d+&sig=[0-9a-f]{{64}}$")
        self.assertEqual(self.client.get(url.replace("http://api.test", "")).status_code, 200)


class ParseRangeTests(unittest.TestCase):
    def test_zero_length_suffix_is_unsatisfiable(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as caught:
            parse_range("bytes=-0", 1000)
        self.assertEqual(caught.exception.status_code, 416)

    def test_reversed_range_is_unsatisfiable(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException):
            parse_range("bytes=500-100", 1000)

    def test_no_header_means_whole_file(self):
        self.assertIsNone(parse_range(None, 1000))


if __name__ == "__main__":
    unittest.main()
