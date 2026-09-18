---
name: campus-capture-domain
description: Event lifecycle, roles and permissions for Campus Capture. Use when touching event status transitions, the Dean's decisions (approve / reject / revoke / request changes), archiving, or anything gated on who may do what.
---

# Campus Capture — domain rules

Event management for SRHU. A **teacher** proposes an event, a **dean** reviews
it, a **superadmin** manages accounts. There is no `admin` role — it was
migrated to `superadmin` by `backend/scripts/migrate_admin_to_superadmin.py`.

## Two independent axes

Getting these confused is the single most common mistake in this codebase.

| Axis | Field | Meaning |
|---|---|---|
| Review lifecycle | `status` | Where the event is in the approval flow |
| Archive shelf | `archived_at` | Whether it is filed away, whatever its status |

**Archiving is not a status.** An archived event keeps the status it had, which
is exactly what restore returns it to. Overwriting `status` with `"archived"`
would destroy that. `{"archived_at": None}` matches both missing and null in
MongoDB, so no backfill was ever needed.

## Statuses

`draft · submitted · pending · under_review · approved · in_progress ·
completed · published · rejected · revoked`

The declarative `EVENT_STATUSES` tuple is **not enforced anywhere**. The sets
that actually gate behaviour live in `backend/app/models/documents.py`:

- `TEACHER_EDITABLE_STATUSES` — the teacher may still edit or delete
- `APPROVED_STAGES` — at or beyond approval; gates reports and revocation
- `DEAN_PROGRESS_STAGES` — the delivery stages the Dean walks through
- `RESUBMITTABLE_STATUSES` (in `routers/events.py`) — includes `revoked`, so a
  withdrawn event is never a dead end for the teacher

## Reject vs revoke — keep them apart

- **Reject** = never approved. Only from `DEAN_REVIEWABLE_STATUSES`. Writes
  `rejection_reason`.
- **Revoke** = approval withdrawn. Only from `APPROVED_STAGES`. Writes
  `revocation_reason` and `revoked_at`.

They were once a single "Revoke & Reject" button that always called `/reject`,
which answered **409** on an approved event — so revoking was impossible, not
merely unclear. Do not merge them again, and do not merge their reason fields.

`dean_transition()` takes a verb; `DEAN_VERBS` maps each to the statuses it may
act from and the message for when it cannot. Add a verb there, not with a new
branch.

## Who may do what

- Drafts are invisible to the Dean (`find_dean_visible_event_or_404`), and so
  are archived events unless `allow_archived=True`.
- Reports require `APPROVED_STAGES` **and** a non-archived event. The social
  network link is **optional** (PRD 17) — never reintroduce that guard.
- Teachers only ever see their own events.

## Dates and times

`event_date` is a **string** `"YYYY-MM-DD"`, not a BSON date, and times are
`"HH:MM"` 24-hour strings. Both are zero-padded, so compare them **as strings**
and never build a `Date`/`datetime` to do it — that is what reintroduces
timezone drift.

Past-date validation uses `Asia/Kolkata` (`campus_now()` in
`app/schemas/events.py`), not UTC: between 18:30 and midnight IST a UTC "today"
is yesterday locally and would reject a valid evening event.

`EventUpdateRequest` deliberately **exempts** itself from the past-date rule, and
the router re-applies it only when the date actually changed — otherwise a
rejected event whose date has lapsed could never be resubmitted.
