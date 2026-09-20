# SRHU-CAPTURE (Campus Capture): Bug & Security Report

**Date:** 2026-09-20
**Scope:** FastAPI + MongoDB backend (`backend/app`, `backend/run.py`, `backend/scripts`) and the React/Vite frontend (`frontend/src`)
**Method:** Full read of every router, service, schema, model, page and shared module, plus the automated checks below. Eight findings were reproduced by running the code — those are marked **[reproduced]** and carry the command output that shows them. Everything else was confirmed by reading the code.

> This is a fresh audit. It does **not** replace `docs/BUG_REPORT.md` (2026-09-18), which states that all 58 of its findings are fixed. Where a finding below is a regression of something that report closed, it says so.
>
> `backend/app/routers/events.py` was edited at 19:09 while this audit was running. Every finding was re-verified against the file as it stands now.

---

## Fix status — all 25 fixed (2026-09-20)

Every finding in this report has been fixed. Verification after the fixes:

| Check | Before | After |
|---|---|---|
| Backend tests (`python -m unittest discover -t . -s tests`) | 8 of 409 fail | **417/417 pass** |
| Frontend `vite build` — initial JS chunk | 1,089 kB (297 kB gzip) | **311 kB (96 kB gzip)** |
| Frontend `oxlint` | 0 errors | **0 errors** |
| Frontend `vitest run` | 41/41 | **41/41** |

Each of the eight reproductions in this report was re-run against the fixed code and now shows the corrected behaviour. Three new regression tests cover S-3.

**Behaviour changes to be aware of**

- **Email verification now asks for the password** (S-3). The link confirms the address; the password chosen at registration is what signs the person in. Anyone who cannot supply it uses *Forgot password*, which also verifies the address.
- **An event can no longer be created straight into the Dean's queue** (S-6). `POST /teacher/events` creates a draft; the photo and document are attached, then a `PATCH` submits it. That is what the wizard already did — but the rule is now enforced on all three routes that reach `pending`, including `/resubmit`. An event's history therefore starts with a `created` entry.
- **Bulk credential emails are queued, not sent inline** (B-2). `email_sent_count` now means "queued"; delivery failures are logged rather than returned per recipient.
- **`CORS_ORIGIN_REGEX` no longer defaults to the LAN pattern** (S-7). The pattern is now `LAN_CORS_ORIGIN_REGEX` in `app/config.py` and has been written into the local `backend/.env`, so development is unchanged. **Production must not set it** to that value.
- **`FORWARDED_ALLOW_IPS`** (S-1) is a new environment variable. It defaults to loopback plus the private ranges a platform proxy speaks from; set it to the proxy's exact address where that is known.
- **A superadmin can no longer reset another superadmin's password** (S-5).

**Still a deployment task, not a code fix:** `FRONTEND_URL` in `backend/.env` is still `http://172.16.1.229:5173`. Set it to the production HTTPS origin before deploying, or verification and reset tokens continue to travel as plain http (S-7).

---

## Automated checks

| Check | Result |
|---|---|
| Backend tests, documented command (`python -m unittest discover -t . -s tests`) | **8 of 409 fail.** One root cause — see **B-1**. |
| Backend tests with `PYTEST_CURRENT_TEST` set | **409/409 pass.** |
| Frontend `vite build` | Passes. Single 1,087 kB JS chunk (296 kB gzip), no code splitting. |
| Frontend `oxlint` | 0 errors, ~40 warnings (missing `useEffect` deps, setState-in-effect, 10 unused imports). |
| Frontend `vitest run` | 41/41 pass. |
| Secrets hygiene | `backend/.env` is correctly gitignored and **not** tracked. Only `.env.example` files are in git. |

## Summary

| Severity | Security | Functional | Total |
|---|---:|---:|---:|
| High | 3 | 3 | **6** |
| Medium | 4 | 7 | **11** |
| Low | 2 | 6 | **8** |
| **Total** | **9** | **16** | **25** |

### Fix these first

The six that matter most, in the order suggested at the end of this report:

- **S-1** — Login rate limiting is completely bypassable in production. Unlimited password guessing.
- **S-2** — The superadmin's "reset password" emails the user's new **plaintext password inside a URL**, and the link it sends is broken anyway.
- **B-3** — Bulk "send credentials" can overwrite teachers' passwords and then abort, discarding the only copy of the new passwords. Those accounts are locked out.
- **S-3** — An email verification link, on its own, grants a full logged-in session. No password required. (Regression of B-7 in the previous report.)
- **B-1** — The backend test suite fails on the command the project documents, because production code branches on a pytest-only environment variable.
- **B-2** — Bulk onboarding sends up to 500 SMTP messages synchronously inside one HTTP request.

