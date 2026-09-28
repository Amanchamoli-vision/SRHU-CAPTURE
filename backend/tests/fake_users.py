"""A tiny in-memory stand-in for the MongoDB ``users`` collection.

Supports just what the routes use: equality / ``$gt`` / ``$gte`` / ``$lt`` /
``$lte`` / ``$ne`` / ``$in`` / ``$nin`` / ``$regex`` filters, ``$or`` / ``$and``, ``$set`` and ``$inc`` updates, and ``find_one_and_update`` returning the
document before or after the update. Nothing here touches a real database.
"""

from __future__ import annotations

import copy
import re

from pymongo import ReturnDocument


def _matches(document: dict, query: dict) -> bool:
    for key, wanted in query.items():
        if key == "$or":
            if not any(_matches(document, clause) for clause in wanted):
                return False
            continue
        if key == "$and":
            if not all(_matches(document, clause) for clause in wanted):
                return False
            continue

        value = document.get(key)
        if isinstance(wanted, dict) and any(op.startswith("$") for op in wanted):
            # `$options` is a modifier on `$regex`, not a test of its own.
            flags = re.IGNORECASE if "i" in (wanted.get("$options") or "") else 0
            for op, operand in wanted.items():
                if op == "$options":
                    continue
                if op == "$gt":
                    if value is None or not value > operand:
                        return False
                elif op == "$gte":
                    if value is None or not value >= operand:
                        return False
                elif op == "$lt":
                    if value is None or not value < operand:
                        return False
                elif op == "$lte":
                    if value is None or not value <= operand:
                        return False
                elif op == "$ne":
                    if value == operand:
                        return False
                elif op == "$in":
                    if value not in operand:
                        return False
                elif op == "$nin":
                    if value in operand:
                        return False
                elif op == "$regex":
                    if not isinstance(value, str) or not re.search(operand, value, flags):
                        return False
                else:  # pragma: no cover - only for test authors
                    raise NotImplementedError(op)
        elif value != wanted:
            return False
    return True


class _Cursor:
    """Just enough of a pymongo cursor for the callers that page a find()."""

    def __init__(self, documents: list[dict]) -> None:
        self._documents = documents

    def limit(self, count: int) -> "_Cursor":
        return _Cursor(self._documents[:count] if count else self._documents)

    def sort(self, *_args, **_kwargs) -> "_Cursor":
        return self

    def __iter__(self):
        return iter(self._documents)


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

    def find(self, query: dict | None = None, projection=None, **_kwargs):
        return _Cursor(
            [
                copy.deepcopy(document)
                for document in self.documents
                if _matches(document, query or {})
            ]
        )

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
