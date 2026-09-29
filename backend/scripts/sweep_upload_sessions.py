"""Abort direct uploads that were started but never completed.

The API already does this opportunistically (at most every ten minutes, when
someone starts an upload); run this from a scheduler to clean up on a quiet
deployment too. Safe to run at any time: an upload that is still within its
R2_UPLOAD_SESSION_TTL_MINUTES is left alone, and one whose file was already
recorded is never deleted.

Run from the backend directory:
    python scripts/sweep_upload_sessions.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.database import ping  # noqa: E402
from app.services.direct_upload import SWEEP_BATCH, sweep_expired_sessions  # noqa: E402


def main() -> int:
    if not settings.r2_configured:
        print("R2 is not configured; there is nothing to sweep.")
        return 0
    if not ping():
        print("Cannot reach MongoDB. Check MONGODB_URI in backend/.env.")
        return 1

    total = 0
    while True:
        swept = sweep_expired_sessions()
        total += swept
        if swept < SWEEP_BATCH:
            break
    print(f"Aborted {total} expired upload(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