---

# Part 1 — Security

## S-1 (High) Rate limiting is bypassable with a spoofed `X-Forwarded-For` **[reproduced]**

`backend/run.py:25` starts uvicorn with `forwarded_allow_ips="*"`, which tells it to trust the `X-Forwarded-For` header from **any** source. `backend/app/utils/rate_limit.py` derives every limiter key from `request.client.host`, so all of the auth throttling is keyed on a value the caller controls.

Worse, both login rules are defeated at once: `LOGIN_PER_IP_EMAIL` is keyed on `f"{ip}|{email}"`, so rotating the header also resets the per-account budget. The only remaining brute-force cost is one bcrypt round per guess.

Reproduced against the app wrapped exactly as `run.py` wraps it:

```
A) 15 guesses, same client, NO X-Forwarded-For:
   429s: 5 | 401s: 10 -> throttled
B) same 15 guesses, rotating X-Forwarded-For:
   429s: 0 | 401s: 15 -> NOT throttled
```

This is not theoretical behind Railway. uvicorn 0.52.4 with `always_trust=True` takes the **leftmost** `X-Forwarded-For` entry, so even when the platform proxy appends the true client IP the attacker's value still wins:

```
Spoofed value + real client appended by the proxy:
   429s: 0 | 401s: 15 -> NOT throttled
```

The same bypass applies to `limit_email_sending` (register, forgot-password, resend-verification), so the inbox-flooding and SMTP-quota protections are gone too.

**Fix:** set `forwarded_allow_ips` to the proxy's addresses rather than `"*"`. If the platform's egress range is not known, take the *rightmost* untrusted entry instead of the leftmost, or key the limiter on the header only when the direct peer is a known proxy. The previous report listed this as a deployment follow-up; it is a live bypass, not a hardening nicety.

## S-2 (High) Superadmin password reset emails the plaintext password inside a URL, and the link is broken

`backend/app/routers/superadmin.py:673` queues:

```python
background_tasks.add_task(
    email_service.send_password_reset_email,
    user["email"],
    user.get("name") or "there",
    new_password,          # <-- third parameter is `token`
)
```

`send_password_reset_email(to_email, name, token)` (`backend/app/services/email_service.py:210`) does `url = settings.password_reset_url(token)`. The password is therefore pasted into the link. With the current `.env` the recipient gets:

```
http://172.16.1.229:5173/reset-password?token=Tmp9xKq2mPzA
```

Two separate failures:

- **Credential disclosure.** The plaintext password ends up in a URL — retained in mail-gateway logs, the browser's history and address bar, and the `Referer` of anything the reset page loads. Over `http://` (see S-7) it is also on the wire in clear.
- **The feature does not work.** No `reset_token_hash` matches the password, so `POST /auth/reset-password` answers *"This password reset link is invalid or has already been used."* The email also claims *"We received a request to reset the password… valid for 60 minutes"*, which is not what happened. The real temporary password is only ever returned in the API response to the superadmin, so unless they read it off the screen and relay it by hand, the user is stuck.

`send_teacher_credentials_email` and `send_dean_credentials_email` already exist for exactly this case and are what `create_dean` and `bulk_onboard_teachers` use.

**Fix:** call the credentials template, not the reset template. Separately, wrap the call the way every other background send in the codebase is wrapped (`_deliver_password_reset` in `auth.py`) — as written an `EmailDeliveryError` escapes into the background task uncaught.

## S-3 (High) An email verification link alone grants a full session — regression of B-7

`verify_email` (`backend/app/routers/auth.py:247`) looks the token up, marks the address verified, and returns `**_session_response(user)` — an access token for the account. It never reads `payload.password`.

The evidence that this is a reverted fix, not a design decision, is still in the tree:

- `VerifyEmailRequest` (`backend/app/schemas/auth.py:71`) still declares `password: str | None`.
- `VERIFY_PASSWORD_MISMATCH_MESSAGE` (`backend/app/routers/auth.py:57`) is still defined and is now referenced nowhere in the backend.
- `frontend/src/services/auth.js:136` still has `verifyEmail(token, password = null)`, and `VerifyEmail.jsx:37` calls it as `verifyEmail(token)`.

