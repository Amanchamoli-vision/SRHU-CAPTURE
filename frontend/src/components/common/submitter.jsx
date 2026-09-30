/**
 * Who an event came from, for the Dean's and Super Admin's views.
 *
 * A teacher *submits* an event for approval; an Event Manager *records* one,
 * with no review. The API states which (`submitted_by_role`); an older answer
 * without it falls back to the status, since only an Event Manager's event is
 * ever "recorded".
 */
export function submitterOf(event) {
  const isManager =
    event?.submitted_by_role === "event_manager" ||
    (!event?.submitted_by_role && event?.status === "recorded");
  return {
    isManager,
    verb: isManager ? "Recorded by" : "Submitted by",
    name: event?.teacher_name || event?.teacher_email || "Unknown",
    role: isManager ? "Event Manager" : "Teacher",
  };
}

/** The role as a small tag: blue for a teacher, green for an Event Manager. */
function RoleTag({ isManager, role }) {
  return (
    <span
      className={`chip chip-sm shrink-0 !py-0.5 text-[10px] ${
        isManager ? "border-ok/30 bg-ok/10 text-ok" : "border-accent/30 bg-accent/10 text-accent"
      }`}
    >
      {role}
    </span>
  );
}

/** A table cell's content: the name, and under it the role. */
export function SubmitterCell({ event }) {
  const { verb, name, role, isManager } = submitterOf(event);
  return (
    <div className="min-w-0" title={`${verb} ${name} (${role})`}>
      <p className="truncate text-sm font-medium text-ink">{name}</p>
      <div className="mt-1">
        <RoleTag isManager={isManager} role={role} />
      </div>
    </div>
  );
}

/** "Submitted by Asha Teacher · Teacher" on one line, the role as a small chip. */
export function SubmitterLine({ event, className = "" }) {
  const { verb, name, role, isManager } = submitterOf(event);
  return (
    <p className={`flex min-w-0 items-center gap-1.5 text-xs text-muted ${className}`}>
      <span className="min-w-0 truncate" title={`${verb} ${name}`}>
        {verb} <span className="font-medium text-ink">{name}</span>
      </span>
      <RoleTag isManager={isManager} role={role} />
    </p>
  );
}
