/**
 * Approval status, expressed the Himovation way: one mid-tone hex per status,
 * handed to CSS as `--track`. Every tint a status needs — pill fill, border,
 * dot, node, card glow — is then derived from that single value with
 * `color-mix()`, so a status can never be half-recoloured.
 *
 * Shared by the teacher, Dean and superadmin screens. `utils/constants.getStatusMeta`
 * keeps the same labels for anything still reading that module.
 */

export const STATUS_TRACK = {
  draft: "#64748B",        // slate
  pending: "#F59E0B",      // amber
  submitted: "#F59E0B",
  under_review: "#0EA5E9", // sky
  approved: "#10B981",     // emerald
  in_progress: "#3B82F6",  // blue — the post-approval delivery stages the
  completed: "#14B8A6",    // teal   Dean advances an event through
  published: "#8B5CF6",    // violet
  rejected: "#EF4444",     // red
  revoked: "#E11D48",      // rose — a refusal like rejected, but its own
};

export const STATUS_LABEL = {
  draft: "Draft",
  pending: "Pending",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  published: "Published",
  rejected: "Rejected",
  revoked: "Revoked",
};

const normalize = (status) => String(status ?? "").trim().toLowerCase();

export const trackOf = (status) => STATUS_TRACK[normalize(status)] || STATUS_TRACK.draft;

/**
 * The status, in words. An unrecognised one is reported as itself rather than
 * as "Pending": a status this module has not been taught about is not
 * necessarily awaiting review, and claiming it is misleads the Dean.
 */
export const labelOf = (status) => {
  const key = normalize(status);
  if (!key) return "Unknown";
  return (
    STATUS_LABEL[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

/** Statuses that still count as awaiting a decision from the Dean. */
export const isPendingStatus = (status) =>
  status === "pending" || status === "submitted" || status === "under_review";

/**
 * Statuses at or beyond approval — the backend's APPROVED_STAGES. An event the
 * Dean has marked in progress or completed was approved first, so it still
 * counts as approved rather than dropping out of every approved total.
 */
export const isApprovedStatus = (status) =>
  status === "approved" ||
  status === "in_progress" ||
  status === "completed" ||
  status === "published";