The previous report closed B-7 with *"the page now asks for the password chosen at registration."* It no longer does.

Anyone who obtains the link — a shared or departmental inbox, a forwarded welcome mail, a mail-security scanner that follows links, a `Referer` leak from the verification page — is logged in as that user. The link is valid for 24 hours (`EMAIL_VERIFICATION_EXPIRE_HOURS`) and is not single-use in a way that helps: the first opener gets the session.

**Fix:** require the password again on `/auth/verify-email` and return the session only when it matches, sending anyone who cannot supply one to *Forgot password* (which also verifies the address). If auto-login is genuinely wanted, at minimum shorten the token lifetime and invalidate the token the moment it is used.

## S-4 (Medium) CSV / formula injection in the NAAC / NIRF accreditation export **[reproduced]**

`export_events_csv` (`backend/app/routers/superadmin.py:939`, rows written at `:997`) writes teacher-controlled text — `event_name`, `location`, `organizer`, `description`, and the teacher's own `name` — straight into the CSV with no neutralisation.

A teacher who names an event `=cmd|'/c calc'!A1` gets that written verbatim:

```
=cmd|'/c calc'!A1,@SUM(1+1)*cmd|'/c calc'!A0
```

Excel and LibreOffice evaluate a cell beginning `=`, `+`, `-` or `@`. This export exists to be opened in a spreadsheet by an administrator, which is precisely the delivery path the attack needs. The teacher supplying the payload is an ordinary authenticated user.

**Fix:** prefix any value starting with `=`, `+`, `-`, `@`, tab or CR with a single quote (or wrap it), on every user-supplied column.

## S-5 (Medium) A superadmin can reset another superadmin's password

`delete_user` refuses to touch a `superadmin` (`:417`) and `toggle_user_active` refuses too (`:552`). `reset_user_password` (`:645`) has neither guard — it will overwrite any account's password hash, bump `token_version`, and hand the new password back to the caller.

One superadmin can therefore take over another superadmin's account silently, and the victim is simply logged out everywhere. The audit log records it, but after the fact.

**Fix:** apply the same role guard the two neighbouring endpoints already use, or require the actor to be resetting their own account for the superadmin role.

## S-6 (Medium) The mandatory photo/document rule is enforced on one path only **[reproduced]**

`update_teacher_event` (`backend/app/routers/events.py:1519`) refuses to move an event to `pending` unless it has at least one photo and at least one document. Two other routes reach `pending` without that check:

- `PATCH /teacher/events/{id}/resubmit` (`:1659`) — `RESUBMITTABLE_STATUSES` includes `"draft"` (`:164`), and the handler queries neither `event_media` nor `event_documents`.
- `POST /teacher/events` with `save_as_draft: false` — creates a `pending` event directly.

Reproduced:

```
PATCH /teacher/events/{id}/resubmit on a draft with 0 photos, 0 documents
   -> 200 Event resubmitted for approval | new status: pending
```

The wizard never calls `/resubmit` (it edits in place with `PATCH`), so this is not reachable through the UI — but it is reachable by any teacher with a token, and the Dean's queue is where the result lands.

**Fix:** move the two `count_documents` checks into a helper and call it from all three paths.

## S-7 (Medium) Production CORS and email links still default to the LAN dev setup

- `cors_origin_regex` (`backend/app/config.py:111`) defaults to a pattern admitting **every** private-LAN address and `localhost`, on `http` or `https`, and `main.py` pairs it with `allow_credentials=True`. The docstring says to narrow it in production; nothing enforces that.
- The live `backend/.env` still has `FRONTEND_URL=http://172.16.1.229:5173`. Every verification and password-reset link is therefore built as plain `http` with a one-time token in the query string. `config.py` logs `frontend_url_insecure` and starts anyway.

This was listed as config follow-up B-24 in the previous report and is unchanged.

**Fix:** set `FRONTEND_URL` to the production HTTPS origin and `CORS_ORIGIN_REGEX` to the Vercel pattern (or empty) before the next deploy. Consider refusing to boot, rather than warning, when `REQUIRE_EMAIL_VERIFICATION` is on and `FRONTEND_URL` is insecure and non-local.

## S-8 (Low) `GET /upload-limits` is unauthenticated

