"""Prepare the MongoDB database used by Campus Capture.

Creates every index the application relies on. Safe to run repeatedly.

Run from the backend directory:
    python scripts/init_db.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.database import db, ensure_indexes, ping  # noqa: E402


def main() -> int:
    print(f"Database: {settings.mongodb_db_name}")

    if not ping():
        print("Cannot reach MongoDB. Check MONGODB_URI in backend/.env.")
        return 1

    ensure_indexes()

    for name in sorted(db.list_collection_names()):
        indexes = ", ".join(sorted(db[name].index_information().keys()))
        print(f"  {name:<20} indexes: {indexes}")

    print("Indexes are in place.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
