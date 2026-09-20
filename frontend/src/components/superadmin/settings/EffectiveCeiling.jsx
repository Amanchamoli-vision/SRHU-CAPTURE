import { IconAlertTriangle, IconCheckCircle } from "../../teacher/icons";
import { effectiveCeiling } from "../../../utils/limitsForm";

const mb = (value) => (value == null ? "no limit" : `${value} MB`);

/**
 * What the current values add up to for one event.
 *
 * This is the number an admin is really setting, and it was not visible
 * anywhere before: the form showed six inputs and left the consequence to be
 * worked out on paper. It recomputes as they type, before anything is saved.
 */
export default function EffectiveCeiling({ values, deploymentCeilingMb }) {
  const totals = effectiveCeiling(values);
  const over =
    deploymentCeilingMb != null &&
    totals.largestSingleMb != null &&
    totals.largestSingleMb > deploymentCeilingMb;

  const rows = [
    { label: "Photos", value: totals.photosMb },
    { label: "Videos", value: totals.videosMb },
    { label: "Documents", value: totals.documentsMb },
  ];

  return (
    <section className="glass reveal p-5 sm:p-7" style={{ "--i": 3 }}>
      <p className="eyebrow">What this allows</p>
      <h2 className="h3 mt-1 text-ink">Effective ceiling per event</h2>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border bg-raised/40 p-4">
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="font-mono text-lg text-ink">{mb(row.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-4">
        <span className="text-sm text-muted">
          Worst case for a single event:{" "}
          <span className="font-mono font-semibold text-ink">{mb(totals.worstCaseMb)}</span>
        </span>

        {deploymentCeilingMb != null ? (
          <span
            className={`flex items-center gap-2 text-sm ${over ? "text-err" : "text-muted"}`}
            role={over ? "alert" : undefined}
          >
            {over ? (
              <IconAlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <IconCheckCircle className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
            )}
            {over ? (
              <>
                Largest single file ({mb(totals.largestSingleMb)}) is above this server&apos;s
                limit of {mb(deploymentCeilingMb)} — uploads that big are refused.
              </>
            ) : (
              <>
                Largest single file {mb(totals.largestSingleMb)}, within this server&apos;s limit
                of {mb(deploymentCeilingMb)}.
              </>
            )}
          </span>
        ) : null}
      </div>
    </section>
  );
}
