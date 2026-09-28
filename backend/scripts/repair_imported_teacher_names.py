"""Repair Teacher accounts imported with a serial number as their name.

Before the roster parser learned to find a header below a title line and to
read headers such as "Official E-mail", a file like

    School of Science & Technology
    List of Faculty (as on: 31/08/2026)
    Sr. No. | Name of Employee | Designation | Official E-mail | ...

was read by guessing columns from their contents, and the "Sr. No." column
became every teacher's name ("1", "2", "3", ...). Re-importing does not fix
those accounts, because an existing account is always skipped.

This reads the same roster file with the fixed parser and, for each row,
updates the account only when ALL of these hold:

* the email matches the row exactly,
* it is a Teacher account created by a Dean's Excel import,
* its current name is nothing but digits.

It then sets the name from the file, and fills Designation and Department
only where they are empty. Nothing else changes. No email is sent.

Run from the backend directory. A dry run by default -- add --apply to write:
    python scripts/repair_imported_teacher_names.py "SST Faculty List.csv"
    python scripts/repair_imported_teacher_names.py "SST Faculty List.csv" --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import users  # noqa: E402
from app.services import teacher_import  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402

IMPORT_SOURCE = "dean_import"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("roster", help="The .xlsx or .csv file that was imported")
    parser.add_argument("--apply", action="store_true", help="Write the changes (default: dry run)")
    args = parser.parse_args()

    with open(args.roster, "rb") as handle:
        content = handle.read()
    try:
        entries, _ = teacher_import.parse_roster(teacher_import.read_rows(args.roster, content))
    except teacher_import.ImportFileError as error:
        print(f"Cannot read {args.roster}: {error}")
        return 1

    fixed = unchanged = 0
    for entry in entries:
        if entry["status"] != "ok" or entry["name_derived"]:
            continue
        account = users.find_one({"email": entry["email"], "role": "teacher", "onboarded_via": IMPORT_SOURCE})
        if not account or not re.fullmatch(r"\s*\d+\s*", str(account.get("name") or "")):
            unchanged += 1
            continue

        fields = {"name": entry["name"]}
        for field in ("designation", "department"):
            if entry[field] and not account.get(field):
                fields[field] = entry[field]

        print(f"{'FIX ' if args.apply else 'WOULD FIX '} {entry['email']}: "
              f"name {account.get('name')!r} -> {entry['name']!r}"
              + "".join(f", {k} -> {v!r}" for k, v in fields.items() if k != "name"))
        if args.apply:
            users.update_one(
                # Re-checked in the filter, so a name edited meanwhile is kept.
                {"_id": account["_id"], "name": account.get("name")},
                {"$set": {**fields, "updated_at": utc_now()}},
            )
        fixed += 1

    verb = "Repaired" if args.apply else "Would repair"
    print(f"\n{verb} {fixed} account(s); {unchanged} row(s) needed no change.")
    if fixed and not args.apply:
        print("Dry run only. Re-run with --apply to write these changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
