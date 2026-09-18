"""In-memory stand-in for the `event_types` collection.

`app/services/event_types.py` binds the collection at import time, so a test
that creates an event has to patch it here or the service reaches for a real
MongoDB. `patch_event_types()` wraps that in one call.
"""

from __future__ import annotations

import contextlib
import copy
from unittest.mock import MagicMock, patch

from bson import ObjectId

from app.models.documents import DEFAULT_EVENT_TYPES, new_event_type_document


class FakeEventTypes:
    """find_one / find / insert_one / update_one(upsert) keyed on `key`."""

    def __init__(self, seed_defaults: bool = True) -> None:
        self.docs: list[dict] = []
        if seed_defaults:
            for name in DEFAULT_EVENT_TYPES:
                self.insert_one(new_event_type_document(name=name, is_default=True))

    def _matches(self, doc: dict, query: dict) -> bool:
        return all(doc.get(key) == value for key, value in query.items())

    def find_one(self, query: dict, *_args, **_kwargs):
        return next(
            (copy.deepcopy(d) for d in self.docs if self._matches(d, query)), None
        )

    def find(self, query: dict | None = None, *_args, **_kwargs):
        query = query or {}
        return [copy.deepcopy(d) for d in self.docs if self._matches(d, query)]

    def insert_one(self, document: dict):
        document = copy.deepcopy(document)
        document["_id"] = ObjectId()
        self.docs.append(document)
        return MagicMock(inserted_id=document["_id"])

    def update_one(self, query: dict, update: dict, upsert: bool = False):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                return MagicMock(matched_count=1, upserted_id=None)
        if upsert:
            document = copy.deepcopy(update.get("$setOnInsert", {}))
            document.update(update.get("$set", {}))
            return self.insert_one(document)
        return MagicMock(matched_count=0, upserted_id=None)

    def create_index(self, *_args, **_kwargs):
        return "key_unique"

    def names(self) -> list[str]:
        return [d["name"] for d in self.docs]


@contextlib.contextmanager
def patch_event_types(store: FakeEventTypes | None = None):
    """Patch the collection the event-types service holds."""
    store = store or FakeEventTypes()
    with patch("app.services.event_types.event_types", store):
        yield store
