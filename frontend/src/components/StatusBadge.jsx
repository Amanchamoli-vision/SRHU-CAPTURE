import { getStatusMeta } from "../utils/constants";

/**
 * Single source of truth for how an event's approval status is displayed
 * across the Dean views.
 */
export default function StatusBadge({ status, className = "" }) {
  const { label, badgeClass, dotClass } = getStatusMeta(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
