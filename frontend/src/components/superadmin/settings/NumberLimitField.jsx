/**
 * One numeric limit: label, input, hint and error, wired together for screen
 * readers via aria-describedby. The allowed range comes from the server's
 * bounds rather than a literal, so the sentence under the field always matches
 * what the API will actually accept.
 */
export default function NumberLimitField({
  id,
  name,
  label,
  unit,
  hint,
  bound,
  value,
  error,
  disabled,
  required = true,
  onChange,
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // Pointing at an element that is not rendered is worse than omitting this.
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? <span className="ml-1 font-normal text-muted">({unit})</span> : null}
        {required ? <span className="req">*</span> : null}
      </label>

      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        step="1"
        min={bound?.min}
        max={bound?.max}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(name, event.target.value)}
        className="input font-mono"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
      />

      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
          {bound ? ` Allowed: ${bound.min}–${bound.max}.` : null}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
