import { useEffect, useState } from "react";

const HOURS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Parse a canonical "HH:MM" (24h) string into 12-hour components.
 * Returns null if invalid or empty.
 */
function parse24hTo12h(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const parts = hhmm.trim().split(":");
  if (parts.length !== 2) return null;

  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }

  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    hour: String(h12).padStart(2, "0"),
    minute: String(m).padStart(2, "0"),
    period,
  };
}

/**
 * Convert 12-hour components into canonical "HH:MM" (24h) string.
 */
function to24h(hourStr, minuteStr, period) {
  if (!hourStr) return "";
  const h = parseInt(hourStr, 10);
  if (!Number.isFinite(h) || h < 1 || h > 12) return "";

  const m = minuteStr ? parseInt(minuteStr, 10) : 0;
  const safeM = Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0;

  let h24 = h % 12;
  if (period === "PM") {
    h24 += 12;
  }

  return `${String(h24).padStart(2, "0")}:${String(safeM).padStart(2, "0")}`;
}

/**
 * TimePicker12h:
 * 12-hour time picker with Hour, Minute, and AM/PM dropdowns.
 * Completely replaces native 24-hour time inputs while seamlessly reading
 * and writing canonical "HH:MM" (24h) format for the backend and database.
 */
export default function TimePicker12h({
  id,
  value,
  onChange,
  disabled = false,
  hasError = false,
  ariaLabel,
}) {
  const parsed = parse24hTo12h(value);

  // Keep track of AM/PM preference even if hour is not yet chosen
  const [selectedPeriod, setSelectedPeriod] = useState(parsed?.period || "AM");

  // Keep selectedPeriod in sync when value changes externally
  useEffect(() => {
    if (parsed?.period) {
      setSelectedPeriod(parsed.period);
    }
  }, [parsed?.period]);

  const currentHour = parsed?.hour || "";
  const currentMinute = parsed?.minute || "";
  const currentPeriod = parsed?.period || selectedPeriod;

  const handleHourChange = (e) => {
    const newHour = e.target.value;
    if (!newHour) {
      onChange("");
      return;
    }

    // Default minute to "00" if none selected yet for 1-click hour picking
    const nextMinute = currentMinute || "00";
    onChange(to24h(newHour, nextMinute, currentPeriod));
  };

  const handleMinuteChange = (e) => {
    const newMinute = e.target.value;
    if (!currentHour) {
      return;
    }
    onChange(to24h(currentHour, newMinute, currentPeriod));
  };

  const handlePeriodChange = (e) => {
    const newPeriod = e.target.value;
    setSelectedPeriod(newPeriod);
    if (currentHour) {
      onChange(to24h(currentHour, currentMinute || "00", newPeriod));
    }
  };

  const selectClass = `input min-h-10 py-2 pr-6 pl-2.5 text-center text-sm font-medium ${
    hasError ? "border-red-500 ring-red-500/20" : ""
  }`;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div className="relative flex-1">
        <select
          id={id ? `${id}-hour` : undefined}
          name={id ? `${id}_hour` : undefined}
          value={currentHour}
          onChange={handleHourChange}
          disabled={disabled}
          aria-invalid={hasError ? "true" : undefined}
          aria-label={`${ariaLabel || id || "Time"} Hour`}
          className={selectClass}
        >
          <option value="">Hour</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      <span className="text-muted font-bold text-base select-none">:</span>

      <div className="relative flex-1">
        <select
          id={id ? `${id}-minute` : undefined}
          name={id ? `${id}_minute` : undefined}
          value={currentMinute}
          onChange={handleMinuteChange}
          disabled={disabled || !currentHour}
          aria-invalid={hasError ? "true" : undefined}
          aria-label={`${ariaLabel || id || "Time"} Minute`}
          className={selectClass}
        >
          <option value="">Min</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="relative w-22 sm:w-24">
        <select
          id={id ? `${id}-period` : undefined}
          name={id ? `${id}_period` : undefined}
          value={currentPeriod}
          onChange={handlePeriodChange}
          disabled={disabled}
          aria-invalid={hasError ? "true" : undefined}
          aria-label={`${ariaLabel || id || "Time"} AM or PM`}
          className={`input min-h-10 py-2 pr-6 pl-2.5 text-center text-sm font-semibold w-full ${
            hasError ? "border-red-500 ring-red-500/20" : ""
          }`}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}
