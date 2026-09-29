/**
 * Dean teacher-management calls shared by more than one screen.
 */

import { apiJson, apiUpload } from "./api";

/**
 * Send invitations (a one-time "set your password" link) to these teacher ids
 * in one request. The server sends them in parallel and reports every one.
 *
 * Resolves with `{ results, error }`: one result per id (`sent`, `skipped` or
 * `failed`, with a reason), and -- if the request itself failed -- its
 * message, with every id reported as failed "Not attempted" rather than left
 * out. A 401 is re-thrown so the caller can send the Dean to sign in.
 *
 * `lookup(id)` fills in a name and email the server could not (an id that
 * turned out not to be a teacher).
 */
export async function sendInvites(ids, { lookup } = {}) {
  let results = [];
  let error = "";
  try {
    const data = await apiJson("/dean/teachers/invite", {
      method: "POST",
      body: { user_ids: ids },
    });
    results = data?.results || [];
  } catch (err) {
    if (err?.status === 401) throw err;
    error = err?.message || "The request failed.";
    results = ids.map((id) => ({ user_id: id, status: "failed", reason: `Not attempted: ${error}` }));
  }

  const withNames = results.map((r) => {
    const known = lookup?.(r.user_id);
    return { ...r, name: r.name ?? known?.name ?? null, email: r.email ?? known?.email ?? null };
  });
  return { results: withNames, error };
}

/** Every teacher matching the list's filters -- ids, names, emails -- in one request. */
export async function fetchTeacherIds(filterParams) {
  const data = await apiJson(`/dean/teachers/ids?${filterParams}`);
  return data?.teachers || [];
}

/** Remove or delete the selected teachers in one request (`kind`: "remove" | "delete"). */
export function bulkTeachers(kind, ids) {
  return apiJson(`/dean/teachers/bulk-${kind}`, { method: "POST", body: { user_ids: ids } });
}

/** Every event matching the Dean list's filters -- ids and names -- in one request. */
export async function fetchEventIds(filterParams) {
  const data = await apiJson(`/dean/events/ids?${filterParams}`);
  return data?.events || [];
}

/** Delete or archive the selected events in one request (`action`: "delete" | "archive"). */
export function bulkEvents(action, ids, extra = {}) {
  return apiJson(`/dean/events/bulk-${action}`, { method: "POST", body: { event_ids: ids, ...extra } });
}

/** Upload a roster file and get the server's row-by-row preview. Nothing is written. */
export function previewTeacherImport(file, { onProgress, signal } = {}) {
  return apiUpload("/dean/teachers/import/preview", { file, onProgress, signal });
}

/** Create Teacher accounts for the confirmed rows. */
export function importTeachers(teachers, { sendInvites = false } = {}) {
  // With sendInvites the server invites the new accounts in this same
  // request -- one call instead of import-then-invite.
  return apiJson("/dean/teachers/import", {
    method: "POST",
    body: { teachers, send_invites: sendInvites },
  });
}

/** Add one teacher; with `send_invite` the invitation goes out straight away. */
export function createTeacher(teacher) {
  return apiJson("/dean/teachers", { method: "POST", body: teacher });
}
