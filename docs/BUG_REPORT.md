# SRHU-CAPTURE (Campus Capture): Bug Report

**Date:** 2026-09-18
**Scope:** FastAPI + MongoDB backend (`backend/app`, `backend/scripts`) and the React/Vite frontend (`frontend/src`)
**Method:** Read-only code review of every router, service, page and shared module, plus the automated checks below. Findings marked *Plausible* are credible from the code but were not reproduced. Every other finding was confirmed by reading the code, and three were reproduced by running it (marked **[reproduced]**).

> This replaces `docs/audit-scratchpad.md`, which describes the old Supabase version. That version no longer exists, so its findings are obsolete.

## Automated checks

| Check | Result |
|---|---|
| Backend unit tests (`python -m unittest discover -s tests`, conda env `dean`) | **59/59 pass.** The first run crashed at import time; see B-19. |
| Backend `.venv` | `pytest` is not installed there; tests only run from the `dean` conda env. |
| Frontend `vite build` | Passes. Single 831 kB JS chunk (no code splitting). |
| Frontend `oxlint` | 0 errors. About 20 warnings: missing `useEffect` deps, setState inside an effect, unused imports `RidgeCanvas`/`RidgeDivider` in `Landing.jsx`. |

## Summary

| Severity | Backend | Frontend | Total |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 6 | 1 | 7 |
| Medium | 9 | 9 | 18 |
| Low | 19 | 14 | 33 |

## Fix status (2026-09-18)

**All 58 bugs are fixed, except two partial fixes (F-22, B-14; see below).** After the fixes, backend unit tests pass **148/148** (up from 59; new suites: `test_sessions.py`, `test_uploads.py`). `vite build` passes, and `oxlint` shows 0 errors (warnings only, no more than before). No end-to-end or Playwright run has been done against a live backend yet.

**Behaviour changes users and deployers will notice**
- **Email verification:** the page now asks for the password chosen at registration (B-7). A person who didn't register uses *Forgot password* instead, which now also verifies the email.
- **Registration with an existing email:** returns the normal "check your inbox" response instead of 409 when email verification is on (B-8). The owner gets a notice email.
- **Sessions:** changing or resetting the password, or logging out, **signs the account out on every device** (`token_version`). Tokens refresh automatically before expiry, and sessions end after 30 days (`SESSION_MAX_AGE_DAYS`).
- **Dean temporary passwords:** Deans created with a temporary password are sent to Profile and must set a new one before using the dashboard (`must_change_password`).
- **Rate limits:** auth endpoints return **429** when over their limit (B-9). The limiter is in-memory and per process. Set `RATE_LIMIT_ENABLED=false` to disable it.
- **File links:** `/files/...` links are now signed and expire after about 6 hours (B-1). Old bookmarked links return 403, and the UI refetches links automatically when media fails to load.
- **Upload rules:** only whitelisted types whose extension, declared type and magic bytes agree are accepted. SVG and HTML are refused. The server enforces caps of 4 photos, 2 videos and 20 documents per event.
- **Dean decisions:** approve, reject and request-changes work only on **pending** events; otherwise they return 409 (B-4). The reason and remarks travel in the JSON body.
- **Resubmit:** `/resubmit` works only from `rejected` or `draft`, and Deans are notified only when an event moves into pending.
- **`/health`:** returns only `{"status": "ok" | "degraded"}`; the details are in the server log.

**Partial fixes and deployment follow-ups**
- **F-22 (partial):** the JWT is still in `localStorage`. Moving to httpOnly cookies is an architecture change.
- **B-14 (partial):** multipart bodies are still spooled to disk before the size check. Cap the request body at the proxy (Railway/nginx) for a hard limit.
- **B-24 (config):** `FRONTEND_URL` in `backend/.env` is still `http://172.16.1.229:5173`. The server now logs a warning; set it to the real HTTPS frontend URL for production.
- **F-9 (config):** make sure Vercel sets `VITE_API_BASE_URL` to the production API URL. A production build now logs an error if the URL is a loopback address.
- **Rate-limit IP spoofing:** `run.py` trusts `X-Forwarded-For` from any address (`forwarded_allow_ips="*"`). That is fine behind Railway's proxy, but on a directly exposed server the per-IP limits can be bypassed (the per-email limits still apply).
- **Failed R2 deletes:** these are now recorded in a new `storage_orphans` collection. Nothing sweeps it yet.

