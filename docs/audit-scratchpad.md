# SCRATCHPAD — Login & Create Event Audit

## [LOGIN]
- **Entry point:** [Login.jsx](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L1) (`/login`)
- **Success path:**
  1. User enters email and password into form.
  2. `handleSubmit` cleans email (`email.trim()`) and calls `supabase.auth.signInWithPassword({ email: cleanEmail, password })` ([Login.jsx:26-29](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L26-L29)).
  3. Supabase Auth generates access & refresh tokens stored in `localStorage` under `sb-<project-ref>-auth-token`.
  4. Query executed against `public.users` table: `.from('users').select('id, name, email, role').eq('id', authData.user.id).single()` ([Login.jsx:38-42](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L38-L42)).
  5. User profile loaded into local React state `setUserProfile(profile)`.
  6. Navigates based on `profile.role` to:
     - `teacher` -> `/teacher/dashboard` ([Login.jsx:46](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L46))
     - `dean` -> `/dean/dashboard` ([Login.jsx:49](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L49))
     - `admin` -> `/admin/dashboard` ([Login.jsx:52](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L52))
- **Failure paths found:**
  1. *Empty Fields Validation Error:* ([Login.jsx:20-23](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L20-L23)) sets `error = 'Please enter both email and password'`.
  2. *Supabase Auth Error:* ([Login.jsx:31-36](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L31-L36))
     - Invalid credentials -> `Invalid email or password`.
     - Email unconfirmed -> `Email not confirmed. Please check your inbox or contact the administrator.`
     - Generic auth failure -> `authError.message`.
  3. *Profile Fetch Error / Missing Row:* ([Login.jsx:58-69](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L58-L69))
     - If `profileError` (e.g. `PGRST116` missing row or RLS denial), calls `await supabase.auth.signOut()` and displays error: `Failed to load user profile. Please contact the administrator.`
     - *Flaw:* If `signOut()` throws or network drops, session persists in `localStorage` while user is locked out on the login form.
  4. *Unrecognized Role:* ([Login.jsx:55-57](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L55-L57))
     - Sets `error = 'Invalid role assigned to user'` without signing out or redirecting.
  5. *Unhandled Exceptions:* ([Login.jsx:70-74](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/auth/Login.jsx#L70-L74))
     - Caught by generic try/catch block, sets `error = err.message || 'An unexpected error occurred'`.
- **Redirect logic correctness (teacher/dean/admin/invalid role):**
  - Teacher: Correct (`/teacher/dashboard`).
  - Dean: Correct (`/dean/dashboard`).
  - Admin: Correct (`/admin/dashboard`).
  - Invalid / Unknown role: Fails safely with message, but session remains authenticated in Supabase SDK until explicitly cleared.
  - Already logged in: **Broken.** Visiting `/login` when an active session already exists in `localStorage` does NOT redirect to the user's dashboard; it displays the login form again.
- **Session persistence check (refresh, tab reopen):**
  - Supabase client persists session in `localStorage`.
  - On page refresh on dashboards ([TeacherDashboard.jsx](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/TeacherDashboard.jsx#L22), [DeanDashboard.jsx](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/dean/DeanDashboard.jsx#L38)), `supabase.auth.getUser()` or `getSession()` retrieves token correctly.
  - However, because there is no global `AuthContext` or state hydration, every protected page repeats independent session restoration in `useEffect`.

---

## [ROUTE GUARD]
- **Routes checked (from [App.jsx](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/App.jsx#L24-L81)):**
  1. `/login` -> `Login`
  2. `/teacher/dashboard` -> `TeacherDashboard`
  3. `/teacher/create-event` -> `CreateEvent`
  4. `/teacher/event/:id` -> `TeacherEventDetails`
  5. `/teacher/event/:id/edit` -> `EditEvent`
  6. `/dean/dashboard` -> `DeanDashboard`
  7. `/dean/events` -> `AllEvents`
  8. `/dean/event/:id` -> `DeanEventDetails`
  9. `/admin/dashboard` -> `AdminDashboard`
  10. `/admin/users` -> `UserManagement`
  11. `/admin/logs` -> `SystemLogs`
  12. `/` -> Redirect to `/login`
  *(Note: `CreateDean.jsx` exists in source but is missing from routes).*
- **Routes with NO guard (No router guard and NO in-component guard):**
  - `/teacher/create-event` ([CreateEvent.jsx](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/CreateEvent.jsx)): **0 auth checks on mount.** Renders full creation form to any unauthenticated visitor!
  - `CreateDean.jsx`: **0 auth checks on mount** and not even registered in `App.jsx`.
- **Routes with duplicated/inconsistent guard logic:**
  - `TeacherDashboard.jsx` ([TeacherDashboard.jsx:22-38](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/TeacherDashboard.jsx#L22-L38)): Uses `supabase.auth.getUser()`, queries `users` table, checks `if (profile.role !== 'teacher') navigate('/login')`.
  - `DeanDashboard.jsx` ([DeanDashboard.jsx:38-51](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/dean/DeanDashboard.jsx#L38-L51)): Uses `supabase.auth.getSession()`, checks session existence only. **NO ROLE CHECK!** A teacher with a valid session can access `/dean/dashboard`.
  - `AllEvents.jsx` ([AllEvents.jsx:24-34](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/dean/AllEvents.jsx#L24-L34)): Checks `supabase.auth.getSession()`. **NO ROLE CHECK!**
  - `DeanEventDetails.jsx` ([EventDetails.jsx:33-43](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/dean/EventDetails.jsx#L33-L43)): Checks `supabase.auth.getSession()`. **NO ROLE CHECK!**
  - `AdminDashboard.jsx` ([AdminDashboard.jsx:36-62](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/admin/AdminDashboard.jsx#L36-L62)): Uses `supabase.auth.getUser()`, queries `users` table, verifies `profile.role === 'admin'`.
  - `UserManagement.jsx` ([UserManagement.jsx:32-42](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/admin/UserManagement.jsx#L32-L42)): Checks `supabase.auth.getSession()`. **NO ROLE CHECK!**
  - `SystemLogs.jsx` ([SystemLogs.jsx:23-33](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/admin/SystemLogs.jsx#L23-L33)): Checks `supabase.auth.getSession()`. **NO ROLE CHECK!**
- **Flash-of-content risk (yes/no per route):**
  - `/login`: No
  - `/teacher/dashboard`: **Yes** (initial `loading = true` spinner renders, but component renders before redirect on failure)
  - `/teacher/create-event`: **YES (CRITICAL)**. Has no loading state for auth; immediately renders the full event creation form.
  - `/teacher/event/:id`: **Yes**
  - `/teacher/event/:id/edit`: **Yes**
  - `/dean/dashboard`: **YES**. Any authenticated user (including teacher) sees dean UI skeleton and stats container while backend API calls fail with 403.
  - `/dean/events`: **YES**. Dean table shell renders for any authenticated user.
  - `/dean/event/:id`: **YES**.
  - `/admin/dashboard`: Low (has loading spinner, checks role before unblocking).
  - `/admin/users`: **YES**. Any logged in user sees user table frame.
  - `/admin/logs`: **YES**.

---

## [CREATE EVENT]
- **Pre-submit validation gaps:**
  - Client-side checks require: title, description, start_date, end_date, venue, expected_attendees > 0.
  - Gaps:
    1. No client-side file size limit enforcement (e.g. 10MB per image/video, 25MB per document).
    2. No MIME-type / extension whitelist check before initiating upload (accepts any file dragged into inputs).
    3. No verification that `end_date >= start_date`.
    4. Submitting user ID is taken from `(await supabase.auth.getUser()).data.user.id` on click; if session expired mid-fill, submission fails ungracefully after attempting storage uploads.
- **Auth check before insert (yes/no, where):**
  - In `handleSubmit` ([CreateEvent.jsx:482-491](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/CreateEvent.jsx#L482-L491)): Checks `supabase.auth.getUser()`. If null, throws error `'You must be logged in to create an event'`.
  - However, there is NO check ensuring user role is `'teacher'` before initiating storage operations.
- **Upload order (media → DB row → rollback correctness):**
  - Order executed in [CreateEvent.jsx:500-660](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/CreateEvent.jsx#L500-L660):
    1. `uploadMediaFiles(files, eventId)` -> Uploads to `event-media` bucket.
    2. `uploadDocumentFiles(files, eventId)` -> Uploads to `event-documents` bucket.
    3. `supabase.from('events').insert(...)` -> Inserts row into `events`.
    4. `supabase.from('event_media').insert(...)` -> Inserts rows into `event_media`.
    5. `supabase.from('event_documents').insert(...)` -> Inserts rows into `event_documents`.
  - Rollback function ([CreateEvent.jsx:291-326](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/CreateEvent.jsx#L291-L326)):
    - Deletes from `event_documents`, `event_media`, `events` DB tables.
    - Removes files from `event-documents` and `event-media` buckets using passed `mediaUploads` and `docUploads`.
- **Orphan risk (storage file uploaded but DB insert fails, or vice versa):**
  - **CRITICAL STORAGE ORPHAN FLAW FOUND in `uploadMediaFiles` & `uploadDocumentFiles`:**
    - Look at [CreateEvent.jsx:202-230](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/CreateEvent.jsx#L202-L230):
      ```javascript
      const uploadMediaFiles = async (files, eventId) => {
        const uploadedFiles = [];
        for (const file of files) {
          // uploads file
          if (error) throw error; // <--- THROWS IMMEDIATELY!
          uploadedFiles.push({ file_path: storagePath, ... });
        }
        return uploadedFiles;
      }
      ```
    - In `handleSubmit`:
      ```javascript
      let mediaUploads = [];
      ...
      mediaUploads = await uploadMediaFiles(mediaFiles, eventId); // If this throws on file #2, mediaUploads remains []!
      ...
      catch (error) {
        await rollbackSubmission(eventId, mediaUploads, docUploads); // mediaUploads is EMPTY []!
      }
      ```
    - If file 1 succeeds and file 2 fails, `uploadMediaFiles` throws without returning. `mediaUploads` in `handleSubmit` remains `[]`. `rollbackSubmission` receives an empty list and never deletes file 1 from Supabase Storage! File 1 is orphaned indefinitely in `event-media`.
    - Same identical flaw in `uploadDocumentFiles` ([CreateEvent.jsx:251-285](file:///c:/Users/caird/Desktop/campus-capture-srhu/frontend/src/pages/teacher/CreateEvent.jsx#L251-L285)).

---

## [AUTHORIZATION BOUNDARY]
- **Is create-event protected only by RLS?**
  - **YES.** The frontend writes directly to Supabase via JavaScript client (`supabase.from('events').insert(...)`). The FastAPI backend is completely bypassed during event creation.
- **RLS policy present for `events` insert?**
  - **Active in DB:** Live probe confirmed RLS is enabled on `events` (anonymous direct insert returned code `42501`: `new row violates row-level security policy for table "events"`).
  - **Repo Defect:** There are NO migration files, SQL schema definitions, or RLS policy definitions checked into version control in this repository. RLS exists solely as an unmanaged configuration in the remote cloud database.
- **Backend endpoint exists for create event?**
  - **NO.** `backend/app/routers/events.py` contains endpoints only for Dean/Admin flows (`/all`, `/{id}`, `/{id}/approve`, `/{id}/reject`, `/{id}/analytics`). There is NO `POST /api/events` endpoint on FastAPI.

---

## [TEST CASES T1–T17 RESULTS (POST-HARDENING)]

| ID | Test Case Description | Result | Details |
|---|---|:---:|---|
| **T1** | Teacher Login Redirect | **PASS** | Valid teacher credentials redirect to `/teacher/dashboard`. |
| **T2** | Dean Login Redirect | **PASS** | Valid dean credentials redirect to `/dean/dashboard`. |
| **T3** | Admin Login Redirect | **PASS** | Valid admin credentials redirect to `/admin/dashboard`. |
| **T4** | Bad Password Error | **PASS** | Returns `Invalid email or password` cleanly without unhandled crash. |
| **T5** | Unconfirmed Email Error | **PASS** | Displays informative email confirmation required message. |
| **T6** | Missing Profile Row Handling | **PASS** | Cleanses localStorage tokens, aborts auth session, and displays administrator contact advice. |
| **T7** | Unauth Access to Teacher Dashboard | **PASS** | Router-level `ProtectedRoute` intercepts and redirects unauthenticated visitor to `/login`. |
| **T8** | Unauth Access to Create Event | **PASS** | Intercepted by `ProtectedRoute allowedRoles={['teacher']}`; zero UI flash, redirects to `/login`. |
| **T9** | Teacher Access to Dean Dashboard | **PASS** | `ProtectedRoute allowedRoles={['dean']}` default-denies teacher access; redirects to `/login`. |
| **T10** | Teacher Access to User Management | **PASS** | `ProtectedRoute allowedRoles={['admin']}` default-denies teacher access; redirects to `/login`. |
| **T11** | Admin Create Dean Route | **PASS** | `/admin/create-dean` registered in router and guarded with `allowedRoles={['admin']}`. |
| **T12** | Create Event Form Validation | **PASS** | Rejects empty required fields (title, dates, venue, attendees <= 0). |
| **T13** | File Size & MIME Pre-Validation | **PASS** | Enforces 10MB limit for media (images/videos) and 25MB for docs (supported types) before upload. |
| **T14** | Create Event Happy Path | **PASS** | Direct client insert to DB + buckets works with teacher auth JWT. |
| **T15** | Create Event Partial Failure Rollback | **PASS** | Accumulator tracks uploads immediately; on mid-way upload failure, preceding files are deleted with 0 orphans. |
| **T16** | Backend Event Creation Endpoint | **DOCUMENTED** | Flagged as architectural follow-up decision; client direct write retained with committed RLS policies. |
| **T17** | Direct Anon DB Insert Block | **PASS** | Supabase RLS enforces authorization; anon insert rejected with `42501`. |

---

## [FIX LIST]

1. **Gap:** Missing router-level `ProtectedRoute` and centralized `AuthContext`.
   - **Fix:** Introduce `AuthContext` providing user, profile, loading states, and a `<ProtectedRoute allowedRoles={[...]} />` wrapper around all private routes in `App.jsx`.
   - **Files Affected:** `frontend/src/context/AuthContext.jsx` (new), `frontend/src/components/common/ProtectedRoute.jsx` (new), `frontend/src/App.jsx`.
   - **Severity:** **CRITICAL**

2. **Gap:** Missing auth check on `/teacher/create-event` leading to full protected UI flash.
   - **Fix:** Guard route with `<ProtectedRoute allowedRoles={['teacher']}>` and verify teacher session.
   - **Files Affected:** `frontend/src/App.jsx`, `frontend/src/pages/teacher/CreateEvent.jsx`.
   - **Severity:** **CRITICAL**

3. **Gap:** Storage orphan risk in `CreateEvent.jsx` rollback logic on multi-file partial upload failure.
   - **Fix:** Track uploaded file paths cumulatively in an outer reference or pass partial uploads into the error catch block so `rollbackSubmission` cleans up all successfully uploaded files even if an intermediate upload fails.
   - **Files Affected:** `frontend/src/pages/teacher/CreateEvent.jsx`.
   - **Severity:** **HIGH**

4. **Gap:** Missing role checks in Dean and Admin pages (`DeanDashboard`, `AllEvents`, `EventDetails`, `UserManagement`, `SystemLogs`).
   - **Fix:** Centralized route guard will prevent teachers/deans from visiting admin/dean paths; eliminate redundant, buggy individual checks.
   - **Files Affected:** `frontend/src/App.jsx`, `frontend/src/pages/dean/*`, `frontend/src/pages/admin/*`.
   - **Severity:** **HIGH**

5. **Gap:** Architecture bypasses backend during event creation; 100% dependent on Supabase RLS with no DB migration / policy code in repository.
   - **Fix:** Export and commit idempotent SQL migration files defining `events`, `event_media`, `event_documents` schemas and RLS policies (`CREATE POLICY ... FOR INSERT TO authenticated USING (auth.uid() = created_by AND ...)`). Optionally introduce a backend proxy endpoint `POST /api/events`.
   - **Files Affected:** `backend/app/routers/events.py`, `backend/migrations/001_rls_policies.sql` (new).
   - **Severity:** **HIGH**

6. **Gap:** Missing route for `/admin/create-dean` in `App.jsx`.
   - **Fix:** Register route `<Route path="/admin/create-dean" element={<ProtectedRoute allowedRoles={['admin']}><CreateDean /></ProtectedRoute>} />`.
   - **Files Affected:** `frontend/src/App.jsx`.
   - **Severity:** **MEDIUM**

7. **Gap:** No client-side file validation (size limits and allowed MIME types) before uploading.
   - **Fix:** Validate files in `handleMediaChange` and `handleDocChange` (max 10MB per image/video, max 25MB per PDF/doc, validate MIME types against whitelist).
   - **Files Affected:** `frontend/src/pages/teacher/CreateEvent.jsx`.
   - **Severity:** **MEDIUM**

8. **Gap:** `/login` does not redirect already authenticated users.
   - **Fix:** Check auth status on `/login` mount; if valid session exists, redirect directly to the corresponding role dashboard.
   - **Files Affected:** `frontend/src/pages/auth/Login.jsx`.
   - **Severity:** **MEDIUM**
