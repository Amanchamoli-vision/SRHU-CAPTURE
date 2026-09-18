---
name: campus-capture-uploads
description: Upload limits, allowed formats and the R2/GridFS storage path for Campus Capture. Use when changing file size or count limits, accepted types, the upload flow, or anything touching storage_service.
---

# Campus Capture — uploads

## Limits (per event)

All configurable in `backend/app/config.py`; the frontend mirrors them in
`frontend/src/utils/uploadRules.js`. **Change both or a file the form accepts
is rejected on submit.**

| Kind | Limit | Shape |
|---|---|---|
| Photos | 10 files, 20 MB each | count + per-file |
| Videos | 200 MB combined | **total bytes**, no count cap |
| Documents | 15 MB combined | **total bytes**, no per-file cap |

Videos and documents are budgeted by total size on purpose: "10 videos of
20 MB" and "2 videos of 100 MB" cost the same, so the teacher chooses.

The over-limit copy is specified verbatim by PRD 11:
`You have exceeded the limit. Maximum allowed video size is 200 MB.`

## Formats

Photos: **JPG, PNG, WEBP, GIF only**. HEIC/HEIF were removed, but stay in
`LEGACY_SERVABLE_TYPES` so photos already in storage keep rendering inline
instead of becoming downloads.

Every upload is checked three ways: extension, declared MIME type (must agree
with the extension), and **magic bytes** (`_MAGIC_CHECKS`). The stored
content-type is always the canonical one for the extension, never the client's.
SVG and HTML are excluded by design — a browser could execute them.

## Streaming is not optional

`stream_upload()` buffers to a `SpooledTemporaryFile` that rolls to disk past
2 MB, then hands the rewound stream to `r2_service.upload_stream`
(`upload_fileobj`) or GridFS.

The old `read_upload()` read the whole body into a `bytes`. At a 200 MB video
that is ~200 MB of RSS per concurrent upload, which OOM-kills a small
container. Measured after the change: a 200 MB upload costs **~4 MB** of RSS.
**Never reintroduce a full read on the upload path.** `read_upload()` survives
only for callers that genuinely need the bytes.

## Storage

R2 when `settings.r2_configured`, GridFS otherwise — the switch is inside
`save_upload()` and nothing above it should care. R2 objects are private;
`absolutize()` signs a fresh URL on every read. GridFS files get an
HMAC-signed `/files/{id}` link. Failed deletes are recorded in
`storage_orphans` for later sweeping.

`build_object_key()` prefixes a `uuid4().hex`, so **duplicate file names can
never collide in storage**. The duplicate-name check
(`GET /teacher/events/{id}/uploads/check-name`) exists only so the wizard can
ask "are you sure?" before spending the bytes — it must never reject.

## Caps are enforced twice

Once before the upload and once after the insert (`_record_upload`), because
concurrent uploads can both pass the first check. The post-insert check walks
a running byte total in `_id` order so whichever landed second is the one
rolled back.
