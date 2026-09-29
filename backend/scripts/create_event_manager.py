"""Create an Event Manager account, or reset the password of an existing one.

Run from the backend directory:
    python scripts/create_event_manager.py --email manager@example.com --name "Event Manager"

The password is read from EVENT_MANAGER_PASSWORD, or prompted for, so it does
not land in the shell history (--password also works). The account signs in
through the normal login page; nothing about login or signup changes.

An address that already belongs to a teacher, Dean or superadmin is refused:
this script never changes anyone's existing role.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import ensure_indexes, users  # noqa: E402
from app.models.documents import new_user_document  # noqa: E402
from app.routers.auth import find_user_by_email  # noqa: E402
from app.utils.security import hash_password, password_byte_error  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402

ROLE = "event_manager"


def _password_problem(password: str | None) -> str | None:
    if not password or len(password) < 6:
        return "Password must be at least 6 characters long."
    return password_byte_error(password)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Event Manager")
    parser.add_argument(
        "--password",
        default=os.environ.get("EVENT_MANAGER_PASSWORD"),
        help="Defaults to EVENT_MANAGER_PASSWORD; prompted for when missing",
    )
    args = parser.parse_args()

    email = args.email.strip().casefold()
    ensure_indexes()
    existing = find_user_by_email(email)

    if existing and existing.get("role") != ROLE:
        print(
            f"{existing['email']} already has a {existing.get('role')} account. "
            "Use a different email address for the Event Manager."
        )
        return 2

    password = args.password or getpass.getpass(
        f"{'New password' if existing else 'Password'} for {email}: "
    )
    error = _password_problem(password)
    if error:
        print(error)
        return 2

    if existing:
        users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "password_hash": hash_password(password),
                    "must_change_password": False,
                    "updated_at": utc_now(),
                },
                "$inc": {"token_version": 1},
            },
        )
        print(f"Event Manager {existing['email']} already existed; its password was reset.")
        return 0

    users.insert_one(
        new_user_document(
            name=args.name.strip() or "Event Manager",
            email=email,
            password_hash=hash_password(password),
            role=ROLE,
            email_verified=True,
        )
    )
    print(f"Created Event Manager account {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
