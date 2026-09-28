"""Importing Teacher accounts from an Excel / CSV roster (Dean panel)."""

from __future__ import annotations

import io
import unittest

from bson import ObjectId
from openpyxl import Workbook
from pymongo.errors import DuplicateKeyError

from app.services import teacher_import
from app.utils.security import verify_password
from tests.test_dean_teacher_management import DeanTeacherTestCase, Users, _user


def xlsx(rows: list[list]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class InsertableUsers(Users):
    def insert_one(self, document: dict):
        if any(d["email"] == document["email"] for d in self.documents):
            raise DuplicateKeyError("email_unique")
        document = {**document, "_id": ObjectId()}
        self.documents.append(document)
        return type("Result", (), {"inserted_id": document["_id"]})()


# ============================================================
# PARSING (no database)
# ============================================================

class ParseTests(unittest.TestCase):
    def parse(self, content: bytes, filename: str = "roster.xlsx"):
        return teacher_import.parse_roster(teacher_import.read_rows(filename, content))

    def test_xlsx_with_header_in_any_order_and_numeric_phone(self) -> None:
        entries, truncated = self.parse(xlsx([
            ["Mobile No.", "Department", "Email ID", "Teacher Name", "Notes"],
            [9876543210, "CSE", "Rajesh.Kumar@SRHU.edu.in", "Dr. Rajesh Kumar", "x"],
            ["+91 98765-43211", None, "meena@srhu.edu.in", None, None],
        ]))
        self.assertFalse(truncated)
        first, second = entries
        self.assertEqual(first["email"], "rajesh.kumar@srhu.edu.in")
        self.assertEqual(first["phone"], "9876543210")
        self.assertEqual(first["name"], "Dr. Rajesh Kumar")
        self.assertEqual(first["department"], "CSE")
        self.assertEqual(first["row"], 2)
        self.assertEqual(second["phone"], "9876543211")
        self.assertEqual(second["name"], "Meena")
        self.assertTrue(second["name_derived"])

    def test_csv_and_semicolon_csv(self) -> None:
        for text in (
            "name,email,phone\nA One,a1@srhu.edu.in,9876543210\n",
            "name;email;phone\nA One;a1@srhu.edu.in;9876543210\n",
        ):
            entries, _ = self.parse(text.encode(), "roster.csv")
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["email"], "a1@srhu.edu.in")
            self.assertEqual(entries[0]["phone"], "9876543210")

    def test_headerless_file_is_recognised_by_content(self) -> None:
        entries, _ = self.parse(xlsx([
            ["Rajesh Kumar", "rajesh@srhu.edu.in", 9876543210],
            ["Meena Rao", "meena@srhu.edu.in", 9876543211],
        ]))
        self.assertEqual([e["email"] for e in entries], ["rajesh@srhu.edu.in", "meena@srhu.edu.in"])
        self.assertEqual(entries[0]["name"], "Rajesh Kumar")
        self.assertEqual(entries[1]["phone"], "9876543211")

    def test_invalid_duplicate_and_bad_phone_rows(self) -> None:
        entries, _ = self.parse(xlsx([
            ["Name", "Email", "Phone"],
            ["Ok", "ok@srhu.edu.in", "12345"],
            ["No mail", None, "9876543210"],
            ["Bad", "not-an-email", None],
            ["Again", "OK@srhu.edu.in", None],
            [None, None, None],
        ]))
        self.assertEqual([e["status"] for e in entries], ["ok", "invalid", "invalid", "duplicate"])
        self.assertIsNone(entries[0]["phone"])
        self.assertTrue(entries[0]["warnings"])
        self.assertIn("row 2", entries[3]["reason"])

    def test_row_cap(self) -> None:
        rows = [["Email"]] + [[f"t{i}@srhu.edu.in"] for i in range(teacher_import.MAX_ROWS + 5)]
        entries, truncated = self.parse(xlsx(rows))
        self.assertEqual(len(entries), teacher_import.MAX_ROWS)
        self.assertTrue(truncated)

    def test_unreadable_files_are_refused_with_a_reason(self) -> None:
        cases = [
            (b"", "empty"),
            (b"\xd0\xcf\x11\xe0" + b"\x00" * 100, ".xls"),
            (b"PK\x03\x04garbage", "could not be read"),
            (b"x" * (teacher_import.MAX_FILE_BYTES + 1), "too large"),
            (b"name,phone\nA,9876543210\n", "email column"),
        ]
        for content, message in cases:
            with self.assertRaises(teacher_import.ImportFileError) as caught:
                self.parse(content, "roster.csv")
            self.assertIn(message.lower(), str(caught.exception).lower())

    def test_name_from_email(self) -> None:
        self.assertEqual(teacher_import.name_from_email("rajesh.kumar_12@x.in"), "Rajesh Kumar")
        self.assertEqual(teacher_import.name_from_email("1234@x.in"), "1234")


