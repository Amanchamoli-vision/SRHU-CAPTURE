/** Colours and labels for per-teacher outcomes in the Dean panel reports. */

export const TRACK_OK = "#10B981";
export const TRACK_ERR = "#EF4444";
export const TRACK_WARN = "#F59E0B";
export const TRACK_MUTED = "#64748B";

/** One outcome as a coloured chip. */
export const OUTCOME = {
  sent: { label: "Sent", track: TRACK_OK },
  created: { label: "Created", track: TRACK_OK },
  failed: { label: "Failed", track: TRACK_ERR },
  skipped: { label: "Skipped", track: TRACK_WARN },
  not_sent: { label: "Not sent", track: TRACK_MUTED },
  deleted: { label: "Deleted", track: TRACK_ERR },
  removed: { label: "Removed", track: TRACK_WARN },
};
