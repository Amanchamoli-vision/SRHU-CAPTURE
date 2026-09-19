"""Super Admin configurable photo and video upload limits.

Covers the three things that have to hold for the feature to be worth having:
the console can read and write the configuration, an invalid value never
reaches the database, and a saved limit is what the teacher's next upload is
measured against -- without a redeploy.
"""

from __future__ import annotations

import copy
import io
import os
import unittest
from unittest.mock import MagicMock, patch

from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import upload_limits as upload_limits_service  # noqa: E402
from tests.fake_app_settings import FakeAppSettings  # noqa: E402
from tests.test_event_history import EVENT_PAYLOAD, FakeEvents, NoUsers  # noqa: E402
from tests.test_uploads import MP4, PNG, FakeFiles  # noqa: E402


_event_types_patcher = None


def setUpModule() -> None:
    global _event_types_patcher
    from tests.fake_event_types import FakeEventTypes

    _event_types_patcher = patch(
        "app.services.event_types.event_types", FakeEventTypes()
    )
    _event_types_patcher.start()


def tearDownModule() -> None:
    if _event_types_patcher is not None:
        _event_types_patcher.stop()


SUPERADMIN = {
    "id": str(ObjectId()),
    "name": "Root",
    "email": "root@srhu.edu.in",
    "role": "superadmin",
}
TEACHER = {
    "id": str(ObjectId()),
    "name": "Meera",
    "email": "m@srhu.edu.in",
    "role": "teacher",
}

AUTH = {"Authorization": "Bearer token"}

# A complete, valid payload. Tests override one field at a time from it, so a
# rejection can only be about the field under test.
VALID = {
    "max_photos_per_event": 15,
    "max_photo_size_mb": 25,
    "max_photo_total_mb": 300,
    "max_videos_per_event": 5,
    "max_video_size_mb": 150,
    "max_video_total_mb": 400,
}


def payload(**overrides) -> dict:
    return {**VALID, **overrides}


class DefaultsTests(unittest.TestCase):
    """With nothing saved, the limits are the values that were hardcoded."""

    def test_defaults_match_the_previously_hardcoded_values(self) -> None:
        with patch.object(upload_limits_service, "app_settings", FakeAppSettings()):
            limits = upload_limits_service.get_upload_limits()

        self.assertEqual(limits["max_photos_per_event"], 10)
        self.assertEqual(limits["max_photo_size_mb"], 20)
        self.assertEqual(limits["max_video_total_mb"], 200)
        # Neither of these existed before, so "off" is what preserves the
        # previous behaviour.
        self.assertIsNone(limits["max_photo_total_mb"])
        self.assertIsNone(limits["max_videos_per_event"])
        # A single video may still fill the whole event budget.
        self.assertEqual(limits["max_video_size_mb"], 200)

    def test_a_partial_row_falls_back_field_by_field(self) -> None:
        store = FakeAppSettings([{"_id": "upload_limits", "max_photos_per_event": 3}])

        with patch.object(upload_limits_service, "app_settings", store):
            limits = upload_limits_service.get_upload_limits()

        self.assertEqual(limits["max_photos_per_event"], 3)
        self.assertEqual(limits["max_photo_size_mb"], 20)

    def test_a_nonsense_stored_value_falls_back_rather_than_raising(self) -> None:
        # A row hand-edited in the mongo shell must not be able to take the
        # upload endpoints down.
        store = FakeAppSettings([{
            "_id": "upload_limits",
            "max_photos_per_event": -4,
            "max_photo_size_mb": "twenty",
            "max_video_total_mb": None,
        }])

        with patch.object(upload_limits_service, "app_settings", store):
            limits = upload_limits_service.get_upload_limits()

        self.assertEqual(limits["max_photos_per_event"], 10)
        self.assertEqual(limits["max_photo_size_mb"], 20)
        # None is "no limit" only for the nullable fields.
        self.assertEqual(limits["max_video_total_mb"], 200)

    def test_an_unreadable_database_degrades_to_the_defaults(self) -> None:
        from pymongo.errors import PyMongoError

        broken = MagicMock()
        broken.find_one.side_effect = PyMongoError("no primary")

        with patch.object(upload_limits_service, "app_settings", broken):
            limits = upload_limits_service.get_upload_limits()

        self.assertEqual(limits, upload_limits_service.default_upload_limits())


class SuperadminEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.store = FakeAppSettings()
        patcher = patch.object(upload_limits_service, "app_settings", self.store)
        patcher.start()
        self.addCleanup(patcher.stop)

    def as_superadmin(self):
        return patch("app.utils.auth.get_current_user", return_value=SUPERADMIN)

    def test_get_returns_limits_defaults_and_bounds(self) -> None:
        with self.as_superadmin():
            response = self.client.get("/superadmin/upload-limits", headers=AUTH)

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["is_default"])
        self.assertEqual(body["limits"]["max_photos_per_event"], 10)
        self.assertEqual(body["defaults"]["max_photos_per_event"], 10)
        # The console renders its min/max hints from these.
        self.assertEqual(body["bounds"]["max_photo_size_mb"]["min"], 1)
        self.assertFalse(body["bounds"]["max_photo_size_mb"]["nullable"])
        self.assertTrue(body["bounds"]["max_photo_total_mb"]["nullable"])

    def test_put_persists_and_is_read_back(self) -> None:
        with self.as_superadmin():
            saved = self.client.put(
                "/superadmin/upload-limits", json=payload(), headers=AUTH
            )
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertFalse(saved.json()["is_default"])
            self.assertEqual(saved.json()["limits"], VALID)

            again = self.client.get("/superadmin/upload-limits", headers=AUTH)

        self.assertEqual(again.json()["limits"], VALID)
        self.assertEqual(again.json()["updated_by"], SUPERADMIN["id"])
        self.assertIsNotNone(again.json()["updated_at"])

    def test_saving_twice_leaves_one_row(self) -> None:
        with self.as_superadmin():
            self.client.put("/superadmin/upload-limits", json=payload(), headers=AUTH)
            self.client.put(
                "/superadmin/upload-limits",
                json=payload(max_photos_per_event=7),
                headers=AUTH,
            )

        self.assertEqual(len(self.store.docs), 1)
        self.assertEqual(self.store.docs[0]["max_photos_per_event"], 7)

    def test_null_clears_the_optional_caps(self) -> None:
        with self.as_superadmin():
            response = self.client.put(
                "/superadmin/upload-limits",
                json=payload(max_photo_total_mb=None, max_videos_per_event=None),
                headers=AUTH,
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["limits"]["max_photo_total_mb"])
        self.assertIsNone(response.json()["limits"]["max_videos_per_event"])

    # ---- validation -----------------------------------------------------

    def test_zero_negative_and_oversized_values_are_rejected(self) -> None:
        cases = [
            ("max_photos_per_event", 0),
            ("max_photos_per_event", -1),
            ("max_photos_per_event", 5000),
            ("max_photo_size_mb", 0),
            ("max_photo_size_mb", -20),
            ("max_video_size_mb", 0),
            ("max_video_total_mb", 0),
            ("max_video_total_mb", 10**9),
            ("max_photo_total_mb", 0),
            ("max_videos_per_event", 0),
        ]
        with self.as_superadmin():
            for field, value in cases:
                with self.subTest(field=field, value=value):
                    response = self.client.put(
                        "/superadmin/upload-limits",
                        json=payload(**{field: value}),
                        headers=AUTH,
                    )
                    self.assertEqual(response.status_code, 422, response.text)

        self.assertEqual(self.store.docs, [], "nothing invalid may be persisted")

    def test_required_fields_may_not_be_null(self) -> None:
        with self.as_superadmin():
            response = self.client.put(
                "/superadmin/upload-limits",
                json=payload(max_video_total_mb=None),
                headers=AUTH,
            )
        self.assertEqual(response.status_code, 422)

    def test_per_file_cap_may_not_exceed_the_combined_budget(self) -> None:
        with self.as_superadmin():
            photos = self.client.put(
                "/superadmin/upload-limits",
                json=payload(max_photo_size_mb=400, max_photo_total_mb=100),
                headers=AUTH,
            )
            videos = self.client.put(
                "/superadmin/upload-limits",
                json=payload(max_video_size_mb=500, max_video_total_mb=200),
                headers=AUTH,
            )

        self.assertEqual(photos.status_code, 422)
        self.assertIn("per photo", photos.text)
        self.assertEqual(videos.status_code, 422)
        self.assertIn("per video", videos.text)

    def test_a_per_file_photo_cap_above_an_absent_total_is_fine(self) -> None:
        # No combined photo budget means there is nothing to contradict.
        with self.as_superadmin():
            response = self.client.put(
                "/superadmin/upload-limits",
                json=payload(max_photo_size_mb=400, max_photo_total_mb=None),
                headers=AUTH,
            )
        self.assertEqual(response.status_code, 200, response.text)

    # ---- access ---------------------------------------------------------

    def test_other_roles_cannot_read_or_write_the_configuration(self) -> None:
        for role in ("teacher", "dean"):
            with self.subTest(role=role), patch(
                "app.utils.auth.get_current_user",
                return_value={**TEACHER, "role": role},
            ):
                self.assertEqual(
                    self.client.get("/superadmin/upload-limits", headers=AUTH).status_code,
                    403,
                )
                self.assertEqual(
                    self.client.put(
                        "/superadmin/upload-limits", json=payload(), headers=AUTH
                    ).status_code,
                    403,
                )

        self.assertEqual(self.store.docs, [])

    def test_any_signed_in_role_may_read_the_effective_limits(self) -> None:
        with self.as_superadmin():
            self.client.put("/superadmin/upload-limits", json=payload(), headers=AUTH)

        for role in ("teacher", "dean", "superadmin"):
            with self.subTest(role=role), patch(
                "app.routers.directory.get_current_user",
                return_value={**TEACHER, "role": role},
            ):
                response = self.client.get("/upload-limits", headers=AUTH)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["limits"], VALID)


