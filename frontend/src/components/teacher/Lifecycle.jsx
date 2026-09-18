import { IconCheck, IconX } from "./icons";
import { STATUS_TRACK } from "./status";

// Only the states the backend actually puts an event in. Submitting sets the
// status straight to "pending", so a separate "Submitted" node could never be
// the current one and has gone. "In progress" and "Completed" stay: the Dean
// moves an approved event through them from the event page, and the teacher is
// emailed and notified at each move. A rejected event can reach neither until
// it is resubmitted, so for one the rail ends at "Rejected".
const STEPS = (isRejected) =>
  isRejected
    ? [
        { id: "draft", label: "Created" },
        { id: "pending", label: "Pending review" },
        { id: "rejected", label: "Rejected" },
      ]
    : [
        { id: "draft", label: "Created" },
        { id: "pending", label: "Pending review" },
        { id: "approved", label: "Approved" },
        { id: "in_progress", label: "In progress" },
        { id: "completed", label: "Completed" },
      ];

/** How far along the rail a given status sits. */
function indexFor(status) {
  if (status === "draft") return 0;
  if (status === "approved" || status === "published" || status === "rejected") return 2;
  if (status === "in_progress") return 3;
  if (status === "completed") return 4;
  return 1; // pending, or the legacy submitted / under_review: waiting on the Dean
}

/**
 * The approval rail. Each node is tinted from the `--track` hex of the state
 * it represents, so the tracker and the status pills always agree.
 */
export default function Lifecycle({ status = "pending" }) {
  status = String(status || "pending").toLowerCase();
  const isRejected = status === "rejected";
  const steps = STEPS(isRejected);
  const current = indexFor(status);

  return (
    <ol className="relative flex list-none items-start justify-between gap-1 p-0">
      {/* The spine sits behind the nodes and stops level with their centres. */}
      <span
        aria-hidden="true"
        className="absolute left-0 right-0 top-[1.125rem] h-0.5 bg-line/12"
      />

      {steps.map((step, idx) => {
        const isPast = idx < current;
        const isCurrent = idx === current;
        const track = STATUS_TRACK[step.id] || STATUS_TRACK.pending;

        const done = isPast || (isCurrent && (step.id === "approved" || step.id === "completed"));
        const failed = isCurrent && step.id === "rejected";

        let nodeStyle = { borderColor: "rgb(var(--c-line) / .15)" };
        if (isPast) {
          nodeStyle = {
            background: `color-mix(in srgb, ${STATUS_TRACK.approved} 18%, transparent)`,
            borderColor: STATUS_TRACK.approved,
            color: STATUS_TRACK.approved,
          };
        } else if (isCurrent) {
          nodeStyle = {
            background: `color-mix(in srgb, ${track} 18%, transparent)`,
            borderColor: track,
            color: track,
            boxShadow: `0 0 0 4px color-mix(in srgb, ${track} 18%, transparent)`,
          };
        }

        return (
          <li key={step.id} className="relative z-10 flex flex-1 flex-col items-center gap-2">
            <span
              style={nodeStyle}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 bg-surface font-display text-xs font-bold text-muted"
            >
              {failed ? (
                <IconX className="h-4 w-4" />
              ) : done ? (
                <IconCheck className="h-4 w-4" />
              ) : (
                idx + 1
              )}
            </span>

            <span
              style={isCurrent ? { color: track } : undefined}
              className={`text-center text-[11px] font-semibold leading-tight ${
                isCurrent ? "" : isPast ? "text-ink" : "text-muted"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