`get_active_upload_limits` (`backend/app/routers/events.py:1888`) takes no `authorization` parameter, unlike every other route in the module. It discloses the deployment's configured limits to anyone. Low impact, but it is an unintended gap rather than a documented public endpoint.

## S-9 (Low) The bulk-onboard CSV upload has no size limit

`bulk_onboard_teachers_file` (`backend/app/routers/superadmin.py:1281`) does `content_bytes = await file.read()` — the whole upload into memory, with no cap and no type check. Every other upload path in the codebase goes through `stream_upload`, which spools to disk and enforces `settings.max_upload_size_bytes` (currently `MAX_UPLOAD_SIZE_MB=1024`). Superadmin-only, so the exposure is small, but it is an easy way to OOM the worker.

---

# Part 2 — Functional bugs

## B-1 (High) The test suite fails on the command the project documents **[reproduced]**

`update_teacher_event` skips the mandatory-upload check when a **pytest-only** environment variable is present (`backend/app/routers/events.py:1516`):

```python
should_validate_uploads = not payload.save_as_draft and (
    "PYTEST_CURRENT_TEST" not in os.environ or x_enforce_upload_validation == "true"
)
```

The suite is `unittest`-based and the documented command is `python -m unittest discover -t . -s tests`, which never sets that variable. So the escape hatch never fires and eight tests fail:

```
Ran 409 tests in 20.2s
FAILED (failures=8)
AssertionError: 400 != 200 : {"detail":"At least one photo is required before submitting the event for approval."}
```

Failing: `test_event_history` (3), `test_notifications` (2), `test_validation` (2), plus `test_draft_saves_stay_out_of_the_trail_until_submitted`.

Setting the variable makes the whole suite green, which confirms the single root cause:

```
PYTEST_CURRENT_TEST=dummy python -m unittest discover -t . -s tests
Ran 409 tests in 19.6s
OK
```

Two problems, not one. The suite is red for anyone following the README, and production request handling branches on the test environment and on an `X-Enforce-Upload-Validation` request header that exists only for tests.

**Fix:** delete the env-var branch and the header. Have the affected tests attach a photo and a document, or inject the validation as a dependency the tests can override. Test-only behaviour should not be reachable from a production request header.

## B-2 (High) Bulk onboarding sends up to 500 SMTP messages inside one request

`bulk_onboard_teachers` (`backend/app/routers/superadmin.py:1177`) calls `email_service.send_teacher_credentials_email(...)` **synchronously in the loop** (`:1236`). `send_credentials_to_teachers` does the same (`:1340`). `BulkOnboardTeachersRequest.teachers` and `SendCredentialsRequest.user_ids` both allow `max_length=500`.

Each send is a full SMTP session — connect, STARTTLS, login, send — with `SMTP_TIMEOUT_SECONDS=10` and one retry on a transient failure. At two to five seconds each, 500 recipients is 15–40 minutes in a single HTTP request. Railway and every browser will have given up long before. The accounts are created regardless, so the admin sees a failed request over a partly-completed job.

Every other email path in the codebase uses `BackgroundTasks` for exactly this reason (see `auth.py` `_deliver_verification`, and `create_dean` in this same file).

**Fix:** move the sends to `BackgroundTasks`, or a queue, and return the created list immediately.

## B-3 (High) `send-credentials` can lock teachers out of their accounts

`send_credentials_to_teachers` (`backend/app/routers/superadmin.py:1302`) loops over `payload.user_ids` and calls `find_user_or_404(user_id)` **inside the loop** (`:1314`). That helper raises `HTTPException(404)`.

For each teacher processed before the bad id, the loop has already run:

```python
users.update_one({"_id": doc["_id"]}, {
    "$set": {"password_hash": hash_password(temp_password), "must_change_password": True, ...},
    "$inc": {"token_version": 1},
})
```

When a later id is malformed or points at a deleted account, the request 404s. The password hashes are already committed and every session is already invalidated, but `updated_teachers` — the **only** record of the generated plaintext passwords — is discarded with the response. Any teacher whose reset committed but whose email had not yet been sent now has an account with a password that exists nowhere.

The same shape means one bad id discards the whole report of what did happen.

**Fix:** resolve and validate every id before mutating anything, then skip (and report) the ones that do not resolve instead of aborting. The loop already `continue`s past non-teachers; unknown ids should be treated the same way.

## B-4 (Medium) The report PDF silently drops Hindi and every non-Latin script **[reproduced]**

