from __future__ import annotations

import os
import unittest
from datetime import timedelta
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient
from bson import ObjectId

from app.main import app
from app.database import events, event_media, event_documents
from app.routers.events import _required_kind
from app.schemas.events import campus_now
from app.services.upload_config_service import DEFAULT_UPLOAD_LIMITS


def requirements(**flags):
    """Patch the Super Admin's mandatory-upload switches for one test."""
    return patch(
        "app.routers.events.get_upload_limits",
        return_value={**DEFAULT_UPLOAD_LIMITS, **flags},
    )


class EventMandatoryUploadsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        from app.database import users
        users.update_one(
            {"email": "mand_uploads_teacher@srhu.edu.in"},
            {
                "$set": {
                    "name": "Prof. Test Mandatory",
                    "email": "mand_uploads_teacher@srhu.edu.in",
                    "role": "teacher",
                    "password_hash": "dummyhash",
                    "email_verified": True,
                    "must_change_password": False,
                }
            },
            upsert=True,
        )
        cls.user = users.find_one({"email": "mand_uploads_teacher@srhu.edu.in"})
        cls.user_id = str(cls.user["_id"])

        from app.utils.security import create_access_token
        token, _ = create_access_token(cls.user_id, "teacher")
        cls.auth_headers = {
            "Authorization": f"Bearer {token}",
            "X-Enforce-Upload-Validation": "true",
        }

    def tearDown(self):
        events.delete_many({"teacher_id": self.user_id})

    def _past_date(self, days=5):
        return (campus_now() - timedelta(days=days)).strftime("%Y-%m-%d")

    def test_save_draft_without_uploads_succeeds(self):
        """Saving as draft should NEVER block when photos/documents are missing."""
        payload = {
            "event_name": "Draft Event No Uploads",
            "event_date": self._past_date(2),
            "event_type": "Workshop",
            "location": "Seminar Hall A",
            "save_as_draft": True,
        }
        res = self.client.post("/teacher/events", json=payload, headers=self.auth_headers)
        self.assertEqual(res.status_code, 201, res.text)
        event_id = res.json()["event"]["id"]

        update_payload = {
            "event_name": "Updated Draft Event No Uploads",
            "event_date": self._past_date(2),
            "event_type": "Workshop",
            "location": "Seminar Hall B",
            "save_as_draft": True,
        }
        update_res = self.client.patch(
            f"/teacher/events/{event_id}",
            json=update_payload,
            headers=self.auth_headers,
        )
        self.assertEqual(update_res.status_code, 200, update_res.text)
        self.assertEqual(update_res.json()["event"]["status"], "draft")

    def test_submit_without_photo_fails(self):
        """Submitting an event for approval without at least one photo must fail with 400."""
        payload = {
            "event_name": "Event Without Photo",
            "event_date": self._past_date(3),
            "event_type": "Workshop",
            "location": "Auditorium",
            "save_as_draft": True,
        }
        res = self.client.post("/teacher/events", json=payload, headers=self.auth_headers)
        self.assertEqual(res.status_code, 201)
        event_id = res.json()["event"]["id"]

        event_documents.insert_one({
            "event_id": event_id,
            "filename": "agenda.pdf",
            "file_size": 1024,
            "content_type": "application/pdf",
        })

        submit_payload = {
            "event_name": "Event Without Photo",
            "event_date": self._past_date(3),
            "event_type": "Workshop",
            "location": "Auditorium",
            "save_as_draft": False,
        }
        submit_res = self.client.patch(
            f"/teacher/events/{event_id}",
            json=submit_payload,
            headers=self.auth_headers,
        )
        self.assertEqual(submit_res.status_code, 400, submit_res.text)
        self.assertIn("photo", submit_res.text.lower())

        event_documents.delete_many({"event_id": event_id})

    def test_submit_without_document_fails(self):
        """Submitting an event for approval without at least one document must fail with 400."""
        payload = {
            "event_name": "Event Without Document",
            "event_date": self._past_date(3),
            "event_type": "Workshop",
            "location": "Auditorium",
            "save_as_draft": True,
        }
        res = self.client.post("/teacher/events", json=payload, headers=self.auth_headers)
        self.assertEqual(res.status_code, 201)
        event_id = res.json()["event"]["id"]

        event_media.insert_one({
            "event_id": event_id,
            "media_type": "image",
            "filename": "banner.jpg",
            "file_size": 1024,
            "content_type": "image/jpeg",
        })

        submit_payload = {
            "event_name": "Event Without Document",
            "event_date": self._past_date(3),
            "event_type": "Workshop",
            "location": "Auditorium",
            "save_as_draft": False,
        }
        submit_res = self.client.patch(
            f"/teacher/events/{event_id}",
            json=submit_payload,
            headers=self.auth_headers,
        )
        self.assertEqual(submit_res.status_code, 400, submit_res.text)
        self.assertIn("document", submit_res.text.lower())

        event_media.delete_many({"event_id": event_id})

    def test_submit_with_mandatory_uploads_and_no_video_succeeds(self):
        """Submitting with at least 1 photo and 1 document, and 0 videos must succeed (video is optional)."""
        payload = {
            "event_name": "Valid Event No Video",
            "event_date": self._past_date(4),
            "event_type": "Workshop",
            "location": "Main Hall",
            "save_as_draft": True,
        }
        res = self.client.post("/teacher/events", json=payload, headers=self.auth_headers)
        self.assertEqual(res.status_code, 201)
        event_id = res.json()["event"]["id"]

        event_media.insert_one({
            "event_id": event_id,
            "media_type": "image",
            "filename": "photo1.png",
            "file_size": 2048,
            "content_type": "image/png",
        })
        event_documents.insert_one({
            "event_id": event_id,
            "filename": "proposal.pdf",
            "file_size": 4096,
            "content_type": "application/pdf",
        })

        submit_payload = {
            "event_name": "Valid Event No Video",
            "event_date": self._past_date(4),
            "event_type": "Workshop",
            "location": "Main Hall",
            "save_as_draft": False,
        }
        submit_res = self.client.patch(
            f"/teacher/events/{event_id}",
            json=submit_payload,
            headers=self.auth_headers,
        )
        self.assertEqual(submit_res.status_code, 200, submit_res.text)
        self.assertEqual(submit_res.json()["event"]["status"], "pending")

        event_media.delete_many({"event_id": event_id})
        event_documents.delete_many({"event_id": event_id})

    # ---------------------------------------- Super Admin requirement switches

    def _draft_with(self, *, photo=False, video=False, document=False):
        res = self.client.post(
            "/teacher/events",
            json={
                "event_name": "Configurable Requirements",
                "event_date": self._past_date(2),
                "event_type": "Workshop",
                "location": "Main Hall",
                "save_as_draft": True,
            },
            headers=self.auth_headers,
        )
        self.assertEqual(res.status_code, 201, res.text)
        event_id = res.json()["event"]["id"]
        self.addCleanup(event_media.delete_many, {"event_id": event_id})
        self.addCleanup(event_documents.delete_many, {"event_id": event_id})

        if photo:
            event_media.insert_one({"event_id": event_id, "media_type": "image",
                                    "filename": "p.png", "file_size": 10})
        if video:
            event_media.insert_one({"event_id": event_id, "media_type": "video",
                                    "filename": "v.mp4", "file_size": 10})
        if document:
            event_documents.insert_one({"event_id": event_id, "filename": "d.pdf",
                                        "file_size": 10})
        return event_id

    def _submit(self, event_id):
        return self.client.patch(
            f"/teacher/events/{event_id}",
            json={
                "event_name": "Configurable Requirements",
                "event_date": self._past_date(2),
                "event_type": "Workshop",
                "location": "Main Hall",
                "save_as_draft": False,
            },
            headers=self.auth_headers,
        )

    def test_optional_photos_let_an_event_submit_without_one(self):
        event_id = self._draft_with(document=True)
        with requirements(photos_required=False):
            res = self._submit(event_id)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["event"]["status"], "pending")

    def test_optional_documents_let_an_event_submit_without_one(self):
        event_id = self._draft_with(photo=True)
        with requirements(documents_required=False):
            res = self._submit(event_id)
        self.assertEqual(res.status_code, 200, res.text)

    def test_required_videos_block_submission_without_one(self):
        event_id = self._draft_with(photo=True, document=True)
        with requirements(videos_required=True):
            res = self._submit(event_id)
        self.assertEqual(res.status_code, 400, res.text)
        self.assertIn("video", res.text.lower())

    def test_required_videos_are_satisfied_by_a_video(self):
        event_id = self._draft_with(photo=True, video=True, document=True)
        with requirements(videos_required=True):
            res = self._submit(event_id)
        self.assertEqual(res.status_code, 200, res.text)

    def test_nothing_required_submits_an_empty_event(self):
        event_id = self._draft_with()
        with requirements(photos_required=False, documents_required=False):
            res = self._submit(event_id)
        self.assertEqual(res.status_code, 200, res.text)

    def test_last_upload_guard_follows_the_switches(self):
        """A pending event keeps its last upload only of a mandatory kind."""
        video = {"media_type": "video"}
        photo = {"media_type": "image"}
        with requirements():
            self.assertIsNone(_required_kind(event_media, video))
            self.assertEqual(_required_kind(event_media, photo), ({"media_type": "image"}, "photo"))
            self.assertEqual(_required_kind(event_documents, {}), ({}, "document"))
        with requirements(photos_required=False, videos_required=True, documents_required=False):
            self.assertIsNone(_required_kind(event_media, photo))
            self.assertIsNone(_required_kind(event_documents, {}))
            self.assertEqual(_required_kind(event_media, video), ({"media_type": "video"}, "video"))
