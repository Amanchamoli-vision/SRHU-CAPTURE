"""Create the first superadmin account, or promote an existing user to superadmin.

Run from the backend directory:
    python scripts/create_superadmin.py --email superadmin@example.com --name "Super Admin" --password "..."

The password can also be supplied through the SUPERADMIN_PASSWORD environment
variable (the older ADMIN_PASSWORD is still read as a fallback) so it does not appear in the shell history.
When neither is given it is prompted for. Promoting an existing account always
sets this new password and signs the account out everywhere.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import ensure_indexes, users  # noqa: E402
from app.models.documents import new_user_document  # noqa: E402
from app.utils.security import hash_password, password_byte_error  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402


def _password_problem(password: str | None) -> str | None:
    if not password or len(password) < 6:
        return "Password must be at least 6 characters long."
    return password_byte_error(password)


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

    # A password is always required -- also when promoting an existing account.
    # Anyone can self-register an address, so keeping the account's current
    # password would hand superadmin to whoever registered the admin's address
    # first. The new password replaces it and every existing session is ended.
    if not password:
        prompt = (
            f"New password for {email} (replaces its current password): "
            if existing
            else "Password for the new superadmin: "
        )
        password = getpass.getpass(prompt)
    error = _password_problem(password)
    if error:
        print(error)
        return 2

    if existing:
        now = utc_now()
        users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "role": "superadmin",
                    "password_hash": hash_password(password),
                    "email_verified": True,
                    "email_verified_at": existing.get("email_verified_at") or now,
                    "must_change_password": False,
                    "verification_token_hash": None,
                    "verification_expires_at": None,
                    "reset_token_hash": None,
                    "reset_expires_at": None,
                    "updated_at": now,
                },
                "$inc": {"token_version": 1},
            },
        )
        print(f"Promoted existing user {email} to superadmin and set a new password.")
        return 0

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
