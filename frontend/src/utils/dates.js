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
