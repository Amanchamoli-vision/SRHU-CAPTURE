/**
 * Service for fetching and managing configurable system upload limits.
 */

import { apiJson } from "./api";

export const DEFAULT_UPLOAD_LIMITS = {
  max_photos_per_event: 10,
  max_photo_size_mb: 20,
  max_photo_total_mb: null,
  max_videos_per_event: null,
  max_video_size_mb: 200,
  max_video_total_mb: 200,
};

let cachedLimits = null;

/**
 * Fetch the active upload limits for photos and videos.
 * Used by teachers in Create/Edit event forms at runtime.
 */
export async function fetchUploadLimits({ force = false } = {}) {
  if (force) cachedLimits = null;
  if (cachedLimits) return cachedLimits;

  try {
    const data = await apiJson("/upload-limits");
    if (data?.limits) {
      cachedLimits = {
        ...DEFAULT_UPLOAD_LIMITS,
        ...data.limits,
      };
      return cachedLimits;
    }
  } catch (err) {
    console.warn("Failed to fetch upload limits from server, using defaults:", err);
  }

  return DEFAULT_UPLOAD_LIMITS;
}

/**
 * Fetch upload limits and configuration metadata for Super Admin settings panel.
 */
export async function fetchSuperAdminUploadLimits() {
  const data = await apiJson("/superadmin/upload-limits");
  return {
    limits: {
      ...DEFAULT_UPLOAD_LIMITS,
      ...(data?.limits || {}),
    },
    defaults: data?.defaults || DEFAULT_UPLOAD_LIMITS,
    updatedAt: data?.updated_at || null,
    updatedBy: data?.updated_by || null,
  };
}

/**
 * Update upload limits in the database (Super Admin only).
 */
export async function updateSuperAdminUploadLimits(payload) {
  const data = await apiJson("/superadmin/upload-limits", {
    method: "PUT",
    body: payload,
  });
  cachedLimits = null; // Invalidate client-side cache
  return data;
}

/**
 * Reset upload limits to system defaults (Super Admin only).
 */
export async function resetSuperAdminUploadLimits() {
  const data = await apiJson("/superadmin/upload-limits/reset", {
    method: "POST",
  });
  cachedLimits = null; // Invalidate client-side cache
  return data;
}
