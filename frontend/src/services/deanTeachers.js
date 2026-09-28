/**
 * Dean teacher-management calls shared by more than one screen.
 */

import { apiJson, apiUpload } from "./api";

// Bulk invitations are split into requests of this many, so each request finishes
// well inside a proxy timeout while emails are delivered synchronously. The
// server caps a request at 25.
export const INVITE_CHUNK = 10;

/**
 * Send invitations (a one-time "set your password" link) to these teacher ids,
 * a chunk at a time.
 *
 * Resolves with `{ results, error }`: one result per id (`sent`, `skipped` or
 * `failed`, with a reason), and the message that stopped the run early, if
 * any -- ids after that point are reported as failed "Not attempted" rather
 * than left out. A 401 is re-thrown so the caller can send the Dean to sign in.
 *
 * `lookup(id)` fills in a name and email the server could not (an id that
 * turned out not to be a teacher); `onProgress(done, results)` runs after
 * each chunk.
 */
export async function sendInvitesInChunks(ids, { lookup, onProgress } = {}) {
  const results = [];
  let error = "";

  for (let i = 0; i < ids.length; i += INVITE_CHUNK) {
    const chunk = ids.slice(i, i + INVITE_CHUNK);
    try {
      const data = await apiJson("/dean/teachers/invite", {
        method: "POST",
        body: { user_ids: chunk },
      });
      results.push(...(data?.results || []));
    } catch (err) {
      if (err?.status === 401) throw err;
      error = err?.message || "The request failed.";
      ids.slice(i).forEach((id) => {
        results.push({ user_id: id, status: "failed", reason: `Not attempted: ${error}` });
      });
      break;
    }
    onProgress?.(Math.min(ids.length, i + chunk.length), [...results]);
  }

  const withNames = results.map((r) => {
    const known = lookup?.(r.user_id);
    return { ...r, name: r.name ?? known?.name ?? null, email: r.email ?? known?.email ?? null };
  });
  return { results: withNames, error };
}

/** Upload a roster file and get the server's row-by-row preview. Nothing is written. */
export function previewTeacherImport(file, { onProgress, signal } = {}) {
  return apiUpload("/dean/teachers/import/preview", { file, onProgress, signal });
}

/** Create Teacher accounts for the confirmed rows. */
export function importTeachers(teachers) {
  return apiJson("/dean/teachers/import", { method: "POST", body: { teachers } });
}

/** Add one teacher; with `send_invite` the invitation goes out straight away. */
export function createTeacher(teacher) {
  return apiJson("/dean/teachers", { method: "POST", body: teacher });
}
