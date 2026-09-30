/**
 * A limit that can be switched off entirely.
 *
 * "Off" is represented as `null` on the wire, and the checkbox reads that value
 * directly rather than mirroring it into separate state -- which is what used to
 * leave a stale validation error behind when the field was hidden and shown again.
 */
export default function OptionalLimit({
  id,
  label,
  offHint,
  enabled,
  disabled,
  onToggle,
  children,
}) {
  const panelId = `${id}-panel`;

  return (
    <div className="space-y-3 rounded-xl border hairline bg-raised/40 p-4">
      <label className="flex cursor-pointer select-none items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="rounded border-line text-accent focus:ring-accent"
          aria-expanded={enabled}
          aria-controls={panelId}
        />
        <span className="text-sm font-semibold text-ink">{label}</span>
      </label>

      <div id={panelId}>
        {enabled ? children : <p className="text-xs text-muted">{offHint}</p>}
      </div>
    </div>
  );
}
