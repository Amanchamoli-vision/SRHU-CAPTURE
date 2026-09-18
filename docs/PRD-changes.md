# Event Management Platform — Change Requirements

**Date:** 2026-09-18
**Roles involved:** Teacher, Dean

---

## 1. Dean — Event Delete Functionality

- On the Dean's sidebar **Events** page, current actions available are **Visibility** and **Rebook**.
- Add a new **Delete** action next to these.
- On clicking Delete, show a confirmation popup with two options:
  - **Archive**
  - **Delete**
- If **Archive** is selected:
  - Create a new **Archive** page.
  - Move the event to the Archive page (do not permanently delete).
- If **Delete** is selected:
  - Permanently delete the event.
- Add **pagination** to the "All Events" page.

---

## 2. Sidebar Color — All Roles

- Change the sidebar color to blue, matching the header/hero section color.
- Apply this consistently across **all roles** (Teacher, Dean, etc.) — sidebar and header should visually match, no mismatched colors.

---

## 3. Event Date/Time Validation (Create Event — Teacher)

- Teacher must **not** be able to create an event with a past date or past time.
- Example: If today is 18-09-2026, the teacher should not be able to create an event dated before today.
- Enforce a valid time-frame restriction — only current/future date-time allowed.
- **Start Time / End Time fields:**
  - Add AM/PM dropdown alongside time selection.
  - Validate that End Time is logically after Start Time.
  - Past times (relative to current date/time) must be blocked from selection.

---

## 4. Event Type — "Other" Option with Custom Input

- In the Create Event form, under **Event Type**:
  - Add an **"Other"** option.
  - When "Other" is selected, show a text box below it so the teacher can type a custom category/event name.
- Additionally, provide a **"+ Add Event"** icon/button to let teachers add a new event type inline.

---

## 5. Organizer / Faculty Coordinator Field

- **Faculty Coordinator field:**
  - Populate with existing faculty names from the database (dropdown/autocomplete).
- **Mobile Number field (new):**
  - When a faculty name is selected, auto-populate their mobile number (from existing faculty data).
- **Add options:**
  - "Add Faculty Coordinator" — allow adding a coordinator not in the existing list.
  - "Add Mobile Number" — allow entering a number not already in the system.
  - Note: This is a separate feature from the "Other" event-type add option in point 4.
  - Any newly added coordinator/mobile number must be **saved to the database**, not just handled on the frontend.
- **Contact Coordinator Number field:**
  - Make this field **optional** (not mandatory). Only required if available.

---

## 6. Contact Number Validation

- Contact number field:
  - Maximum **10 digits**.
  - Only numeric digits allowed — no text/alphabetic characters.

---

## 7. Photo Upload Section

- Allow up to **10 photos** per upload.
- Max size per photo: **20 MB**.
- Allowed formats only: **JPG, PNG, WEBP, GIF**. Reject any other format.
- Photos must be included/visible when an event is saved as a **Draft**.

---

## 8. Video Upload Section

- Total combined video size limit: **50 MB**, regardless of number of videos (whether 4, 5, or 6 videos — total must stay within 50 MB).
  - *(Note: See Point 13 below — a separate/later mention raises a 200 MB total video limit. Please confirm with Yogi which limit is final: 50 MB or 200 MB, since both were mentioned at different points.)*

---

## 9. Document Upload Section

- Accepted formats: **PDF, Word, Excel, PowerPoint, Text, CSV** — valid document types only.
- Max size per document: **5–6 MB** *(clarify exact per-file limit with Yogi)*.
- **Maximum total size for all documents combined: 15 MB.** Any number of documents can be uploaded as long as total stays within 15 MB.

---

## 10. Duplicate File Name Check (Teacher Upload)

- When a teacher uploads photos/videos, check if the file name already exists (duplicate).
- If a duplicate file name is detected:
  - Show a confirmation popup: **"Are you sure you want to upload a file with the same name?"**
  - Apply this same duplicate-check behavior for both **photos** and **videos**.

---

## 11. Video Upload Progress & Size Limit

- Show a **progress indicator** during video upload (upload %, current status).
- Enforce a **maximum total video size limit of 200 MB** (across all videos combined — 10 videos, 5 videos, 3 videos, etc., total must not exceed 200 MB).
- If the limit is exceeded, show a popup: **"You have exceeded the limit. Maximum allowed video size is 200 MB."**
- *(See note in Point 8 — reconcile the 50 MB vs 200 MB video limit conflict.)*

---

## 12. Submit for Approval — Preview & Confirmation

- When the teacher clicks **"Submit for Approval"**:
  - Show a confirmation popup: **"Are you sure you want to submit?"**
  - Before final confirmation, show a **Preview** screen of everything filled in the form (all fields, uploaded files, etc.).
  - Teacher reviews the preview, then clicks **Confirm and Submit**.

---

## 13. Dean — Notification Auto-Removal

- When a teacher creates/submits an event, a notification appears on the Dean's dashboard.
- Once the Dean opens/views the notification:
  - It should be marked as read.
  - It should automatically be removed from the notification list **1 hour** after being viewed.

---

## 14. Teacher — Custom Event Category

- Allow teachers to add their own custom category when creating an event (which category the event belongs to).

---

## 15. Pagination — General

- Add pagination wherever lists can grow large — e.g., the "All Events" listing page, to avoid heavy/slow loading.

---

## 16. Dean — Approve/Reject Flow

- On the Dean's event view, current actions: **Reject** and **Approve**.
- When Dean clicks **Approve**:
  - Show confirmation popup: **"Do you want to approve?"**
  - Next to the Approve confirmation, also show an **"Open Event and Approve"** option — this should open the full event page for review before approving.

---

## 17. Output Event Report — Social Network Link

- At the bottom of the Dean's event page, there is an "Output Event Report" section with a **Social Network Link** field.
- This field is currently **mandatory** — change it to **optional**.
- Reason: If a teacher didn't add this link, the report currently can't be generated because the field blocks submission.

---

## 18. Dean Decision — Revoke vs Reject Clarity

- Currently, **Revoke** and **Reject** appear together/ambiguously under "Dean Decision."
- Separate them clearly into distinct, individual actions — they should not be combined into a single button/control.
- **Tracking Event Progress** section:
  - Improve clarity for the user — use separate, clearly labeled buttons for each distinct action instead of bundling multiple actions into one button.

---

## Open Items — Need Clarification from Yogi

1. **Video size limit conflict:** Point 8 states 50 MB total; Point 11 states 200 MB total. Confirm the correct/final limit.
2. **Document per-file size limit:** "5 MB or 6 MB" mentioned — confirm exact value (total cap of 15 MB is clear).
