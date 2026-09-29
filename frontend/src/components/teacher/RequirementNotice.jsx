import { IconAlertTriangle, IconCheckCircle, IconInfo } from "./icons";

/**
 * The bar above an upload step saying whether it is mandatory, and whether that
 * is satisfied yet.
 *
 * Which kinds are mandatory is a Super Admin setting, so every upload step can
 * be in either state: a required kind shows "Mandatory Upload" (red once a
 * move past it has been refused) until a file lands, an optional one a quiet
 * "optional" line.
 */
export default function RequirementNotice({
  required,
  count,
  noun,
  plural,
  example,
  blocksNextStep = false,
  failed = false,
  detail = null,
}) {
  const counted = `${count} ${count === 1 ? noun : plural}`;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  if (!required) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border hairline bg-raised/40 px-3.5 py-2 text-xs text-muted">
        <span>
          {Noun} upload is <strong className="font-semibold text-ink">optional</strong>. You
          may submit your event with or without {plural}.
        </span>
        {count > 0 && <span className="shrink-0 font-medium text-ink">{counted} attached</span>}
      </div>
    );
  }

  if (count > 0) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-ok/20 bg-ok/10 px-3.5 py-2 text-xs text-ok">
        <span className="flex items-center gap-2 font-medium">
          <IconCheckCircle className="h-4 w-4" />
          {Noun} requirement met ({counted} uploaded)
        </span>
        {detail && <span className="text-[11px] text-muted">{detail}</span>}
      </div>
    );
  }

  return (
    <div
      className={`mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${
        failed ? "border-err/30 bg-err/10 text-err" : "border-accent/15 bg-accent/6 text-ink"
      }`}
    >
      {failed ? (
        <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-err" />
      ) : (
        <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      )}
      <div>
        <span className="font-semibold text-err">
          {failed
            ? `${Noun} upload is required ${blocksNextStep ? "to continue" : "before submission"}:`
            : "Mandatory Upload:"}
        </span>{" "}
        <span>
          At least one {noun} ({example}) must be uploaded before you can{" "}
          {blocksNextStep ? "move on to the next step or submit" : "submit"} this event for
          approval.
        </span>
      </div>
    </div>
  );
}
