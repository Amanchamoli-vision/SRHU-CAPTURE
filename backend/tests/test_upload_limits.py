from __future__ import annotations

import io
import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi.testclient import TestClient

# Ensure test secrets are set before importing app
os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from app.main import app
from app.services.upload_config_service import DEFAULT_UPLOAD_LIMITS

SUPERADMIN = {
    "id": str(ObjectId()),
    "name": "Super Admin",
    "email": "superadmin@srhu.edu.in",
    "role": "superadmin",
}

TEACHER = {
    "id": str(ObjectId()),
    "name": "Teacher Meera",
    "email": "meera@srhu.edu.in",
    "role": "teacher",
}

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64


class FakeUploadConfig:
    def __init__(self) -> None:
        self.doc: dict | None = None

    def find_one(self, query, *_args, **_kwargs):
        if self.doc and query.get("key") == "upload_limits":
            return dict(self.doc)
        return None

    def update_one(self, query, update, upsert=False):
        if query.get("key") == "upload_limits":
            if self.doc is None and upsert:
                self.doc = {}
            if self.doc is not None and "$set" in update:
                self.doc.update(update["$set"])
        return MagicMock()


class UploadLimitsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.fake_config = FakeUploadConfig()

        self.patches = [
            patch("app.database.upload_config", self.fake_config),
            patch("app.services.upload_config_service.upload_config", self.fake_config),
            patch("app.routers.superadmin.upload_config", self.fake_config),
        ]
        for p in self.patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

    def test_public_upload_limits_returns_defaults_when_empty(self) -> None:
        response = self.client.get("/upload-limits")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["limits"]["max_photos_per_event"], 10)
        self.assertEqual(data["limits"]["max_photo_size_mb"], 20)
        self.assertEqual(data["limits"]["max_video_total_mb"], 200)

    def test_superadmin_upload_limits_requires_superadmin(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=TEACHER):
            response = self.client.get(
                "/superadmin/upload-limits", headers={"Authorization": "Bearer t"}
            )
        self.assertEqual(response.status_code, 403)

    def test_superadmin_can_fetch_upload_limits(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN):
            response = self.client.get(
                "/superadmin/upload-limits", headers={"Authorization": "Bearer s"}
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["limits"]["max_photos_per_event"], 10)
        self.assertIn("defaults", data)

    def test_superadmin_update_validation_rejects_invalid_values(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN):
            # 0 photos allowed
            r1 = self.client.put(
                "/superadmin/upload-limits",
                json={
                    "max_photos_per_event": 0,
                    "max_photo_size_mb": 20,
                    "max_video_size_mb": 50,
                    "max_video_total_mb": 100,
                },
                headers={"Authorization": "Bearer s"},
            )
            self.assertEqual(r1.status_code, 422)

            # photo total < photo single
            r2 = self.client.put(
                "/superadmin/upload-limits",
                json={
                    "max_photos_per_event": 5,
                    "max_photo_size_mb": 20,
                    "max_photo_total_mb": 10,
                    "max_video_size_mb": 50,
                    "max_video_total_mb": 100,
                },
                headers={"Authorization": "Bearer s"},
            )
            self.assertEqual(r2.status_code, 422)

            # video single > video total
            r3 = self.client.put(
                "/superadmin/upload-limits",
                json={
                    "max_photos_per_event": 5,
                    "max_photo_size_mb": 10,
                    "max_video_size_mb": 150,
                    "max_video_total_mb": 100,
                },
                headers={"Authorization": "Bearer s"},
            )
            self.assertEqual(r3.status_code, 422)

    def test_superadmin_can_update_and_reset_limits(self) -> None:
        with patch("app.utils.auth.get_current_user", return_value=SUPERADMIN):
            payload = {
                "max_photos_per_event": 5,
                "max_photo_size_mb": 15,
                "max_photo_total_mb": 50,
                "max_videos_per_event": 3,
                "max_video_size_mb": 80,
                "max_video_total_mb": 120,
            }
            res = self.client.put(
                "/superadmin/upload-limits",
                json=payload,
                headers={"Authorization": "Bearer s"},
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["limits"]["max_photos_per_event"], 5)
            self.assertEqual(res.json()["limits"]["max_photo_size_mb"], 15)

            # Check public limits now reflects the update
            pub = self.client.get("/upload-limits")
            self.assertEqual(pub.json()["limits"]["max_photos_per_event"], 5)
            self.assertEqual(pub.json()["limits"]["max_videos_per_event"], 3)

            # Reset back to defaults
            reset_res = self.client.post(
                "/superadmin/upload-limits/reset",
                headers={"Authorization": "Bearer s"},
            )
            self.assertEqual(reset_res.status_code, 200)
            self.assertEqual(reset_res.json()["limits"]["max_photos_per_event"], 10)
