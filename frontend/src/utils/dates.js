/**
 * Date helpers that work in the user's local calendar.
 *
 * `toISOString()` is UTC, so in India (UTC+5:30) it reports yesterday's date
 * between 00:00 and 05:29. Event dates are plain local calendar dates, so
 * compare them against a key built from the local year/month/day instead.
 */

/** "YYYY-MM-DD" for the given date in local time (defaults to now). */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local "YYYY-MM-DD" for `days` days from today (negative for the past). */
export function localDateKeyOffset(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/** Local "HH:MM" (24h, zero-padded) for the given time, defaults to now. */
export function nowHHmm(date = new Date()) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * True when "YYYY-MM-DD" falls before today in the user's local calendar.
 *
 * Both sides are zero-padded local date keys, so a plain string compare is
 * correct and avoids re-introducing the UTC drift described at the top.
 */
export function isPastDate(iso, today = localDateKey()) {
  if (!iso) return false;
  return iso < today;
}

/**
 * Compare two "HH:MM" strings. Negative when a is earlier, 0 when equal,
 * positive when a is later. Zero-padded 24h values sort lexicographically,
 * so no Date object is involved.
 */
export function compareHHmm(a, b) {
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * "14:00" -> "2:00 PM". The stored value stays canonical 24h "HH:MM"; this is
 * display only, so a teacher whose browser renders the native time input in
 * 24h still sees which half of the day the event falls in.
 */
export function formatTime12h(hhmm) {
  if (!hhmm) return "";
  const [rawH, rawM] = String(hhmm).split(":");
  const h = Number(rawH);
  const m = Number(rawM);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2026-10-15" -> "15 Oct 2026" in the local calendar. */
export function formatEventDay(iso) {
  if (!iso) return "";
  // Parsed as local midnight, not UTC, so the day never shifts backwards.
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One day as "15 Oct 2026", several as "15 – 17 Oct 2026".
 *
 * The month and year are printed once when both ends share them, which is the
 * common case for a two- or three-day event. `end` may be null or equal to
 * `start`, both of which mean a single-day event.
 */
export function formatDateRange(start, end) {
  const first = formatEventDay(start);
  if (!end || end === start) return first;

  const last = formatEventDay(end);
  if (!first) return last;
  if (!last) return first;

  const [firstDay, ...firstRest] = first.split(" ");
  const [lastDay, ...lastRest] = last.split(" ");
  if (firstRest.length && firstRest.join(" ") === lastRest.join(" ")) {
    return `${firstDay} – ${lastDay} ${lastRest.join(" ")}`;
  }

  return `${first} – ${last}`;
}
