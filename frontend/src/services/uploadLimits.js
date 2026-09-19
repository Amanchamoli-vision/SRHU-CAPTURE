/**
 * The Super Admin's photo and video upload limits.
 *
 * These used to be constants in `utils/uploadRules.js` that had to be kept in
 * step with `backend/app/config.py` by hand. They are server data now: the
 * Super Admin edits them in the console, every teacher's wizard reads them on
 * load, and raising a cap needs no deploy.
 *
 * Documents are deliberately not here — their budget is still fixed.
 */

import { apiJson } from "./api";

/**
 * Used until the request lands, and kept as the answer if it fails. These are
 * the values that were hardcoded before this was configurable, so a teacher
 * whose limits request fails gets the old behaviour rather than a broken step.
 *
 * `null` means "no limit", which is what photo-total and video-count were
 * before the Super Admin could set them.
 */
export const FALLBACK_UPLOAD_LIMITS = Object.freeze({
  max_photos_per_event: 10,
  max_photo_size_mb: 20,
  max_photo_total_mb: null,
  max_videos_per_event: null,
  max_video_size_mb: 200,
  max_video_total_mb: 200,
});

// Shared across everything that mounts at once, so the wizard's four steps
// cost one request rather than four. Mirrors listEventTypes().
let inFlight = null;

export async function fetchUploadLimits({ force = false } = {}) {
  if (force) inFlight = null;
  if (!inFlight) {
    inFlight = apiJson("/upload-limits")
      .then((data) => ({ ...FALLBACK_UPLOAD_LIMITS, ...(data?.limits || {}) }))
      .catch((error) => {
        inFlight = null; // let the next caller retry
        throw error;
      });
  }
  return inFlight;
}

/** Drop the cache so the next read hits the server (after a Super Admin save). */
export function forgetUploadLimits() {
  inFlight = null;
}

/* ------------------------------------------------------------------ */
/* Super Admin console                                                 */
/* ------------------------------------------------------------------ */

/** The configuration, the built-in defaults and the allowed ranges. */
export async function getUploadLimitsSettings() {
  return apiJson("/superadmin/upload-limits");
}

/** Replace the configuration. The payload is the whole set of limits. */
export async function saveUploadLimitsSettings(limits) {
  const data = await apiJson("/superadmin/upload-limits", {
    method: "PUT",
    body: limits,
  });
  forgetUploadLimits();
  return data;
}
