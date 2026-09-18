"""Rename the legacy `admin` role to `superadmin` on every user.

Run from the backend directory before deploying the superadmin release:
    python scripts/migrate_admin_to_superadmin.py

Idempotent: a second run finds nothing left to update.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import users  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402


def main() -> int:
    result = users.update_many(
        {"role": "admin"},
        {"$set": {"role": "superadmin", "updated_at": utc_now()}},
    )
    print(f"Migrated {result.modified_count} admin account(s) to superadmin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
