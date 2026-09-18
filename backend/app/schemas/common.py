"""Validators shared by more than one schema module.

Kept separate from `auth.py` and `events.py` because a coordinator's mobile
number is written from both sides: a user editing their own profile, and a
teacher naming a coordinator while creating an event.
"""

from __future__ import annotations

import re

# Separators people actually type into a phone field. Stripped before the digit
# check so "98765 43210" and "98765-43210" are accepted as the same number.
_PHONE_SEPARATORS = re.compile(r"[\s\-()./]")

# Indian mobile numbers are ten digits; PRD 6 caps the field at exactly that and
# forbids letters. A leading +91 or 0 is a prefix on the same ten digits, so it
# is stripped rather than rejected -- otherwise a number pasted from a contact
# card fails for a reason the teacher cannot see.
_COUNTRY_PREFIX = re.compile(r"^(?:\+?91|0)")

_TEN_DIGITS = re.compile(r"^\d{10}$")

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def normalize_phone(value: str | None, *, required: bool = False) -> str | None:
    """Return a bare 10-digit mobile number, or None when blank and optional.

    Raises ValueError with a message safe to show the user.
    """
    raw = (value or "").strip()
    if not raw:
        if required:
            raise ValueError("Mobile number is required")
        return None

    digits = _PHONE_SEPARATORS.sub("", raw)

    # Only strip the country prefix when doing so leaves exactly ten digits;
    # otherwise "0123456789" (a valid ten-digit number starting with 0) would
    # be mangled into nine.
    if not _TEN_DIGITS.match(digits):
        stripped = _COUNTRY_PREFIX.sub("", digits, count=1)
        if _TEN_DIGITS.match(stripped):
            digits = stripped

    if not _TEN_DIGITS.match(digits):
        raise ValueError("Mobile number must be exactly 10 digits")

    return digits


def normalize_hhmm(value: str | None, *, field: str = "Time") -> str | None:
    """Return a zero-padded 24-hour "HH:MM", or None when blank.

    The canonical form matters: event times are compared as strings (both here
    and in the browser), which is only correct while every value is padded.
    """
    raw = (value or "").strip()
    if not raw:
        return None

    # Accept "9:30" from a hand-typed value, then pad it.
    parts = raw.split(":")
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        raw = f"{int(parts[0]):02d}:{int(parts[1]):02d}"

    if not _HHMM.match(raw):
        raise ValueError(f"{field} must be a valid 24-hour time, for example 14:30")

    return raw
