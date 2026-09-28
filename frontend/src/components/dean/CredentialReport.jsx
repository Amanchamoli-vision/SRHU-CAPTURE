import { ROLE_TRACK } from "../common/roles";
import { IconAlertTriangle } from "../teacher/icons";
import { OUTCOME, TRACK_ERR, TRACK_OK, TRACK_WARN } from "./outcomes";

export function OutcomeChip({ outcome }) {
  const style = OUTCOME[outcome] || OUTCOME.failed;
  return (
    <span className="chip chip-sm chip-track" style={{ "--track": style.track }}>
      <span className="dot dot-sm" />
      {style.label}
    </span>
  );
}

export function Tally({ label, value, track }) {
  return (
    <div className="rounded-2xl border hairline bg-raised/40 p-3" style={{ "--track": track }}>
      <p className="text-xs text-muted">{label}</p>
      <p className="stat-num mt-0.5 text-2xl" style={{ color: track }}>{value}</p>
    </div>
  );
}

export function ProgressLine({ done, total, label = "Processed" }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="progress-track">
        <span className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="prose-muted mt-2 text-xs">
        {label} {done} of {total}. Keep this page open until it finishes.
      </p>
    </div>
  );
}

const TH = "px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted";

/**
 * Who was sent login credentials, who was skipped and who failed, and why.
 * `run` is `{ done, total, results, running, error }`.
 */
export default function CredentialReport({ run }) {
  const tally = { sent: 0, failed: 0, skipped: 0 };
  run.results.forEach((r) => { tally[r.status] = (tally[r.status] || 0) + 1; });
  const order = { failed: 0, skipped: 1, sent: 2 };
  const rows = [...run.results].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="space-y-5">
      {run.running && <ProgressLine done={run.done} total={run.total} />}

      {run.error && (
        <div className="toast toast-err text-sm" role="alert">
          <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
          <span>Stopped early: {run.error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tally label="Selected" value={run.total} track={ROLE_TRACK.teacher} />
        <Tally label="Sent" value={tally.sent} track={TRACK_OK} />
        <Tally label="Failed" value={tally.failed} track={TRACK_ERR} />
        <Tally label="Skipped" value={tally.skipped} track={TRACK_WARN} />
      </div>

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border hairline">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b hairline bg-raised/40">
                <th scope="col" className={TH}>Teacher</th>
                <th scope="col" className={TH}>Result</th>
                <th scope="col" className={TH}>Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/8">
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{r.name || "Unknown account"}</p>
                    {r.email && <p className="text-xs text-muted">{r.email}</p>}
                  </td>
                  <td className="px-4 py-2.5"><OutcomeChip outcome={r.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted">{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
