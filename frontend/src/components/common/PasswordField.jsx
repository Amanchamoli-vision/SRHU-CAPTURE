import { useState } from "react";
import EyeIcon from "./EyeIcon";

/**
 * A labelled password input with a show/hide toggle.
 *
 * Extracted rather than inlined six times: the Teacher and Dean profiles
 * render the same three fields (current, new, confirm), so the toggle, its
 * padding and its ARIA wiring live in one place.
 *
 * The label is folded into the toggle's accessible name — three buttons all
 * reading "Show password" tell a screen-reader user nothing about which field
 * they act on.
 *
 * Visibility is deliberately local state with no way to preset it: a password
 * field starts masked every time the form mounts, so closing and reopening
 * "Change password" can never reveal what was typed before.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  disabled = false,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          className="input pr-11"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />

        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
          aria-label={`${visible ? "Hide" : "Show"} ${String(label).toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex items-center pr-3.5 pl-2 text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    </div>
  );
}