class ColumnDetectionTests(unittest.TestCase):
    """Real rosters: a serial-number column must never become the teacher's name.

    A file whose email header was not an exact alias fell through to content
    detection, which took the first non-phone column -- "S.No" -- as the
    name, so teachers were imported as "1", "2", "3"...
    """

    DATA = [
        [1, "Dr. Neelam Danu", "neelam@srhu.edu.in", 9760087270, "Pharmacy"],
        [2, "Vivek Katiyar", "vivek@srhu.edu.in", 9690022223, "Nursing"],
    ]

    def parse(self, rows):
        entries, _ = teacher_import.parse_roster(teacher_import.read_rows("r.xlsx", xlsx(rows)))
        return entries

    def assert_names(self, rows, names=("Dr. Neelam Danu", "Vivek Katiyar")):
        entries = self.parse(rows)
        self.assertEqual([e["name"] for e in entries], list(names))
        self.assertEqual([e["email"] for e in entries], ["neelam@srhu.edu.in", "vivek@srhu.edu.in"])
        self.assertEqual(entries[0]["phone"], "9760087270")
        return entries

    def test_title_and_blank_rows_above_the_header(self) -> None:
        entries = self.assert_names(
            [["SRHU Faculty List 2026"], [], ["S.No", "Name", "Email", "Mobile", "Department"]] + self.DATA
        )
        self.assertEqual(entries[0]["department"], "Pharmacy")
        self.assertEqual(entries[0]["row"], 4)

    def test_header_wording_is_recognised_by_keyword(self) -> None:
        entries = self.assert_names(
            [["Sr. No.", "Name of the Faculty", "Official E-mail", "Contact No. (Mobile)", "Department Name"]]
            + self.DATA
        )
        self.assertEqual(entries[0]["department"], "Pharmacy")

    def test_serial_column_is_not_a_name_without_a_header(self) -> None:
        self.assert_names(self.DATA)

    def test_numbers_only_fall_back_to_the_email(self) -> None:
        entries = self.parse([[1, "neelam.danu@srhu.edu.in"], [2, "vivek@srhu.edu.in"]])
        self.assertEqual([e["name"] for e in entries], ["Neelam Danu", "Vivek"])
        self.assertTrue(all(e["name_derived"] for e in entries))

    def test_id_and_other_peoples_names_are_ignored(self) -> None:
        entries = self.parse([
            ["Employee ID", "Father's Name", "Faculty Name", "E-mail ID", "Mobile"],
            ["E101", "Mr. Danu", "Dr. Neelam Danu", "neelam@srhu.edu.in", "9760087270"],
        ])
        self.assertEqual(entries[0]["name"], "Dr. Neelam Danu")

    def test_a_gmail_data_row_is_not_mistaken_for_a_header(self) -> None:
        entries = self.parse([["Neelam", "neelam@gmail.com"], ["Vivek", "vivek@gmail.com"]])
        self.assertEqual([e["name"] for e in entries], ["Neelam", "Vivek"])


# ============================================================
# ENDPOINTS
# ============================================================

