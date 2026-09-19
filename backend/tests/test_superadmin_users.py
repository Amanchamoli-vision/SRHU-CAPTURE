"""Paging, role filtering and search on the Super Admin user directory.

The console's Users screen used to fetch every account and filter in the
browser. It asks for one page now, so the server has to do the filtering, the
counting and the slicing -- and the tab counts have to describe the whole
result set rather than the page on screen.
"""

from __future__ import annotations

import copy
import os
import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "unit-test-secret-key-0123456789")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


SUPERADMIN = {
    "id": str(ObjectId()),
    "name": "Root",
    "email": "root@example.com",
    "role": "superadmin",
}
AUTH = {"Authorization": "Bearer token"}


class FakeUserDirectory:
    """`users`, with the operators this endpoint actually uses.

    Equality, `$or` and `$regex` for the search; `find().sort().skip().limit()`
    for the page; `count_documents` for the totals. Deliberately not a general
    MongoDB: anything else raises so a query this cannot answer is a loud test
    failure rather than a silently wrong count.
    """

    def __init__(self, docs: list[dict]) -> None:
        self.docs = [copy.deepcopy(d) for d in docs]

    def _matches(self, doc: dict, query: dict) -> bool:
        for key, wanted in query.items():
            if key == "$or":
                if not any(self._matches(doc, clause) for clause in wanted):
                    return False
                continue
            value = doc.get(key)
            if isinstance(wanted, dict):
                for op, operand in wanted.items():
                    if op == "$regex":
                        flags = re.I if wanted.get("$options") == "i" else 0
                        if not isinstance(value, str) or not re.search(operand, value, flags):
                            return False
                    elif op == "$options":
                        continue
                    else:  # pragma: no cover - a query this fake cannot answer
                        raise NotImplementedError(op)
            elif value != wanted:
                return False
        return True

    def _all(self, query: dict) -> list[dict]:
        return [copy.deepcopy(d) for d in self.docs if self._matches(d, query)]

    def count_documents(self, query: dict) -> int:
        return len(self._all(query))

    def find(self, query: dict, projection=None, **_kwargs):
        rows = self._all(query)
        if projection:
            hidden = {k for k, keep in projection.items() if not keep}
            rows = [{k: v for k, v in row.items() if k not in hidden} for row in rows]
        return _FakeCursor(rows)


class _FakeCursor:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def sort(self, field, direction=1):
        # `created_at` is set on every seeded row, so no None handling here.
        self.rows.sort(key=lambda r: r.get(field), reverse=direction == -1)
        return self

    def skip(self, n):
        self.rows = self.rows[n:]
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    def __iter__(self):
        return iter(self.rows)


BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def seed(teachers: int = 30, deans: int = 4, superadmins: int = 2) -> list[dict]:
    """Newest first once sorted: index 0 is the oldest account."""
    docs: list[dict] = []
    for role, count in (("teacher", teachers), ("dean", deans), ("superadmin", superadmins)):
        for index in range(count):
            docs.append({
                "_id": ObjectId(),
                "name": f"{role.title()} {index:02d}",
                "email": f"{role}{index:02d}@example.com",
                "role": role,
                "created_at": BASE + timedelta(minutes=len(docs)),
                "password_hash": "secret-never-served",
            })
    return docs


class UserDirectoryPagingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.users = FakeUserDirectory(seed())
        patcher = patch("app.routers.superadmin.users", self.users)
        patcher.start()
        self.addCleanup(patcher.stop)

        auth = patch("app.utils.auth.get_current_user", return_value=SUPERADMIN)
        auth.start()
        self.addCleanup(auth.stop)

    def get(self, query: str = ""):
        response = self.client.get(f"/superadmin/users{query}", headers=AUTH)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    # ---- backwards compatibility ---------------------------------------

    def test_no_paging_params_still_returns_everything(self) -> None:
        # The events list and the single-event screen read this endpoint only
        # to map teacher ids to names. A default cap would blank those names.
        body = self.get()
        self.assertEqual(len(body["users"]), 36)
        self.assertEqual(body["total"], 36)
        self.assertIsNone(body["limit"])

    def test_private_fields_are_never_served(self) -> None:
        body = self.get("?limit=5")
        for row in body["users"]:
            self.assertNotIn("password_hash", row)

    # ---- paging ---------------------------------------------------------

    def test_a_page_carries_the_whole_set_total(self) -> None:
        body = self.get("?skip=0&limit=25")
        self.assertEqual(len(body["users"]), 25)
        self.assertEqual(body["count"], 25)
        self.assertEqual(body["total"], 36, "total describes the set, not the page")
        self.assertTrue(body["has_more"])

    def test_the_last_page_is_short_and_reports_no_more(self) -> None:
        body = self.get("?skip=25&limit=25")
        self.assertEqual(len(body["users"]), 11)
        self.assertEqual(body["total"], 36)
        self.assertFalse(body["has_more"])

    def test_pages_do_not_overlap_or_drop_anyone(self) -> None:
        first = [u["id"] for u in self.get("?skip=0&limit=10")["users"]]
        second = [u["id"] for u in self.get("?skip=10&limit=10")["users"]]
        third = [u["id"] for u in self.get("?skip=20&limit=10")["users"]]

        self.assertEqual(len(set(first + second + third)), 30)

    def test_paging_past_the_end_is_empty_not_an_error(self) -> None:
        body = self.get("?skip=500&limit=25")
        self.assertEqual(body["users"], [])
        self.assertEqual(body["total"], 36)
        self.assertFalse(body["has_more"])

    def test_newest_first_is_preserved_across_pages(self) -> None:
        everyone = [u["created_at"] for u in self.get()["users"]]
        first = [u["created_at"] for u in self.get("?skip=0&limit=25")["users"]]
        self.assertEqual(first, everyone[:25])

    # ---- filters --------------------------------------------------------

    def test_role_filter_narrows_the_set_and_the_total(self) -> None:
        body = self.get("?role=dean&limit=25")
        self.assertEqual(body["total"], 4)
        self.assertTrue(all(u["role"] == "dean" for u in body["users"]))

    def test_role_all_is_the_same_as_no_role(self) -> None:
        self.assertEqual(self.get("?role=all")["total"], self.get()["total"])

    def test_an_unknown_role_is_rejected(self) -> None:
        response = self.client.get("/superadmin/users?role=wizard", headers=AUTH)
        self.assertEqual(response.status_code, 400)

    def test_search_matches_name_and_email(self) -> None:
        self.assertEqual(self.get("?q=Teacher 07")["total"], 1)
        self.assertEqual(self.get("?q=dean01@example.com")["total"], 1)
        # Case-insensitive, like the box it backs.
        self.assertEqual(self.get("?q=TEACHER 07")["total"], 1)

    def test_a_regex_metacharacter_in_the_search_is_literal(self) -> None:
        # "C++" or "(" in the box must not be read as a pattern -- unescaped,
        # this 500s rather than returning nothing.
        for term in ("C++", "a(b", "rea]"):
            with self.subTest(term=term):
                response = self.client.get(
                    "/superadmin/users", params={"q": term}, headers=AUTH
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["total"], 0)

    def test_search_and_role_combine(self) -> None:
        self.assertEqual(self.get("?role=teacher&q=Dean")["total"], 0)
        self.assertEqual(self.get("?role=dean&q=Dean 0")["total"], 4)

    def test_search_survives_paging(self) -> None:
        body = self.get("?q=teacher&skip=0&limit=10")
        self.assertEqual(body["total"], 30)
        self.assertEqual(len(body["users"]), 10)

    # ---- tab counts -----------------------------------------------------

    def test_counts_describe_every_tab_not_the_selected_one(self) -> None:
        body = self.get("?role=dean&limit=25")
        self.assertEqual(body["counts"], {"teacher": 30, "dean": 4, "superadmin": 2, "all": 36})

    def test_counts_respect_the_search(self) -> None:
        # Selecting a tab must not change the numbers on the other tabs, but
        # typing in the search box must.
        body = self.get("?q=dean")
        self.assertEqual(body["counts"]["dean"], 4)
        self.assertEqual(body["counts"]["teacher"], 0)
        self.assertEqual(body["counts"]["all"], 4)

    def test_counts_are_unaffected_by_the_page(self) -> None:
        first = self.get("?skip=0&limit=5")["counts"]
        last = self.get("?skip=30&limit=5")["counts"]
        self.assertEqual(first, last)

    # ---- access ---------------------------------------------------------

    def test_limit_is_bounded(self) -> None:
        for bad in ("?limit=0", "?limit=5000", "?skip=-1"):
            with self.subTest(bad=bad):
                self.assertEqual(
                    self.client.get(f"/superadmin/users{bad}", headers=AUTH).status_code,
                    422,
                )


class UserDirectoryAccessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        patcher = patch("app.routers.superadmin.users", FakeUserDirectory(seed(2, 1, 1)))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_only_a_superadmin_may_read_the_directory(self) -> None:
        for role in ("teacher", "dean"):
            with self.subTest(role=role), patch(
                "app.utils.auth.get_current_user",
                return_value={**SUPERADMIN, "role": role},
            ):
                response = self.client.get("/superadmin/users?limit=25", headers=AUTH)
                self.assertEqual(response.status_code, 403)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
