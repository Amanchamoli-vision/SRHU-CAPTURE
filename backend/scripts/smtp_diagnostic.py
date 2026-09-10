"""Check configured SMTP connectivity without sending an email.

Run from the backend directory:
    python scripts/smtp_diagnostic.py
"""

from __future__ import annotations

import sys
from pathlib import Path


# Allow this standalone script to import the backend's ``app`` package.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.services.email_service import (
    EmailDeliveryError,
    SMTPDeliveryState,
    check_smtp_connection,
)


def _print_state(state: SMTPDeliveryState) -> None:
    print(f"SMTP transport: {state.transport} (port {state.port})")
    print(f"SMTP TCP: {'success' if state.connection_succeeded else 'not completed'}")
    print(f"SMTP TLS: {'success' if state.tls_succeeded else 'not completed'}")
    print(
        "SMTP authentication: "
        f"{'success' if state.authentication_succeeded else 'not completed'}"
    )
    print("SMTP send: skipped (this diagnostic never sends email)")
    if state.failure_stage:
        print(f"SMTP failure stage: {state.failure_stage}")
        print(f"SMTP exception type: {state.exception_type}")
        print(f"SMTP response code: {state.smtp_response_code}")
        print(f"SMTP OS errno: {state.os_errno}")


def main() -> int:
    if settings.email_provider != "smtp":
        print("SMTP diagnostic skipped: EMAIL_PROVIDER=resend uses HTTPS, not SMTP.")
        return 0

    try:
        state = check_smtp_connection()
    except EmailDeliveryError as exc:
        state = exc.state
        if state is not None:
            _print_state(state)
            print(f"SMTP {state.failure_stage} failure")
        else:
            print("SMTP failure before a diagnostic state was available")
        return 1

    _print_state(state)
    print("SMTP success: TCP, TLS, and authentication succeeded; no email was sent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