### Fix these first
1. **B-1** Files can be downloaded without logging in (`GET /files/{id}`).
2. **B-2** Stored XSS through uploaded SVG or HTML served inline.
3. **B-4** A Dean can approve or reject from any status. A completed event can be rejected, and the teacher can then delete it.
4. **F-1** The create-event wizard can overwrite an existing event instead of creating a new one.
5. **B-5** Sessions survive a password change or reset, and `/auth/refresh` extends them forever.
6. **B-3 / B-11 / B-12** The PDF report download returns 500 for long descriptions, Hindi event names, and numeric times.

---

## Backend

### High

**B-1. Uploaded files are public: no auth or ownership check on `GET /files/{file_id}`**
`backend/app/routers/files.py:78-131`
The endpoint takes no `get_current_user` dependency and sends `Cache-Control: public`. Anyone who has a file id can download it, including media from draft and rejected events. ObjectIds are partly predictable (timestamp + per-process value + counter), so a teacher who knows one of their own ids can guess neighbouring ones. The `public` header also lets shared proxies cache private files.
*Fix:* require auth, then check the file belongs to an event the caller may see (owner teacher, dean, superadmin), or serve through short-lived signed URLs only. Use `Cache-Control: private`.

**B-2. Stored XSS through a client-chosen content type**
`backend/app/services/storage_service.py:68-89`, served at `files.py:97-118`, R2 presign at `r2_service.py:79-84`
Media only has to *claim* `image/*` or `video/*`, so `image/svg+xml` containing `<script>` is accepted. Documents are accepted if the extension **or** the MIME type matches, so `x.pdf` sent as `text/html` passes. The file is stored with the client's content type and served `inline`, without `X-Content-Type-Options: nosniff` or a CSP. Opening the link runs the script on the API or R2 origin. *(How bad this is depends on origin layout: Plausible.)*
*Fix:* whitelist concrete types and exclude SVG/HTML. Require the extension **and** the type to match, sniff the magic bytes, and send `nosniff` plus `Content-Disposition: attachment` for anything that isn't image/video/pdf.

**B-3. Report PDF crashes on long descriptions** **[reproduced]**
`backend/app/services/report_pdf.py:362-365`
`_boxed()` puts the whole description in a one-row table, and ReportLab cannot split that across pages. About 1,500 words raises `LayoutError: Flowable <Table ...> too large` (the schema allows 20,000 characters). `GET /dean/events/{id}/report/download` then returns 500 for that event on every request.
*Fix:* render the description as plain `Paragraph` flowables, or use a splittable table (one row per paragraph).

**B-4. Dean decision endpoints ignore the current status**
`backend/app/routers/events.py:520-537` (approve), `592-610` (reject), `763-781` (request changes)
Each endpoint only calls `find_event_or_404` and then writes, so:
- `completed` or `in_progress` events can be moved back to `approved`. A double-click creates duplicate history entries and sends two emails.
- `draft` events, which are hidden from Deans everywhere else, can be approved or rejected by id.
- A `completed` event can be rejected, which makes it editable again, and the teacher can then **delete** it with its report and media (`events.py:1011-1017`).
*Fix:* allow only valid transitions (e.g. approve/reject/request-changes only from `pending`) and write with `update_one({"_id": id, "status": expected}, ...)` so the transition is atomic.

