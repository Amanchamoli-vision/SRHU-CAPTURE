/**
 * The platform's configurable upload limits.
 *
 * The server is the source of truth: GET returns the current values, the system
 * defaults, and the min/max it will accept for each field. The constants here
 * exist only so a form can render before the first response lands -- they are a
 * cold-start fallback, never a second opinion.
 */

import { apiJson } from "./api";
import {
  DEFAULT_LIMIT_BOUNDS,
  DEFAULT_UPLOAD_LIMITS,
  OPTIONAL_LIMIT_FIELDS,
} from "../utils/uploadLimits";

// Re-exported so callers have one import for "the limits", while the values
// themselves stay in a module that pulls in nothing.
export { DEFAULT_UPLOAD_LIMITS, DEFAULT_LIMIT_BOUNDS, OPTIONAL_LIMIT_FIELDS };

const CACHE_TTL_MS = 60_000;

/**
 * Bumped whenever an admin saves. Other tabs see the `storage` event and
 * refetch, which is what lets an open create-event wizard notice a change
 * without a full reload.
 */
const BROADCAST_KEY = "cc_upload_limits_rev";

let cache = null; // { limits, fetchedAt }

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked or full storage: cross-tab notification is a nicety, and must
    // never break a save.
  }
}

export function invalidateUploadLimits({ broadcast = true } = {}) {
  cache = null;
  if (broadcast && typeof window !== "undefined") {
    writeStorage(BROADCAST_KEY, String(Date.now()));
  }
}

/**
 * Notify when the cached limits may be stale: another tab saved, or this tab
 * was hidden long enough for the TTL to lapse. Returns an unsubscribe function.
 */
export function subscribeUploadLimits(onStale) {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event) => {
    if (event.key !== BROADCAST_KEY) return;
    cache = null;
    onStale();
  };

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return;
    cache = null;
    onStale();
  };

  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * The active limits, for the teacher-facing upload forms.
 *
 * Never throws: an unreachable server falls back to the defaults, because the
 * wizard warning the teacher early is a convenience and the server enforces the
 * real limits on every upload regardless.
 */
export async function fetchUploadLimits({ force = false } = {}) {
  if (force) cache = null;
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.limits;

  try {
    const data = await apiJson("/upload-limits");
    if (data?.limits) {
      cache = {
        limits: { ...DEFAULT_UPLOAD_LIMITS, ...data.limits },
        fetchedAt: Date.now(),
      };
      return cache.limits;
    }
  } catch (err) {
    console.warn("Failed to fetch upload limits from server, using defaults:", err);
  }

  return DEFAULT_UPLOAD_LIMITS;
}

function normalise(data) {
  return {
    limits: { ...DEFAULT_UPLOAD_LIMITS, ...(data?.limits || {}) },
    updatedAt: data?.updated_at || null,
    updatedBy: data?.updated_by || null,
    updatedByName: data?.updated_by_name || null,
  };
}

/** The settings page's view: current values plus everything needed to edit them. */
export async function fetchSuperAdminUploadLimits() {
  const data = await apiJson("/superadmin/upload-limits");
  return {
    ...normalise(data),
    defaults: { ...DEFAULT_UPLOAD_LIMITS, ...(data?.defaults || {}) },
    bounds: { ...DEFAULT_LIMIT_BOUNDS, ...(data?.bounds || {}) },
    // The largest single file this deployment accepts, whatever the per-file
    // limits are set to.
    deploymentCeilingMb: data?.deployment_ceiling_mb ?? null,
  };
}

export async function updateSuperAdminUploadLimits(payload) {
  const data = await apiJson("/superadmin/upload-limits", {
    method: "PUT",
    body: payload,
  });
  invalidateUploadLimits();
  return normalise(data);
}

export async function resetSuperAdminUploadLimits() {
  const data = await apiJson("/superadmin/upload-limits/reset", { method: "POST" });
  invalidateUploadLimits();
  return normalise(data);
}
