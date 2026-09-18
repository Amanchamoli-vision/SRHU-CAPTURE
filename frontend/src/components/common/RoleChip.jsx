import { labelOfRole, trackOfRole } from "./roles";

/**
 * Role pill for the superadmin screens. Colour arrives as a single `--track` hex
 * and the stylesheet mixes the fill, border and dot from it.
 */
export default function RoleChip({ role, size = "sm", className = "" }) {
  return (
    <span
      style={{ "--track": trackOfRole(role) }}
      className={`chip chip-track ${size === "sm" ? "chip-sm" : ""} ${className}`}
    >
      <span className="dot dot-sm" />
      {labelOfRole(role)}
    </span>
  );
}
