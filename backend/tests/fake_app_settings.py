"""In-memory stand-in for the `app_settings` collection.

`app/services/upload_limits.py` binds the collection at import time, so any
test that uploads a file -- every upload is measured against the Super Admin's
limits now -- has to patch it here, or the service reaches for a real MongoDB
and waits out the server-selection timeout on each request.

Only `find_one` and `update_one(upsert=True)` are needed: the collection holds
one document per settings group, keyed by a string `_id`.
"""

from __future__ import annotations

import contextlib
import copy
from unittest.mock import MagicMock, patch


class FakeAppSettings:
    def __init__(self, docs: list[dict] | None = None) -> None:
        self.docs: list[dict] = [copy.deepcopy(d) for d in (docs or [])]

    def _matches(self, doc: dict, query: dict) -> bool:
        return all(doc.get(key) == value for key, value in query.items())

    def find_one(self, query: dict, *_args, **_kwargs):
        return next(
            (copy.deepcopy(d) for d in self.docs if self._matches(d, query)), None
        )

    def update_one(self, query: dict, update: dict, upsert: bool = False):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(copy.deepcopy(update.get("$set", {})))
                return MagicMock(matched_count=1, upserted_id=None)
        if upsert:
            document = copy.deepcopy(query)
            document.update(copy.deepcopy(update.get("$setOnInsert", {})))
            document.update(copy.deepcopy(update.get("$set", {})))
            self.docs.append(document)
            return MagicMock(matched_count=0, upserted_id=document.get("_id"))
        return MagicMock(matched_count=0, upserted_id=None)


@contextlib.contextmanager
def patch_app_settings(store: FakeAppSettings | None = None):
    """Patch the collection the upload-limits service holds."""
    store = store or FakeAppSettings()
    with patch("app.services.upload_limits.app_settings", store):
        yield store