class ConfiguredLimitsAreEnforcedTests(unittest.TestCase):
    """A saved limit is what the next upload is measured against.

    The same wiring as `tests/test_uploads.py`, but with the settings row
    populated instead of empty -- this is the part that proves the caps are no
    longer read from the constants.
    """

    auth = {"Authorization": "Bearer teacher"}

    def setUp(self) -> None:
        self.client = TestClient(app)
        self.events = FakeEvents()
        self.media = FakeFiles()
        self.settings_store = FakeAppSettings()

        def fake_save(data, *, file_name, content_type, kind, event_id, teacher_id):
            payload_bytes = data if isinstance(data, bytes) else data.read()
            file_id = str(ObjectId())
            return {
                "storage": "gridfs",
                "object_key": None,
                "file_id": file_id,
                "url": f"/files/{file_id}",
                "size": len(payload_bytes),
            }

        self.patches = [
            patch("app.routers.events.events", self.events),
            patch("app.routers.events.event_media", self.media),
            patch("app.routers.events.event_documents", FakeFiles()),
            patch("app.routers.events.event_reports", MagicMock()),
            patch("app.routers.events.notifications", MagicMock()),
            patch("app.routers.events.users", NoUsers()),
            patch("app.routers.events.get_current_user", lambda _auth: TEACHER),
            patch("app.routers.events.save_upload", side_effect=fake_save),
            patch("app.routers.events.delete_stored", MagicMock()),
            patch.object(upload_limits_service, "app_settings", self.settings_store),
        ]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

        created = self.client.post(
            "/teacher/events",
            json={**EVENT_PAYLOAD, "save_as_draft": True},
            headers=self.auth,
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.event_id = created.json()["event"]["id"]

    def configure(self, **overrides) -> None:
        self.settings_store.docs = [{"_id": "upload_limits", **payload(**overrides)}]

    def upload(self, name, data, content_type):
        return self.client.post(
            f"/teacher/events/{self.event_id}/media",
            files={"file": (name, io.BytesIO(data), content_type)},
            headers=self.auth,
        )

    def stub_stored(self, media_type: str, file_size: int) -> None:
        """Pretend the event already holds this much of that kind."""
        self.media.docs.append({
            "_id": ObjectId(),
            "event_id": self.event_id,
            "media_type": media_type,
            "file_size": file_size,
        })

    def test_configured_photo_count_replaces_the_old_ten(self) -> None:
        self.configure(max_photos_per_event=2)

        self.assertEqual(self.upload("a.png", PNG, "image/png").status_code, 201)
        self.assertEqual(self.upload("b.png", PNG, "image/png").status_code, 201)
        third = self.upload("c.png", PNG, "image/png")

        self.assertEqual(third.status_code, 400)
        self.assertIn("at most 2 photos", third.json()["detail"])

    def test_raising_the_photo_count_takes_effect_without_a_restart(self) -> None:
        self.configure(max_photos_per_event=1)
        self.assertEqual(self.upload("a.png", PNG, "image/png").status_code, 201)
        self.assertEqual(self.upload("b.png", PNG, "image/png").status_code, 400)

        # Exactly what a Super Admin raising the cap in the console does.
        self.configure(max_photos_per_event=3)

        self.assertEqual(self.upload("b.png", PNG, "image/png").status_code, 201)

    def test_configured_photo_size_is_the_per_file_ceiling(self) -> None:
        self.configure(max_photo_size_mb=1, max_photo_total_mb=10)

        response = self.upload("huge.png", PNG + b"\x00" * (1024 * 1024), "image/png")

        self.assertEqual(response.status_code, 413)
        self.assertIn("1 MB", response.json()["detail"])

    def test_configured_photo_total_caps_the_combined_size(self) -> None:
        # Off by default; switching it on is the new capability.
        self.configure(max_photo_size_mb=5, max_photo_total_mb=5)
        self.stub_stored("image", 5 * 1024 * 1024)

        response = self.upload("late.png", PNG, "image/png")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "You have exceeded the limit. Maximum allowed photo size is 5 MB.",
        )

    def test_configured_video_count_caps_a_previously_uncapped_kind(self) -> None:
        self.configure(max_videos_per_event=2)

        self.assertEqual(self.upload("a.mp4", MP4, "video/mp4").status_code, 201)
        self.assertEqual(self.upload("b.mp4", MP4, "video/mp4").status_code, 201)
        third = self.upload("c.mp4", MP4, "video/mp4")

        self.assertEqual(third.status_code, 400)
        self.assertIn("at most 2 videos", third.json()["detail"])

    def test_configured_video_total_keeps_the_prd_11_wording(self) -> None:
        self.configure(max_video_size_mb=50, max_video_total_mb=50)
        self.stub_stored("video", 50 * 1024 * 1024)

        response = self.upload("last.mp4", MP4, "video/mp4")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "You have exceeded the limit. Maximum allowed video size is 50 MB.",
        )

    def test_per_video_size_is_enforced_below_the_combined_budget(self) -> None:
        # Before this was configurable a single video could fill the whole
        # budget; now the two caps are separate.
        self.configure(max_video_size_mb=1, max_video_total_mb=400)

        response = self.upload("big.mp4", MP4 + b"\x00" * (1024 * 1024), "video/mp4")

        self.assertEqual(response.status_code, 413)
        self.assertIn("Videos must be smaller than 1 MB", response.json()["detail"])

    def test_photo_and_video_budgets_stay_separate(self) -> None:
        self.configure(max_video_size_mb=50, max_video_total_mb=50)
        self.stub_stored("video", 50 * 1024 * 1024)

        self.assertEqual(self.upload("p.png", PNG, "image/png").status_code, 201)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