`backend/app/services/report_pdf.py` registers no fonts and uses `Helvetica` throughout (`:193` and the whole `_styles()` block). Helvetica is a Latin-1 Type 1 font. Devanagari is not dropped loudly — it is replaced with boxes:

```
Latin name   -> ['Event Name', 'National Science Day']
Hindi name   -> ['Event Name', '■■■■■■■■■ ■■■■■■■ ■■■■']
Mixed name   -> ['Event Name', 'Science ■■■■ 2026']
```

The PDF builds and downloads without error, so nothing signals the problem. This affects the event name, venue, organiser, the teacher's name and the entire verbatim description — on the official, signed accreditation record of an Indian university.

The previous report closed B-11 ("PDF report returns 500 for Hindi event names"). It no longer crashes; it now loses the text instead.

**Fix:** register a Unicode TTF that covers Devanagari (e.g. Noto Sans Devanagari) with `pdfmetrics.registerFont` and use it in the paragraph styles.

## B-5 (Medium) `DELETE /notifications/clear-all` is dead — it is shadowed by the by-id route **[reproduced]**

In `backend/app/routers/events.py`, `delete_notification` (`:2333`) registers `/notifications/{notification_id}` and `/teacher/notifications/{notification_id}`. `clear_all_notifications` (`:2373`) is defined **after** it and registers `/notifications/clear-all` among its paths. FastAPI matches in registration order, so `"clear-all"` is bound as `notification_id`, fails `to_object_id`, and 404s:

```
DELETE /notifications/clear-all             -> 404 {"detail":"Notification not found"}
DELETE /teacher/notifications/clear-all     -> 404 {"detail":"Notification not found"}
DELETE /notifications                       -> 200 {"success":true,...,"deleted_count":7}
```

The frontend calls the bare `DELETE /notifications` (`frontend/src/utils/notificationService.js:171`), so users are not affected today. The two `/clear-all` aliases are documented dead weight that will bite the next client written against them.

**Fix:** register the literal routes before the parameterised one, or drop the `/clear-all` aliases.

## B-6 (Medium) The accreditation CSV export includes drafts and archived events **[reproduced]**

`export_events_csv` (`backend/app/routers/superadmin.py:939`) builds its query from `status`, `event_type` and the date range only. It never excludes `status == "draft"` or `archived_at != None`:

```
draft excluded?   False
archive excluded? False
```

Every other read path treats drafts as invisible — `find_dean_visible_event_or_404` 404s on them, `/dean/events` filters `{"status": {"$ne": "draft"}}`, and `reports.get_event` refuses both drafts and archived events because *"a report asserts a live approval."* The NAAC/NIRF export is the one place that reasoning matters most, and it is the one place that does not apply it.

The result: teachers' unfinished scratchpads and events the Dean deliberately shelved are submitted as part of an accreditation return.

**Fix:** add `{"status": {"$ne": "draft"}, "archived_at": None}` to the base query, or make their inclusion an explicit opt-in parameter.

## B-7 (Medium) Superadmin password reset returns HTTP 500 for a long password **[reproduced]**

`ResetUserPasswordRequest` (`backend/app/schemas/superadmin.py:139`) is the only password schema in the codebase without the bcrypt byte-length validator. `RegistrationRequest`, `ResetPasswordRequest` and `ChangePasswordRequest` all run `_check_new_password`; this one only sets `max_length=128` **characters**.

bcrypt reads at most 72 **bytes**, and `hash_password` raises `ValueError` past that. The route calls it unguarded (`superadmin.py:657`):

```
POST /superadmin/users/{id}/reset-password with a 30-char emoji password
   schema accepts it: 30 chars / 120 bytes
   hash_password raises ValueError -> ValueError (uncaught in the route = HTTP 500)
```

Any non-ASCII password of moderate length — Hindi, accented Latin, emoji — trips it. The admin sees a 500 with no explanation instead of the clear message the other endpoints give.

**Fix:** add the `_check_new_password` validator to `ResetUserPasswordRequest`.

## B-8 (Medium) The Dean's two search boxes return different results

`matchesEventSearch` (`frontend/src/utils/constants.js:169`) matches on `event_name`, `location`, `event_type` and `organizer`. Its own docstring says:

> The field list mirrors the `q` filter of GET /dean/events … the same words typed into either box have to find the same events, or the two pages disagree.

