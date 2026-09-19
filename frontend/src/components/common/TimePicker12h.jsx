import { useEffect, useRef, useState } from "react";

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
  if (!hourStr && !minuteStr) return "";
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
 * Compact, typeable 12-hour time picker with Hour, Minute, and AM/PM controls.
 * Replaces the bulky 60-item dropdown with a clean, typeable input supporting:
 * - Direct manual typing of Hour (1-12) and Minute (00-59)
 * - Step-based minute increments (5-minute steps via spinner / arrow keys)
 * - Simple 2-option AM/PM dropdown (AM / PM only)
 * - Compact visual footprint (max-w-[240px]) matching the form's input aesthetics
 * - Seamlessly reads and writes canonical "HH:MM" (24h) format.
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

  const [hour, setHour] = useState(parsed?.hour || "");
  const [minute, setMinute] = useState(parsed?.minute || "");
  const [period, setPeriod] = useState(parsed?.period || "AM");

  // Synchronous ref to prevent stale closures during rapid typing
  const stateRef = useRef({
    hour: parsed?.hour || "",
    minute: parsed?.minute || "",
    period: parsed?.period || "AM",
  });

  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  // Sync internal state when value prop changes externally (draft load, reset, etc.)
  useEffect(() => {
    const next = parse24hTo12h(value);
    if (next) {
      setHour(next.hour);
      setMinute(next.minute);
      setPeriod(next.period);
      stateRef.current = { hour: next.hour, minute: next.minute, period: next.period };
    } else if (!value) {
      setHour("");
      setMinute("");
      stateRef.current.hour = "";
      stateRef.current.minute = "";
    }
  }, [value]);

  const commitTime = (hVal, mVal, pVal) => {
    stateRef.current = { hour: hVal, minute: mVal, period: pVal };
    if (!hVal && !mVal) {
      onChange("");
      return;
    }
    const val24 = to24h(hVal, mVal || "00", pVal);
    onChange(val24);
  };

  const handleHourChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const curMin = stateRef.current.minute;
    const curPeriod = stateRef.current.period;

    if (!raw) {
      setHour("");
      stateRef.current.hour = "";
      commitTime("", curMin, curPeriod);
      return;
    }

    const num = parseInt(raw, 10);
    if (num > 12) {
      const last = parseInt(raw.slice(-1), 10);
      if (last >= 1 && last <= 9) {
        const hStr = String(last).padStart(2, "0");
        setHour(hStr);
        stateRef.current.hour = hStr;
        commitTime(hStr, curMin, curPeriod);
        minuteRef.current?.focus();
        minuteRef.current?.select();
      }
      return;
    }

    if (raw.length === 1) {
      if (num > 1) {
        // Digits 2-9 are definitively single-digit hours: auto pad and advance to minute
        const hStr = String(num).padStart(2, "0");
        setHour(hStr);
        stateRef.current.hour = hStr;
        commitTime(hStr, curMin, curPeriod);
        minuteRef.current?.focus();
        minuteRef.current?.select();
      } else {
        // num === 1 (could be 10, 11, 12): keep as "1"
        setHour(raw);
        stateRef.current.hour = raw;
        commitTime(raw, curMin, curPeriod);
      }
    } else if (raw.length === 2) {
      if (num >= 1 && num <= 12) {
        const hStr = String(num).padStart(2, "0");
        setHour(hStr);
        stateRef.current.hour = hStr;
        commitTime(hStr, curMin, curPeriod);
        minuteRef.current?.focus();
        minuteRef.current?.select();
      }
    }
  };

  const handleHourBlur = () => {
    const curHour = stateRef.current.hour;
    const curMin = stateRef.current.minute;
    const curPeriod = stateRef.current.period;
    if (!curHour) return;

    const num = parseInt(curHour, 10);
    if (num >= 1 && num <= 12) {
      const hStr = String(num).padStart(2, "0");
      setHour(hStr);
      stateRef.current.hour = hStr;
      const mStr = curMin ? String(parseInt(curMin, 10)).padStart(2, "0") : "00";
      setMinute(mStr);
      stateRef.current.minute = mStr;
      commitTime(hStr, mStr, curPeriod);
    } else {
      setHour("");
      stateRef.current.hour = "";
      commitTime("", curMin, curPeriod);
    }
  };

  const handleHourKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      stepHour(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      stepHour(-1);
    } else if (e.key === ":" || e.key === "/" || (e.key === "ArrowRight" && stateRef.current.hour.length >= 1)) {
      e.preventDefault();
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  };

  const stepHour = (delta) => {
    const current = parseInt(stateRef.current.hour, 10) || 12;
    let next = current + delta;
    if (next > 12) next = 1;
    if (next < 1) next = 12;
    const hStr = String(next).padStart(2, "0");
    setHour(hStr);
    stateRef.current.hour = hStr;
    const mStr = stateRef.current.minute || "00";
    setMinute(mStr);
    stateRef.current.minute = mStr;
    commitTime(hStr, mStr, stateRef.current.period);
  };

  const handleMinuteChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const curHour = stateRef.current.hour;
    const curPeriod = stateRef.current.period;

    if (!raw) {
      setMinute("");
      stateRef.current.minute = "";
      commitTime(curHour, "", curPeriod);
      return;
    }

    const num = parseInt(raw, 10);
    if (num > 59) {
      setMinute("59");
      stateRef.current.minute = "59";
      commitTime(curHour, "59", curPeriod);
      return;
    }

    if (raw.length <= 2) {
      setMinute(raw);
      stateRef.current.minute = raw;
      if (raw.length === 2) {
        commitTime(curHour, raw, curPeriod);
      }
    }
  };

  const handleMinuteBlur = () => {
    const curHour = stateRef.current.hour;
    const curMin = stateRef.current.minute;
    const curPeriod = stateRef.current.period;

    if (!curMin) {
      if (curHour) {
        setMinute("00");
        stateRef.current.minute = "00";
        commitTime(curHour, "00", curPeriod);
      }
      return;
    }
    const num = parseInt(curMin, 10);
    if (num >= 0 && num <= 59) {
      const mStr = String(num).padStart(2, "0");
      setMinute(mStr);
      stateRef.current.minute = mStr;
      commitTime(curHour, mStr, curPeriod);
    } else {
      setMinute("00");
      stateRef.current.minute = "00";
      commitTime(curHour, "00", curPeriod);
    }
  };

  const handleMinuteKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 5;
      stepMinute(step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const step = e.shiftKey ? -1 : -5;
      stepMinute(step);
    } else if (e.key === "Backspace" && !stateRef.current.minute) {
      e.preventDefault();
      hourRef.current?.focus();
    } else if (e.key === "ArrowLeft" && e.target.selectionStart === 0) {
      e.preventDefault();
      hourRef.current?.focus();
    } else if (e.key.toLowerCase() === "a") {
      e.preventDefault();
      handlePeriodChange("AM");
    } else if (e.key.toLowerCase() === "p") {
      e.preventDefault();
      handlePeriodChange("PM");
    }
  };

  const stepMinute = (delta) => {
    const current = parseInt(stateRef.current.minute, 10) || 0;
    let next;
    if (Math.abs(delta) === 5) {
      if (delta > 0) {
        next = Math.floor(current / 5) * 5 + 5;
      } else {
        next = Math.ceil(current / 5) * 5 - 5;
      }
    } else {
      next = current + delta;
    }
    if (next >= 60) next = 0;
    if (next < 0) next = 55;
    const mStr = String(next).padStart(2, "0");
    setMinute(mStr);
    stateRef.current.minute = mStr;
    const hStr = stateRef.current.hour || "12";
    if (!stateRef.current.hour) {
      setHour(hStr);
      stateRef.current.hour = hStr;
    }
    commitTime(hStr, mStr, stateRef.current.period);
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    stateRef.current.period = newPeriod;
    if (stateRef.current.hour) {
      commitTime(stateRef.current.hour, stateRef.current.minute || "00", newPeriod);
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData?.getData("text") || "";
    const clean = text.trim();
    const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
    if (match) {
      e.preventDefault();
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      let p = match[3] ? match[3].toUpperCase() : stateRef.current.period;

      if (h > 12) {
        p = h >= 12 ? "PM" : "AM";
        h = h % 12 === 0 ? 12 : h % 12;
      }

      if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
        const hStr = String(h).padStart(2, "0");
        const mStr = String(m).padStart(2, "0");
        setHour(hStr);
        setMinute(mStr);
        setPeriod(p);
        commitTime(hStr, mStr, p);
      }
    }
  };

  return (
    <div
      onPaste={handlePaste}
      className={`time-picker-box flex items-center justify-between gap-1.5 h-10 px-3 rounded-xl border bg-[var(--input-bg)] transition-all ${
        hasError
          ? "border-red-500 ring-2 ring-red-500/20"
          : "border-[rgb(var(--c-line)/0.14)] focus-within:border-[rgb(var(--c-accent)/0.7)] focus-within:ring-2 focus-within:ring-[rgb(var(--c-accent)/0.18)]"
      } ${disabled ? "opacity-60 cursor-not-allowed bg-[rgb(var(--c-raised)/0.6)]" : ""} w-full max-w-[240px]`}
    >
      {/* Clock icon */}
      <svg
        className="w-4 h-4 text-muted shrink-0 select-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>

      {/* Time digits container */}
      <div className="flex items-center gap-1 min-w-0">
        {/* Hour input */}
        <input
          ref={hourRef}
          id={id ? `${id}-hour` : undefined}
          name={id ? `${id}_hour` : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          placeholder="HH"
          value={hour}
          onChange={handleHourChange}
          onBlur={handleHourBlur}
          onKeyDown={handleHourKeyDown}
          disabled={disabled}
          aria-label={`${ariaLabel || id || "Time"} Hour (1-12)`}
          className="w-7 text-center font-semibold text-sm bg-transparent outline-none text-ink p-0 placeholder:text-muted/50 selection:bg-accent selection:text-white"
        />

        {/* Micro stepper for Hour */}
        <div className="flex flex-col -my-1 shrink-0 select-none">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => stepHour(1)}
            title="Increase hour"
            aria-label="Increase hour"
            className="h-3 w-3 flex items-center justify-center text-muted hover:text-ink rounded transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => stepHour(-1)}
            title="Decrease hour"
            aria-label="Decrease hour"
            className="h-3 w-3 flex items-center justify-center text-muted hover:text-ink rounded transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <span className="font-bold text-muted/80 select-none text-sm px-0.5">:</span>

        {/* Minute input */}
        <input
          ref={minuteRef}
          id={id ? `${id}-minute` : undefined}
          name={id ? `${id}_minute` : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          placeholder="MM"
          value={minute}
          onChange={handleMinuteChange}
          onBlur={handleMinuteBlur}
          onKeyDown={handleMinuteKeyDown}
          disabled={disabled}
          aria-label={`${ariaLabel || id || "Time"} Minute (00-59)`}
          className="w-7 text-center font-semibold text-sm bg-transparent outline-none text-ink p-0 placeholder:text-muted/50 selection:bg-accent selection:text-white"
        />

        {/* Micro stepper for Minute */}
        <div className="flex flex-col -my-1 shrink-0 select-none">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => stepMinute(5)}
            title="Step minute up (+5m)"
            aria-label="Increase minute by 5"
            className="h-3 w-3 flex items-center justify-center text-muted hover:text-ink rounded transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => stepMinute(-5)}
            title="Step minute down (-5m)"
            aria-label="Decrease minute by 5"
            className="h-3 w-3 flex items-center justify-center text-muted hover:text-ink rounded transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Subtle vertical divider */}
      <div className="h-4 w-px bg-[rgb(var(--c-line)/0.2)] mx-0.5 select-none" />

      {/* AM/PM dropdown (clean 2-option select) */}
      <select
        id={id ? `${id}-period` : undefined}
        name={id ? `${id}_period` : undefined}
        value={period}
        onChange={(e) => handlePeriodChange(e.target.value)}
        disabled={disabled}
        aria-label={`${ariaLabel || id || "Time"} AM or PM`}
        className="bg-transparent text-xs font-bold text-ink cursor-pointer outline-none border-none py-1 pl-1 pr-4 rounded hover:bg-[rgb(var(--c-line)/0.08)] transition-colors appearance-none"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%239AA9BF' stroke-width='2' viewBox='0 0 24 24'><path d='m6 9 6 6 6-6'/></svg>")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.1rem center',
        }}
      >
        <option value="AM" className="bg-[rgb(var(--c-surface))] text-ink font-semibold">AM</option>
        <option value="PM" className="bg-[rgb(var(--c-surface))] text-ink font-semibold">PM</option>
      </select>
    </div>
  );
}
