"""A tiny in-memory stand-in for the MongoDB ``users`` collection.

Supports just what the auth routes use: equality / ``$gt`` / ``$ne`` / ``$regex``
filters, ``$set`` and ``$inc`` updates, and ``find_one_and_update`` returning the
document before or after the update. Nothing here touches a real database.
"""

from __future__ import annotations

import copy
import re

from pymongo import ReturnDocument


def _matches(document: dict, query: dict) -> bool:
    for key, wanted in query.items():
        value = document.get(key)
        if isinstance(wanted, dict) and any(op.startswith("$") for op in wanted):
            for op, operand in wanted.items():
                if op == "$gt":
                    if value is None or not value > operand:
                        return False
                elif op == "$ne":
                    if value == operand:
                        return False
                elif op == "$regex":
                    if not isinstance(value, str) or not re.search(operand, value):
                        return False
                else:  # pragma: no cover - only for test authors
                    raise NotImplementedError(op)
        elif value != wanted:
            return False
    return True


class FakeUsers:
    def __init__(self, *documents: dict) -> None:
        self.documents = [copy.deepcopy(document) for document in documents]
        self.updates: list[tuple[dict, dict]] = []

    def get(self, _id) -> dict:
        return next(document for document in self.documents if document["_id"] == _id)

    def find_one(self, query: dict, projection=None, **_kwargs):
        for document in self.documents:
            if _matches(document, query):
                return copy.deepcopy(document)
        return None

    def _apply(self, document: dict, update: dict) -> None:
        for key, value in update.get("$set", {}).items():
            document[key] = value
        for key, value in update.get("$inc", {}).items():
            document[key] = (document.get(key) or 0) + value

    def update_one(self, query: dict, update: dict, **_kwargs):
        self.updates.append((query, update))
        for document in self.documents:
            if _matches(document, query):
                self._apply(document, update)
                break

    def find_one_and_update(self, query: dict, update: dict, return_document=False, **_kwargs):
        self.updates.append((query, update))
        for document in self.documents:
            if _matches(document, query):
                before = copy.deepcopy(document)
                self._apply(document, update)
                after_wanted = return_document in (True, ReturnDocument.AFTER)
                return copy.deepcopy(document) if after_wanted else before
        return None