The server-side `q` filter (`backend/app/routers/events.py`, the `clauses` list) matches those four **plus the submitting teacher**, resolved through a `users` lookup on name and email. The client helper has no equivalent.

`matchesEventSearch` is used only by `DeanDashboard.jsx:243`, which filters its own fetched rows; All Events asks the server. So typing a teacher's name into the dashboard search finds nothing, while the same words on All Events find their events. The two pages disagree, exactly as the comment warns.

**Fix:** either add the teacher's name/email to the rows the dashboard holds and match on them, or have the dashboard search go through the server like All Events does.

## B-9 (Medium) The client accepts video formats the server rejects, after the upload finishes

`validatePick` in `frontend/src/utils/uploadRules.js:144` validates video only as:

```js
if (!file.type.startsWith("video/")) { rejections.push(`"${file.name}" is not a video.`); continue; }
```

The server's `MEDIA_TYPES` (`backend/app/services/storage_service.py`) accepts exactly `.mp4`, `.webm` and `.mov`. So `.mkv` (`video/x-matroska`), `.avi`, `.flv`, `.3gp` and `.m4v` all pass the browser check, upload in full — up to the 200 MB video budget, over whatever connection the teacher has — and are then rejected with *"Unsupported media file."*

That is the precise failure the module's own header says it exists to prevent: *"this exists so a teacher learns about a limit before spending minutes uploading, not after."* The image and document checks do mirror the server correctly; only video drifted.

**Fix:** check the extension against an explicit `["mp4", "webm", "mov"]` list, as `ALLOWED_DOC_EXTENSIONS` already does for documents.

## B-10 (Medium) `PATCH /users/me` clears phone and department when they are omitted

`update_my_profile` (`backend/app/routers/users.py:25`) writes both fields unconditionally for teachers and deans:

```python
if user.get("role") in ("teacher", "dean"):
    update_fields["phone"] = payload.phone          # defaults to None
    update_fields["department"] = payload.department # defaults to None
```

`UpdateProfileRequest` defaults both to `None`, so a `PATCH` sending only `name` silently erases the user's mobile number — which is what lists them in the faculty-coordinator directory (PRD 5) — and their department.

The superadmin's equivalent, `update_user_profile` (`superadmin.py:612`), gets this right with `if payload.phone is not None`.

`EditProfileModal.jsx:100` always sends all three fields, so today this is latent rather than user-visible. It is a `PATCH` that behaves like a `PUT`, and it will lose data as soon as any client or script sends a partial update.

**Fix:** guard each field with `is not None`, matching the superadmin route. If "clear this field" must stay expressible, make it an explicit empty string.

## B-11 (Low) A Dean can change the progress stage of an archived event

`update_event_stage` (`backend/app/routers/events.py:1194`) resolves the event with `find_event_or_404`, not `find_dean_visible_event_or_404`. Every other Dean decision uses the latter, whose docstring states the rule:

> Archived events are hidden the same way, so nothing can be approved, rejected or reported on from the shelf.

Stage changes are the exception, and they also notify the teacher, so a shelved event can generate "marked completed" notifications.

**Fix:** use `find_dean_visible_event_or_404(event_id)`.

## B-12 (Low) The media upload error advertises HEIC, which is rejected

`inspect_media` (`backend/app/services/storage_service.py:214`) refuses anything outside `MEDIA_TYPES` with:

> Unsupported media file. Allowed: JPEG, PNG, WebP, GIF **and HEIC** photos, and MP4, WebM and MOV videos

`MEDIA_TYPES` has no `.heic` or `.heif` entry — HEIC appears only in `LEGACY_SERVABLE_TYPES`, which exists so photos uploaded *before* the whitelist keep rendering. iPhones shoot HEIC by default, so a teacher uploading straight from an iPhone is told the format is allowed at the moment it is refused.

**Fix:** drop HEIC from the message, or add it to `MEDIA_TYPES` if it is meant to be accepted.

## B-13 (Low) The frontend ships as one 1.09 MB JavaScript chunk

`vite build` emits `dist/assets/index-*.js` at 1,087 kB (296 kB gzip), with the bundler's own warning that no code splitting is configured. Every visitor — including a teacher opening the login page on campus mobile data — downloads all three role dashboards, Recharts, and the whole create-event wizard.

The previous report recorded 831 kB; it has grown 31% since.