**B-5. Tokens survive a password change or reset, and `/auth/refresh` extends them forever**
`backend/app/utils/auth.py:41-72`, `routers/users.py:65-73`, `routers/auth.py:296-306, 362-373`
No token version or `password_changed_at` exists, and `iat` is never checked. `/auth/refresh` accepts any valid token and issues a fresh 7-day one. A stolen token stays valid after the victim resets their password, and `/auth/logout` does nothing on the server.
*Fix:* store a `token_version` (or `password_changed_at`) on the user, embed it in the JWT, and compare it in `get_current_user`. Bump it on password change, reset and logout. Shorten access-token lifetime and add a real refresh token.

**B-6. `create_superadmin.py` can promote an attacker-registered account and keep the attacker's password**
`backend/scripts/create_superadmin.py:41-47`
If the email already exists and no `--password` is given, the account is promoted and marked verified with its existing password. If someone self-registered the admin address first, they become superadmin.
*Fix:* when promoting an existing account, require a new password, or refuse unless `--promote-existing` is passed and the account was already verified.

### Medium

**B-7. Pre-registration account takeover**
`backend/app/routers/auth.py:137-229`
Anyone can register an address they don't own, with a password they choose. When the real owner clicks the verification email (or uses resend after getting 409), the attacker's account is verified, and the attacker can log in as that person.
*Fix:* on verification, force the user to set a new password, or make register for an existing unverified email replace the pending password instead of returning 409.

**B-8. User enumeration**
`backend/app/routers/auth.py:137-141, 263-269`
`/auth/register` returns 409 "An account with this email already exists", and login skips bcrypt for unknown emails, making it much faster. This makes the generic messages on forgot-password and resend pointless.

**B-9. No rate limiting on any auth endpoint**
Login, register, forgot-password, resend-verification, verify and reset have no rate limits. Looping forgot-password or resend against a victim fills their inbox with Gmail SMTP messages and burns the sending quota. Each resend also invalidates the previous link.
*Fix:* per-IP and per-email limits (e.g. `slowapi`), with a cooldown on email-sending endpoints.

**B-10. Temporary Dean password returned in the API response and never forced to change**
`backend/app/routers/superadmin.py:165-174`
`temporary_password` is in the JSON response and is also emailed in plaintext. There is no `must_change_password` flag.

