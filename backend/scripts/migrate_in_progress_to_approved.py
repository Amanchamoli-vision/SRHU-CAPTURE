"""Move events still in the retired "in_progress" status back to "approved".

"In Progress" was removed from event tracking: an approved event now goes
straight to completed. Events already stored as in_progress are returned to
approved -- the stage before it -- so the Dean can mark them completed as usual.
Each one gets a history entry recording the move.

Run from the backend directory. A dry run by default; --apply writes:
    python scripts/migrate_in_progress_to_approved.py
    python scripts/migrate_in_progress_to_approved.py --apply

Idempotent: a second run finds nothing left to move.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import events  # noqa: E402
from app.models.documents import new_history_entry  # noqa: E402
from app.utils.serializers import utc_now  # noqa: E402

SYSTEM_ACTOR = {"id": None, "name": "System migration", "role": "system"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="Write the changes (default: dry run)")
    args = parser.parse_args()

    found = list(events.find({"status": "in_progress"}, {"event_name": 1}))
    for event in found:
        print(f"{'MOVE' if args.apply else 'WOULD MOVE'}  {event['_id']}  {event.get('event_name')!r}  in_progress -> approved")
        if args.apply:
            events.update_one(
                # Re-checked in the filter, so an event moved meanwhile is left alone.
                {"_id": event["_id"], "status": "in_progress"},
                {
                    "$set": {"status": "approved", "updated_at": utc_now()},
                    "$push": {"history": new_history_entry(
                        action="stage_changed",
                        status="approved",
                        from_status="in_progress",
                        actor=SYSTEM_ACTOR,
                        note="In Progress was removed from event tracking.",
                    )},
                },
            )

    verb = "Moved" if args.apply else "Would move"
    print(f"\n{verb} {len(found)} event(s) from in_progress to approved.")
    if found and not args.apply:
        print("Dry run only. Re-run with --apply to write these changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
