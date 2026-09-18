---
name: campus-capture-api
description: Backend API conventions and the test-fake constraints for Campus Capture (FastAPI + PyMongo + Pydantic v2). Use when adding or changing endpoints, schemas, indexes, or backend tests.
---

# Campus Capture — API conventions

FastAPI + **synchronous PyMongo** (raw collections, no ODM) + **Pydantic v2**.
Tests are stdlib `unittest`, not pytest.

## Routing

`auth`, `users`, `superadmin`, `files` carry a router prefix. **`events.py`,
`reports.py` and `directory.py` do not** — their paths are literal
(`/dean/events`, `/teacher/events`, `/notifications`, `/event-types`). Don't
"tidy" a prefix onto them; the frontend hardcodes these paths.

Several notification routes are registered twice (`/notifications` and the
legacy `/teacher/notifications`). Keep both.

## List responses

```json
{ "events": [...], "total": 312, "count": 25, "has_more": true,
  "skip": 0, "limit": 25, "counts": {"all": 312, "pending": 40, ...} }
```

`total` is the size of the **whole** result set; `count` is the page. They were
once the same value, which made "1–25 of 25" the only thing a paging UI could
ever show. Use `paginate()`, which counts with the same filter it queries with.

Tab counts come from the server so they respect the active filters. When
computing them, remember the base query carries `{"status": {"$ne": "draft"}}`
— dropping the `status` key to ignore the selected tab also drops that, so
`counts["all"]` has to restate it.

## Validators

Pydantic v2 `@field_validator` / `@model_validator(mode="after")`, always with
`@classmethod`. Shared rules live in `app/schemas/common.py`
(`normalize_phone`, `normalize_hhmm`) and are mirrored in
`frontend/src/utils/phone.js` — **keep the two in step**.

**A validator must never touch MongoDB.** Tests patch collections on the
*router* module, so a schema that reads the database cannot be faked and every
suite breaks. Validate shape in the schema; resolve against data in the router
(this is why `event_type` membership moved out of `_validate_event_type`).

## Indexes

All declared in `ensure_indexes()` (`app/database.py`), which is idempotent and
runs on boot and from `scripts/init_db.py` — which also seeds the default event
types.

TTL indexes go through `_ensure_ttl_index()`, which drops and recreates on
`IndexOptionsConflict` (codes 85/86) so a changed policy is not a failed boot.
Notifications expire via a dedicated **`expires_at`** field, not via `read_at`:
a TTL on `read_at` would delete every already-read notification within a minute
of deploying.

## Test fakes

`FakeEvents` (`tests/test_event_history.py`), `FakeFiles`
(`tests/test_uploads.py`), `FakeNotifications`, `FakeEventTypes`
(`tests/fake_event_types.py`) stand in for collections. They support
equality, `$in`, `$ne`, `$nin`, `$exists`, `$or` and `$regex` — **not**
aggregation pipelines. Prefer `find()` + a Python sum over `aggregate()` in
route code so it stays testable.

`app/services/event_types.py` binds its collection at import, so any test that
creates an event must patch `app.services.event_types.event_types` — the
modules that need it do so in `setUpModule`.

`EVENT_PAYLOAD` computes a future date at import. Never hardcode one: past
dates are rejected, so a fixed date turns the suite into a time bomb.

## Running

```bash
JWT_SECRET_KEY=... FRONTEND_URL=http://localhost:5173 \
  .venv/bin/python -m unittest discover tests
```