**Fix:** `React.lazy` + `Suspense` on the role route groups, and a manual chunk for `recharts`, which only the superadmin dashboard uses.

## B-14 (Low) `export_events_csv` shadows the imported `status` module

`backend/app/routers/superadmin.py:939` declares a query parameter named `status`, which shadows `fastapi.status` imported at the top of the file. The function body happens not to need `status.HTTP_*`, so it works — but any future `raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, ...)` added to this handler will fail with `AttributeError: 'str' object has no attribute 'HTTP_400_BAD_REQUEST'`.

**Fix:** rename the parameter (`event_status`) and use `alias="status"` to keep the query-string name.

## B-15 (Low) The coordinator directory loads every user and card on every call

`_coordinator_entries` (`backend/app/routers/directory.py`) runs `users.find({"phone": {"$nin": [None, ""]}})` and `faculty_coordinators.find({})` with no limit, then dedupes, filters by the search term and sorts — all in Python. `limit` is applied only to the finished list, and there is no index on `phone` (`ensure_indexes` creates none).

It is called by the create-event wizard's coordinator autocomplete, so it runs on keystrokes. Fine at a few hundred staff; it degrades linearly and will not show up until it does.

**Fix:** push the search into the query with a regex on `name`, add an index on `phone`, and apply the limit in MongoDB.

## B-16 (Low) `parse_range` builds a malformed `Content-Range` for a zero-length file

In `backend/app/routers/files.py`, the suffix branch of `parse_range` (`bytes=-N`) returns `(max(0, length - suffix), length - 1)` without the `end < start` check the other branch has. For `length == 0` that is `(0, -1)`, producing `Content-Range: bytes 0--1/0` and `Content-Length: 0` with a 206.

`stream_upload` rejects empty uploads, so this is only reachable for legacy GridFS objects. Noted for completeness.

**Fix:** return the 416 for `length == 0` in the suffix branch too.

---

## Notes on things that are *not* bugs

Checked and found correct — recorded so the next audit does not re-open them:

- **Pydantic private-attribute inheritance.** `_enforce_not_past` is `True` on `EventCreateRequest` and `False` on `EventUpdateRequest` at runtime, so a rejected event with a lapsed date really can be resubmitted.
- **Dean dashboard vs. All Events counts.** `dean_dashboard_stats` uses `total("rejected", "revoked")`, which matches `STATUS_BUCKETS["rejected"]` and the frontend's `getStatusBucket`. (This was changed in the 19:09 edit during the audit; the earlier version did undercount.)
- **Upload-limit defaults.** `frontend/src/utils/uploadLimits.js` matches `DEFAULT_UPLOAD_LIMITS` and `LIMIT_BOUNDS` in the backend field for field.
- **Secrets.** `backend/.env` is gitignored and untracked; only `.env.example` files are committed.
- **XSS.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `document.write` anywhere in `frontend/src`. Email templates escape all interpolated values; the report PDF escapes every field and refuses to linkify a non-`http(s)` social URL.
- **Signed file links.** `/files/{id}` verifies an HMAC over `{id}:{exp}` with `hmac.compare_digest`, sends `X-Content-Type-Options: nosniff`, and serves anything outside the whitelist as an `application/octet-stream` attachment. R2 objects get the same treatment through pre-signed response overrides.
- **Auth coverage.** Every non-auth route enforces a role check; the superadmin router does it as a router-level dependency so an unauthenticated caller gets 401 rather than a 422 echoing the schema.
- **Race handling on event transitions.** `update_event` filters on the expected status and appends history in the same write, so a teacher edit racing a Dean approval is a 409, not a silent overwrite.

---

## Suggested order of work

| # | Finding | Why first |
|---|---|---|
| 1 | **S-1** | Live authentication bypass of brute-force protection. One-line config fix. |
| 2 | **S-2** | Leaks a credential and the feature is broken; swap the email template. |
| 3 | **B-3** | Can permanently lock teachers out. Small, self-contained fix. |
| 4 | **S-3** | Account takeover from a link. Needs a small frontend change too. |
| 5 | **B-1** | The suite must be green before any of the above can be verified. |
| 6 | **S-4, B-6** | Both sit on the accreditation export, fix together. |
| 7 | **B-2** | Bulk onboarding is unusable at real batch sizes. |
| 8 | **B-4** | Blocks Hindi-language events from producing a valid report. |
| 9 | Remainder | Medium and low findings above. |