class ImportEndpointTests(DeanTeacherTestCase):
    def setUp(self) -> None:
        super().setUp()
        # The shared fixture's users fake, given the insert_one it lacks.
        self.users.__class__ = InsertableUsers

    def upload(self, content: bytes, filename: str = "roster.xlsx", user: dict | None = None):
        return self.client.post(
            "/dean/teachers/import/preview",
            files={"file": (filename, content, "application/octet-stream")},
            headers=self.auth(user or self.dean),
        )

    def test_preview_statuses_and_no_writes(self) -> None:
        before = len(self.users.documents)
        response = self.upload(xlsx([
            ["Name", "Email", "Mobile"],
            ["New One", "new1@srhu.edu.in", 9876543210],
            ["Meera", self.teacher["email"], None],
            ["Dean", self.other_dean["email"].upper(), None],
            ["Dup", "NEW1@srhu.edu.in", None],
            ["Bad", "nope", None],
        ]))
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual([r["status"] for r in data["rows"]], ["new", "exists", "exists", "duplicate", "invalid"])
        self.assertEqual(data["counts"], {"new": 1, "exists": 2, "duplicate": 1, "invalid": 1})
        self.assertIn("not a Teacher", data["rows"][2]["reason"])
        self.assertEqual(len(self.users.documents), before)
        self.assertEqual(self.audit.documents, [])

    def test_preview_rejects_bad_files(self) -> None:
        self.assertEqual(self.upload(b"\xd0\xcf\x11\xe0" + b"\0" * 64, "old.xls").status_code, 400)
        self.assertEqual(self.upload(xlsx([["Email"]])).status_code, 400)

    def test_import_creates_teachers_without_a_usable_password(self) -> None:
        response = self.client.post(
            "/dean/teachers/import",
            json={"teachers": [
                {"name": "Rajesh Kumar", "email": "Rajesh@SRHU.edu.in", "phone": "9876543210", "department": "CSE"},
                {"email": "meena.rao@srhu.edu.in"},
                {"email": self.teacher["email"]},
                {"email": self.superadmin["email"]},
                {"email": "rajesh@srhu.edu.in"},
            ]},
            headers=self.auth(self.dean),
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data["created_count"], data["skipped_count"]), (2, 3))

        rajesh = next(d for d in self.users.documents if d["email"] == "rajesh@srhu.edu.in")
        self.assertEqual(rajesh["role"], "teacher")
        self.assertEqual(rajesh["phone"], "9876543210")
        self.assertEqual(rajesh["onboarded_via"], "dean_import")
        self.assertEqual(rajesh["imported_by"], str(self.dean["_id"]))
        self.assertFalse(rajesh["email_verified"])
        self.assertTrue(rajesh["must_change_password"])
        meena = next(d for d in self.users.documents if d["email"] == "meena.rao@srhu.edu.in")
        self.assertEqual(meena["name"], "Meena Rao")

        # The superadmin account was not touched or converted.
        self.assertEqual(self.doc(self.superadmin)["role"], "superadmin")

        # Nobody can sign in yet.
        for guess in ("", "password", "Passw0rd!"):
            self.assertFalse(verify_password(guess, rajesh["password_hash"]))
        login = self.client.post("/auth/login", json={"email": "rajesh@srhu.edu.in", "password": "anything1"})
        self.assertEqual(login.status_code, 401)

        log = self.audit.documents[-1]
        self.assertEqual(log["action"], "teachers_imported")
        self.assertEqual(log["details"]["created_count"], 2)
        self.assertEqual(log["details"]["via"], "dean_panel")

    def test_imported_teacher_is_listed_and_can_join_by_invitation(self) -> None:
        self.client.post(
            "/dean/teachers/import",
            json={"teachers": [{"name": "Rajesh Kumar", "email": "rajesh@srhu.edu.in"}]},
            headers=self.auth(self.dean),
        )
        listed = self.client.get("/dean/teachers?source=imported", headers=self.auth(self.dean)).json()
        self.assertEqual([t["email"] for t in listed["teachers"]], ["rajesh@srhu.edu.in"])
        self.assertEqual(listed["teachers"][0]["onboarded_via"], "dean_import")
        self.assertEqual(listed["teachers"][0]["onboarding_status"], "not_invited")
        self.assertNotIn("password_hash", listed["teachers"][0])
        registered = self.client.get("/dean/teachers?source=registered", headers=self.auth(self.dean)).json()
        self.assertNotIn("rajesh@srhu.edu.in", [t["email"] for t in registered["teachers"]])

        user_id = listed["teachers"][0]["id"]
        sent = self.client.post(
            "/dean/teachers/invite", json={"user_ids": [user_id]}, headers=self.auth(self.dean)
        ).json()
        self.assertEqual(sent["sent_count"], 1)
        to, token = self.sent_invites[-1]
        self.assertEqual(to, "rajesh@srhu.edu.in")

        accepted = self.client.post("/auth/accept-invite", json={"token": token, "new_password": "Rajesh#2026"})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        login = self.client.post("/auth/login", json={"email": "rajesh@srhu.edu.in", "password": "Rajesh#2026"})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertFalse(login.json()["user"]["must_change_password"])

    def test_preview_flags_a_removed_teacher(self) -> None:
        self.client.post(f"/dean/teachers/{self.teacher['_id']}/remove", headers=self.auth(self.dean))
        data = self.upload(xlsx([["Email"], [self.teacher["email"]]])).json()
        self.assertEqual(data["rows"][0]["status"], "exists")
        self.assertIn("Restore them", data["rows"][0]["reason"])

    def test_teacher_cannot_import(self) -> None:
        self.assertEqual(self.upload(xlsx([["Email"], ["a@srhu.edu.in"]]), user=self.teacher).status_code, 403)
        response = self.client.post(
            "/dean/teachers/import", json={"teachers": [{"email": "a@srhu.edu.in"}]}, headers=self.auth(self.teacher)
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(any(d["email"] == "a@srhu.edu.in" for d in self.users.documents))

    def test_import_payload_is_validated(self) -> None:
        headers = self.auth(self.dean)
        for body in ({"teachers": []}, {"teachers": [{"email": "nope"}]},
                     {"teachers": [{"email": "a@srhu.edu.in", "phone": "12"}]}):
            self.assertEqual(self.client.post("/dean/teachers/import", json=body, headers=headers).status_code, 422)


if __name__ == "__main__":
    unittest.main()
