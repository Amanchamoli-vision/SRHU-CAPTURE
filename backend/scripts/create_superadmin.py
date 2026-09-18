"""Create the first superadmin account, or promote an existing user to superadmin.

Run from the backend directory:
    python scripts/create_superadmin.py --email superadmin@example.com --name "Super Admin" --password "..."

The password can also be supplied through the SUPERADMIN_PASSWORD environment
variable (the older ADMIN_PASSWORD is still read as a fallback) so it does not appear in the shell history.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import ensure_indexes, users  # noqa: E402
from app.models.documents import new_user_document  # noqa: E402
from app.utils.security import hash_password  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Super Admin")
    parser.add_argument(
        "--password",
        default=os.environ.get("SUPERADMIN_PASSWORD") or os.environ.get("ADMIN_PASSWORD"),
        help="Defaults to SUPERADMIN_PASSWORD; prompted for when missing",
    )
    args = parser.parse_args()

    email = args.email.strip().casefold()
    password = args.password

    ensure_indexes()

    existing = users.find_one({"email": email})

    if existing:
        changes = {"role": "superadmin", "email_verified": True, "updated_at": utc_now()}
        if password:
            changes["password_hash"] = hash_password(password)
        users.update_one({"_id": existing["_id"]}, {"$set": changes})
        print(f"Promoted existing user {email} to superadmin.")
        return 0

    if not password:
        password = getpass.getpass("Password for the new superadmin: ")
    if len(password) < 6:
        print("Password must be at least 6 characters long.")
        return 2

    users.insert_one(
        new_user_document(
            name=args.name.strip() or "Super Admin",
            email=email,
            password_hash=hash_password(password),
            role="superadmin",
            email_verified=True,
        )
    )
    print(f"Created superadmin account {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
