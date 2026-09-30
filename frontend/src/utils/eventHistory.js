/**
 * An event's audit trail, ready to render.
 *
 * The backend appends one `history` entry per status transition (see
 * `new_history_entry` in backend/app/models/documents.py): who acted, in which
 * role, what the status became, and any note — a Dean's rejection reason or
 * requested changes. Those notes are the point: the event's own
 * `rejection_reason` is cleared the moment it is resubmitted or approved, so the
 * trail is the only place a teacher can still read what the Dean said.
 *
 * Events submitted before the trail existed have no `history`. For those a
 * best-effort trail is rebuilt from the timestamps the event does carry, and
 * every such entry is flagged `inferred` so the UI can say so rather than pass
 * a reconstruction off as a record.
 */

const STAGE_LABEL = {
  in_progress: "Marked in progress",
  completed: "Marked completed",
  approved: "Moved back to approved",
};

const ACTION_META = {
  created: { label: "Event created", tone: "draft" },
  recorded: { label: "Recorded", tone: "approved" },
  submitted: { label: "Submitted for review", tone: "pending" },
  updated: { label: "Details updated", tone: "pending" },
  resubmitted: { label: "Resubmitted for review", tone: "pending" },
  approved: { label: "Approved", tone: "approved" },
  rejected: { label: "Rejected", tone: "rejected" },
  // Withdrawing an approval is its own action, so it reads as its own line
  // rather than the generic "Status updated" fallback (PRD 18).
  revoked: { label: "Approval revoked", tone: "rejected" },
  changes_requested: { label: "Changes requested", tone: "rejected" },
  archived: { label: "Archived", tone: "draft" },
  restored: { label: "Restored from archive", tone: "pending" },
};

/** What an entry reads as, and which status hue it takes. */
export function describeEntry(entry) {
  if (entry.action === "stage_changed") {
    return {
      label: STAGE_LABEL[entry.status] || "Stage updated",
      tone: entry.status,
    };
  }

  // An approval that came out of a refusal is a re-approval. from_status is
  // the only thing that tells the two apart -- the backend records both as
  // the "approved" action, since re-approving is the same transition.
  if (
    entry.action === "approved" &&
    (entry.from_status === "rejected" || entry.from_status === "revoked")
  ) {
    return {
      label: entry.from_status === "revoked" ? "Approval restored" : "Re-approved",
      tone: "approved",
    };
  }

  return ACTION_META[entry.action] || { label: "Status updated", tone: entry.status };
}

/** Whether an entry carries words from the Dean the teacher should read. */
export const isDeanFeedback = (entry) =>
  entry.actor_role === "dean" && Boolean(entry.note);

const APPROVED_OR_BEYOND = ["approved", "published", "in_progress", "completed"];

/**
 * A trail rebuilt from what a pre-history event still records. It can only
 * show the latest decision — an earlier rejection that was later approved
 * left no trace to rebuild from.
 */
function inferHistory(event) {
  const status = String(event?.status ?? "").toLowerCase();
  const entries = [];

  if (status === "draft") {
    entries.push({
      action: "created",
      status: "draft",
      created_at: event.created_at,
      actor_id: event.teacher_id,
      actor_role: "teacher",
    });
    return entries;
  }

  if (status === "recorded") {
    entries.push({
      action: "recorded",
      status: "recorded",
      created_at: event.recorded_at || event.created_at,
      actor_id: event.owner_id || event.teacher_id,
      actor_name: event.owner_name || event.teacher_name,
      actor_role: "event_manager",
    });
    return entries.map((entry) => ({ ...entry, inferred: true }));
  }

  entries.push({
    action: "submitted",
    status: "pending",
    created_at: event.submitted_at || event.created_at,
    // The owner is known even without a trail, so the teacher still sees
    // "by you" on their own submission.
    actor_id: event.teacher_id,
    actor_role: "teacher",
  });

  if (status === "rejected") {
    entries.push({
      action: "rejected",
      status: "rejected",
      created_at: event.reviewed_at || event.updated_at,
      actor_role: "dean",
      note: event.rejection_reason || null,
    });
  } else if (status === "revoked") {
    // It must have been approved first, or it could not have been revoked.
    entries.push({
      action: "approved",
      status: "approved",
      created_at: event.reviewed_at || event.updated_at,
      actor_role: "dean",
    });
    entries.push({
      action: "revoked",
      status: "revoked",
      created_at: event.revoked_at || event.updated_at,
      actor_role: "dean",
      note: event.revocation_reason || null,
    });
  } else if (APPROVED_OR_BEYOND.includes(status)) {
    entries.push({
      action: "approved",
      status: "approved",
      created_at: event.reviewed_at || event.updated_at,
      actor_role: "dean",
    });

    // "in_progress" was retired and now reads as Approved: nothing to add.
    if (status === "completed") {
      entries.push({
        action: "stage_changed",
        status,
        created_at: event.updated_at,
        actor_role: "dean",
      });
    }
  }

  return entries.map((entry) => ({ ...entry, inferred: true }));
}

/**
 * The trail, oldest first, each entry with a stable key. Falls back to the
 * inferred trail when the event predates recorded history.
 */
export function buildTimeline(event) {
  const recorded = Array.isArray(event?.history) ? event.history : [];
  const source = recorded.length > 0 ? recorded : inferHistory(event);

  return source
    .map((entry, index) => ({ ...entry, key: `${entry.action}-${index}` }))
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
}

/** The most recent thing the Dean said, if anything. */
export function latestDeanFeedback(timeline) {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    if (isDeanFeedback(timeline[i])) return timeline[i];
  }
  return null;
}