**B-11. Report download returns 500 for non-Latin event names** **[reproduced]**
`backend/app/routers/reports.py:395-409`
`char.isalnum()` keeps Devanagari letters, which can't go into the latin-1 `Content-Disposition` header. The result is `UnicodeEncodeError: 'latin-1' codec can't encode character 'ह'`.
*Fix:* use an ASCII fallback in `filename=` and put the UTF-8 name in `filename*=UTF-8''<percent-encoded>`.

**B-12. Report PDF crashes on non-string metadata** **[reproduced]**
`backend/app/services/report_pdf.py:344` → `format_time_range` line 118
The metadata is teacher-controlled JSON embedded in the description. `{"startTime":930}` leads to `AttributeError: 'int' object has no attribute 'strip'`, and the download returns 500.
*Fix:* apply `str()` or validate types when parsing metadata.

**B-13. Race between the status check and the write (teacher edit/upload vs Dean approve)**
`backend/app/routers/events.py:933-981, 1041-1057, 1116-1144, 1228-1258`
`ensure_teacher_can_edit` reads the status, and the update filters only on `_id`. If the Dean approves in between, the teacher's PATCH puts the event back to `pending` and overwrites the approved content. *(Plausible timing.)*
*Fix:* include the expected status in the update filter.

**B-14. Uploads are read fully into memory before the size check**
`backend/app/services/storage_service.py:54-60`
`upload.file.read()` has no limit and runs before the 25 MB check, so one multi-GB request can exhaust RAM. There is also no limit on files per event (the 4-photo and 2-video caps are frontend-only).
*Fix:* read in chunks and abort when the limit is exceeded, or cap request body size at the proxy. Enforce per-event caps on the server.

**B-15. Unique email index is not guaranteed** *(Plausible)*
`backend/app/main.py:30-34`, `database.py:58`, check-then-insert at `auth.py:137/157` and `superadmin.py:127/144`
If `ensure_indexes()` fails at startup it is only logged, and concurrent registrations can then create duplicate emails. This is most likely on a first boot against the empty Atlas database.

### Low

| # | Where | Bug |
|---|---|---|
| B-16 | `routers/auth.py:60-76`, `superadmin.py:127` | Gmail dot-variant lookup (`$regex`) can return an arbitrary account when several variants exist; `create_dean`'s duplicate check is exact-match only. |
| B-17 | `routers/auth.py:362-373` | Password reset doesn't mark the email verified. The user has just proved inbox ownership, but login still returns 403 "not confirmed". |
| B-18 | `routers/users.py:65-73` | `change-password` doesn't clear a pending `reset_token_hash`. An older reset link can still override the new password for up to 60 minutes. |
| B-19 | `app/database.py:35-40` | `MongoClient(mongodb+srv://…)` resolves SRV DNS **at import time**. When DNS/Atlas is unreachable, the whole app (and every test module) fails to import instead of starting degraded; seen on the first test run. The tests also aren't hermetic, because they read the real `.env` URI. |
| B-20 | `routers/auth.py:347-373` | Reset-token use isn't atomic (`find_one` then `update_one` by `_id`). Two concurrent requests can both succeed. Use `find_one_and_update` filtered on the token hash. |
| B-21 | `routers/superadmin.py:250-272`, `storage_service.py:234-241` | Deleting a user via an upper-case hex id removes the user but leaves their events, media, files and notifications, which are matched by lower-case string. |
| B-22 | `utils/security.py:19,26` | bcrypt silently truncates at 72 bytes (the schema allows 128 characters). The 6-character minimum password is weak. |
| B-23 | `config.py:80-83`, `main.py:54-61` | Default `CORS_ORIGIN_REGEX` trusts any `http://` origin on private ranges **and all of `100.*`** (includes public address space) with `allow_credentials=True`. |
| B-24 | `backend/.env` | `FRONTEND_URL=http://172.16.1.229:5173`: verify and reset links are plain HTTP on a LAN IP. Tokens travel in clear text and the links don't work off-campus. |
| B-25 | `main.py:102-124` | `/health` needs no auth and lists missing SMTP variable names and DB status. |
| B-26 | `services/email_service.py:58` *(Plausible)* | `_build_message` runs outside the try block. A CR/LF in `event_name` (used in the status-email subject) raises an uncaught `ValueError`, and the email is lost. |
| B-27 | `events.py:1029-1064, 983-984` | `/resubmit` works on already-`pending` events, and every PATCH to a pending event notifies all Deans again, so repeated calls spam them. |
| B-28 | `events.py:478-493`, `reports.py:101-123, 176-190` | Dean media, documents and report-status endpoints don't hide drafts, unlike `get_dean_event`. |
| B-29 | `events.py:1123-1144, 1238-1258`, `r2_service.py:59-64` | Orphaned objects: the file is stored before its DB record, an upload racing an event delete re-creates media for a deleted event, and failed R2 deletes are only logged. |
| B-30 | `events.py:429, 828, 1323` | `/dean/events`, teacher event list and `/notifications` are unpaginated and grow without bound. |
| B-31 | `events.py:1333-1354`, `schemas/events.py:77-91` | Clients can create notifications of any type, for any event, with an unbounded `data` dict (own inbox only). |
| B-32 | `schemas/events.py:42,67-70` | Teacher `social_network_url` is not validated; the Dean's `save_social_link` is. It is rendered as `href` in the Dean page and the PDF. |
| B-33 | `reports.py:324-334 vs 384-388` | The stored `report_content` is never used, because download rebuilds from live data. A teacher edit after reject and re-approve doesn't invalidate the "generated" flag. |
| B-34 | `r2_service.py:86-90` *(Plausible)* | Presigned URLs expire after 6 hours. A page left open, such as a long video, gets 403s on later Range requests until reload. |

**Checked and clean:** query injection (no `$where`, typed bodies), invalid ObjectIds (404 or 401 everywhere), teacher-to-teacher IDOR on events and media, notification ownership, Range parsing, timezone mixing, filename path traversal, public register always creating `teacher`, JWT alg/exp/type checks, token hashing and expiry, email HTML escaping.

---

## Frontend

### High

**F-1. Create-event wizard doesn't reset when the URL changes, so it overwrites or deletes the wrong record**
`frontend/src/pages/teacher/CreateEvent.jsx:143-151` (refs), `176-269` (init effect)
The init effect re-runs on `draftIdParam` / `editEventIdParam`, but in "new" mode it never clears `formData`, `eventIdRef`, `serverEvent`, `editingDraftRef` or `step`.
- A teacher on `?editEventId=A` clicks **Create Event** in the sidebar (same component, still mounted). The form keeps A's data under a "Create Event" heading, and Submit **PATCHes event A** instead of creating a new one.
- `?draftId=D1` → `?editEventId=X` leaves `editingDraftRef = D1`, so submitting X **deletes local draft D1** (line 674).
*Fix:* reset all refs and state at the top of the effect, or give the route element `key={location.search}` so it remounts.

### Medium

**F-2. The Dean can't generate a report for in-progress or completed events**
`frontend/src/pages/dean/EventDetails.jsx:566`
The report panel shows for the whole approved group (line 758), and the backend `is_approved()` allows `in_progress` and `completed`, but the handler requires `status === "approved"` exactly.

**F-3. An expired session isn't handled: pages render, then every call fails**
`frontend/src/services/session.js:39-42`, `services/api.js:95-126`
`readSession` silently deletes an expired session without emitting `SIGNED_OUT`, so AuthContext still holds the user. Requests then go out without a token, and apiFetch's `&& token` condition skips both refresh and redirect. The user sees "session expired" errors instead of being sent to `/login`, and in-progress CreateEvent uploads fail.

**F-4. Refresh-on-401 can never succeed**
`frontend/src/services/api.js:95-118`
The backend `/auth/refresh` validates the same token that just got a 401, so the retry always fails. It is dead code with no single-flight lock (racy if refresh is ever fixed). Tied to B-5.

**F-5. Event reminders are off by a day between 00:00 and 05:29 IST**
`frontend/src/utils/notificationService.js:213-217`
`toISOString()` is UTC, so "today" is yesterday during those hours. Today's events get "your event is tomorrow", tomorrow's get nothing, and a contradictory reminder follows later.

**F-6. The "Today" filter in My Events has the same UTC shift**
`frontend/src/pages/teacher/MyEvents.jsx:327`
*Fix for F-5 and F-6:* build `YYYY-MM-DD` from local `getFullYear/getMonth/getDate`.

**F-7. Dean pages bypass `apiJson` and their error handling is broken**
`pages/dean/DeanDashboard.jsx:121-165`, `pages/dean/AllEvents.jsx:156-176`, `pages/dean/EventDetails.jsx` (whole file)
They use raw `fetch`: `response.json()` is called before the `ok` check (an HTML 500 shows "Unexpected token '<'"), a 422 `detail` array shows "[object Object]", a network error shows "Failed to fetch", and AllEvents and EventDetails ignore 401 (no redirect to login).

**F-8. The Dean event detail page downloads every event to show one**
`frontend/src/pages/dean/EventDetails.jsx:109-125`
It fetches the full list and runs `.find()`, although `GET /dean/events/{id}` exists. The four follow-up requests also run sequentially.

**F-9. Build can point at `127.0.0.1:8000` in production** *(Plausible: check Vercel env)*
`frontend/.env`, `dist/`, `services/api.js:15-35`
`.env` sets `VITE_API_BASE_URL=http://127.0.0.1:8000` and the current `dist` bundle has it baked in. `resolveApiBaseUrl` silently rewrites localhost to `<page-host>:8000`, which hides the misconfiguration on a deployed build (mixed content or connection refused).

**F-10. Step-1 edits after the first upload are silently lost**
`frontend/src/pages/teacher/CreateEvent.jsx:326-352, 1183-1188`
The server draft is created once, at the first upload. Later field edits are saved only by an explicit Save Draft or Submit, yet the banner says "you can close this page", and there is no `beforeunload` guard.

### Low

| # | Where | Bug |
|---|---|---|
| F-11 | `utils/draftStorage.js:80-86`, `CreateEvent.jsx:593-603` | A localStorage write failure (quota, private mode) is only logged, and the UI still says "Draft saved". |
| F-12 | `utils/draftStorage.js:130,153` | Metadata JSON inside `<!--CC_METADATA:…-->` isn't escaped for `-->`. A value containing it breaks parsing, drops times and department, and leaks fragments into the description. |
| F-13 | `utils/notificationService.js:94,189-195,271-274` | A reminder POST that fails offline keeps a local-only id forever, and its sent-key blocks it from ever reaching the server. |
| F-14 | `components/NotificationBell.jsx:134-158` *(Plausible)* | Reminder evaluation re-runs on every page mount, and the `cancelled` flag isn't checked inside the loop, so quick navigation creates duplicate reminders. |
| F-15 | `components/NotificationBell.jsx:129` | The 30-second poll keeps running in hidden tabs, in every open tab. |
| F-16 | `services/session.js:90-96` *(Plausible)* | The cross-tab storage listener switches the user under an open page. Drafts save under user A while API calls run as user B. |
| F-17 | `pages/dean/DeanDashboard.jsx:208-251`, `AllEvents.jsx:145` | Filter reloads have no abort or sequence guard, so a slow older response overwrites the newer list. |
| F-18 | `pages/auth/Login.jsx:31-41,116-131` | Login ignores `location.state.from`, so deep links (e.g. an emailed event link) land on the dashboard after sign-in. |
| F-19 | `CreateEvent.jsx:340-359`, `api.js:109` | Uploads have no AbortSignal, so leaving the page keeps uploading and sets state on an unmounted component. |
| F-20 | `dean/AllEvents.jsx:381`, `dean/EventDetails.jsx:363,417` | Rejection reasons and remarks are sent as URL query params, which hits length limits and ends up in access logs (backend signature). |
| F-21 | `teacher/TeacherDashboard.jsx:55-91` | A load failure is only logged, so the dashboard shows zeros with no error. A missing session redirects to `/` instead of `/login`. |
| F-22 | `services/session.js` | The 7-day JWT is in localStorage. Logout leaves per-user draft and notification caches, including contact info, on shared lab machines. |
| F-23 | `services/api.js:6-10` | A missing `VITE_API_BASE_URL` throws at import, which shows a blank white page. |
| F-24 | `utils/constants.js:326-329`, `TeacherDashboard.jsx:497` | Stale comments point to the deleted Supabase RLS migration. The real rule is `TEACHER_EDITABLE_STATUSES` in `backend/app/models/documents.py:31`. |

**Checked and clean:** every frontend call matches an existing backend route, method and response shape; the wizard Next/Submit trap is fixed (distinct keys plus a step guard); no `dangerouslySetInnerHTML`; drafts are keyed per user; object URLs are revoked; the notification interval is cleaned up; Supabase appears only in comments.

**Dead code:** `components/Navbar.jsx` and `StatusBadge.jsx` are unused, and 7 other top-level components (`DashboardCard`, `DateFilter`, `EventForm`, `EventTable`, `EventTypeFilter`, `PieChart`, `Sidebar`) are 0-byte files. `backend/.env` also has unused `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` keys; R2 uses the `R2_*` keys, which are set.

---

## Test coverage gaps
- No tests for the pre-registration takeover, token survival after password reset, rate limits, or the `create_superadmin` promotion path.
- No tests for Dean status-transition rules (B-4) or `/files` authorization (B-1).
- `test_superadmin_cannot_delete_self` uses the id `"user-id"` (not a valid ObjectId), so it passes only because the self-check runs first.
- No frontend unit tests. The Playwright config exists but wasn't run in this audit (it needs a live backend).
