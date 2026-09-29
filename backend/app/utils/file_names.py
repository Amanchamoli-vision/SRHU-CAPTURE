"""Download names for generated reports: the event's own title, made safe.

"IEEE Conference" downloads as ``IEEE Conference.pdf``. The rules, mirrored by
``frontend/src/utils/fileNames.js`` (keep the two in step):

- characters no file system accepts (``\\ / : * ? " < > |`` and control
  characters) become spaces, and runs of spaces collapse to one;
- leading/trailing dots and spaces go (Windows drops them silently);
- a long title is cut at a word boundary, near MAX_STEM_LENGTH characters;
- a name Windows reserves (CON, PRN, AUX, NUL, COM1-9, LPT1-9) gets " Report";
- the ``.pdf`` extension is always present, exactly once;
- an empty or unusable title falls back to ``Event Report.pdf``.

Non-ASCII titles (Hindi, for example) are kept: the Content-Disposition header
carries them in ``filename*`` (see storage_service.content_disposition).
"""

from __future__ import annotations

import re
import unicodedata

MAX_STEM_LENGTH = 80
DEFAULT_STEM = "Event Report"

_INVALID = re.compile(r'[\\/:*?"<>|\x00-\x1f\x7f]')
_SPACES = re.compile(r"\s+")
_RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", re.IGNORECASE)


def _truncate(stem: str, limit: int) -> str:
    if len(stem) <= limit:
        return stem
    cut = stem[:limit]
    space = cut.rfind(" ")
    # Break at a word if that keeps most of the length; else cut hard.
    if space >= limit // 2:
        cut = cut[:space]
    return cut.rstrip(" .-_,;")


def report_file_name(title: str | None, fallback: str = DEFAULT_STEM) -> str:
    """``<title>.pdf``, safe on every file system and still readable."""
    stem = unicodedata.normalize("NFKC", str(title or ""))
    stem = _INVALID.sub(" ", stem)
    stem = _SPACES.sub(" ", stem).strip()
    if stem.lower().endswith(".pdf"):
        stem = stem[:-4]
    stem = stem.strip(" .")
    stem = _truncate(stem, MAX_STEM_LENGTH).strip(" .")
    if not stem:
        stem = fallback
    if _RESERVED.match(stem):
        stem = f"{stem} Report"
    return f"{stem}.pdf"
