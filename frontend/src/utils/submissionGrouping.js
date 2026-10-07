/**
 * Utilities for grouping and formatting workshop/program submissions for the Dean dashboard.
 * Supports Year -> Month -> Items hierarchical segregation matching the reference UX.
 */

const MONTH_NAMES_UPPER = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Extracts normalized date components from an event without timezone shift.
 * Fallback order: event_date -> start_date -> created_at -> date.
 *
 * @param {Object} event
 * @returns {{ year: number, month: number, day: number, isoDate: string } | null}
 */
export function extractSubmissionDate(event) {
  if (!event) return null;
  const raw =
    event.event_date ||
    event.start_date ||
    event.created_at ||
    event.date ||
    "";

  if (!raw) return null;

  // Check for ISO date string YYYY-MM-DD
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10), // 1-12
      day: parseInt(match[3], 10),
      isoDate: `${match[1]}-${match[2]}-${match[3]}`,
    };
  }

  // Fallback for standard Date parsing
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return {
      year: y,
      month: m,
      day,
      isoDate: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
  }

  return null;
}

/**
 * Formats a month sub-header label, e.g. (2026, 10) -> "OCTOBER 2026".
 *
 * @param {number} year
 * @param {number} month 1-12
 * @returns {string}
 */
export function formatMonthLabel(year, month) {
  const name = MONTH_NAMES_UPPER[month - 1] || "";
  return `${name} ${year}`.trim();
}

/**
 * Formats a row date without leading zero for the day, e.g. "2026-10-04" -> "4 Oct 2026".
 * Matches the reference image style ("4 Oct 2026", "30 Sep 2026").
 *
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatRowDate(dateVal) {
  if (!dateVal) return "—";

  const match = String(dateVal).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = match[1];
    const monthIdx = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const month = MONTH_NAMES_SHORT[monthIdx] || "";
    return `${day} ${month} ${year}`;
  }

  const d = new Date(dateVal);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()] || ""} ${d.getFullYear()}`;
  }

  return String(dateVal);
}

/**
 * Pure function: Groups submissions into Year -> Month -> Items.
 *
 * Rules:
 * - Group by event_date (fallback: start_date, created_at)
 * - Dynamic years and months derived strictly from data
 * - Sort: year desc -> month desc -> item date desc
 * - Empty years and empty months are omitted
 * - Per-month and per-year count badge
 *
 * @param {Array<Object>} submissions
 * @returns {Array<{
 *   year: number,
 *   yearKey: string,
 *   yearLabel: string,
 *   count: number,
 *   months: Array<{
 *     year: number,
 *     month: number,
 *     monthKey: string,
 *     monthLabel: string,
 *     count: number,
 *     items: Array<Object>
 *   }>
 * }>}
 */
export function groupSubmissionsByDate(submissions = []) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return [];
  }

  // Intermediate nested map: year -> month -> items
  const yearMap = new Map();

  for (const item of submissions) {
    const parsed = extractSubmissionDate(item);
    // If date is completely absent or invalid, group under current year/month fallback
    const now = new Date();
    const year = parsed ? parsed.year : now.getFullYear();
    const month = parsed ? parsed.month : now.getMonth() + 1;
    const isoDate = parsed ? parsed.isoDate : "";

    if (!yearMap.has(year)) {
      yearMap.set(year, new Map());
    }

    const monthMap = yearMap.get(year);
    if (!monthMap.has(month)) {
      monthMap.set(month, []);
    }

    monthMap.get(month).push({
      ...item,
      __parsedDate: parsed,
      __isoDate: isoDate,
    });
  }

  // Sort years descending (newest first)
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

  const result = [];

  for (const year of sortedYears) {
    const monthMap = yearMap.get(year);
    // Sort months descending (newest first: 12 down to 1)
    const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);

    const monthGroups = [];
    let yearTotalCount = 0;

    for (const month of sortedMonths) {
      const items = monthMap.get(month);
      if (!items || items.length === 0) continue;

      // Sort items within month: date desc -> id desc
      items.sort((a, b) => {
        const dateA = a.__isoDate || "";
        const dateB = b.__isoDate || "";
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        return String(b.id || "").localeCompare(String(a.id || ""));
      });

      // Strip internal helper props when returning clean items or keep them
      const cleanItems = items.map(({ __parsedDate, __isoDate, ...rest }) => rest);

      yearTotalCount += cleanItems.length;

      monthGroups.push({
        year,
        month,
        monthKey: `${year}-${String(month).padStart(2, "0")}`,
        monthLabel: formatMonthLabel(year, month),
        count: cleanItems.length,
        items: cleanItems,
      });
    }

    if (monthGroups.length > 0) {
      result.push({
        year,
        yearKey: String(year),
        yearLabel: String(year),
        count: yearTotalCount,
        months: monthGroups,
      });
    }
  }

  return result;
}

/**
 * Group submissions by Status (alternative grouping option).
 *
 * @param {Array<Object>} submissions
 * @returns {Array<{
 *   statusKey: string,
 *   statusLabel: string,
 *   count: number,
 *   items: Array<Object>
 * }>}
 */
export function groupSubmissionsByStatus(submissions = []) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return [];
  }

  const STATUS_ORDER = [
    { key: "pending", label: "Pending Review" },
    { key: "under_review", label: "Under Review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "needs_correction", label: "Needs Correction" },
    { key: "other", label: "Other" },
  ];

  const groups = new Map();
  for (const def of STATUS_ORDER) {
    groups.set(def.key, []);
  }

  for (const item of submissions) {
    const rawStatus = String(item.status || "").toLowerCase().trim();
    let matchedKey = "other";

    if (rawStatus.includes("pending")) {
      matchedKey = "pending";
    } else if (rawStatus.includes("under") || rawStatus.includes("review")) {
      matchedKey = "under_review";
    } else if (rawStatus.includes("approv") || rawStatus.includes("completed")) {
      matchedKey = "approved";
    } else if (rawStatus.includes("reject") || rawStatus.includes("revok")) {
      matchedKey = "rejected";
    } else if (rawStatus.includes("correct") || rawStatus.includes("change")) {
      matchedKey = "needs_correction";
    }

    groups.get(matchedKey).push(item);
  }

  return STATUS_ORDER.map((def) => {
    const items = groups.get(def.key) || [];
    // Sort items by date desc
    items.sort((a, b) => {
      const dateA = a.event_date || a.created_at || "";
      const dateB = b.event_date || b.created_at || "";
      return String(dateB).localeCompare(String(dateA));
    });

    return {
      statusKey: def.key,
      statusLabel: def.label,
      count: items.length,
      items,
    };
  }).filter((g) => g.count > 0);
}

/**
 * Computes high-level statistics for the submissions panel header:
 * - Submissions count (N)
 * - Workshops count (M)
 * - Data through <date>
 *
 * @param {Array<Object>} submissions
 * @returns {{
 *   totalSubmissions: number,
 *   totalWorkshops: number,
 *   lastUpdatedFormatted: string
 * }}
 */
export function getSubmissionsSummary(submissions = []) {
  const totalSubmissions = submissions.length;

  let totalWorkshops = 0;
  let latestDate = null;

  for (const item of submissions) {
    const type = String(item.event_type || "").toLowerCase();
    if (type.includes("workshop") || type.includes("program") || type.includes("seminar")) {
      totalWorkshops += 1;
    }

    const parsed = extractSubmissionDate(item);
    if (parsed) {
      const d = new Date(parsed.isoDate);
      if (!latestDate || d > latestDate) {
        latestDate = d;
      }
    }
  }

  // If none explicitly matched workshop/seminar, default to distinct types count or total
  if (totalWorkshops === 0 && totalSubmissions > 0) {
    const types = new Set(submissions.map((s) => s.event_type || "Standard").filter(Boolean));
    totalWorkshops = types.size;
  }

  let lastUpdatedFormatted = "recently";
  if (latestDate) {
    lastUpdatedFormatted = `${latestDate.getDate()} ${MONTH_NAMES_SHORT[latestDate.getMonth()]} ${latestDate.getFullYear()}`;
  } else {
    const now = new Date();
    lastUpdatedFormatted = `${now.getDate()} ${MONTH_NAMES_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  }

  return {
    totalSubmissions,
    totalWorkshops,
    lastUpdatedFormatted,
  };
}

/**
 * Calculates checkbox selection state for a group of item IDs:
 *
 * @param {Array<string|number>} groupItemIds
 * @param {Set<string|number>} selectedIdsSet
 * @returns {{
 *   checked: boolean,
 *   indeterminate: boolean,
 *   selectedCount: number
 * }}
 */
export function calculateGroupSelectionState(groupItemIds = [], selectedIdsSet) {
  if (!groupItemIds || groupItemIds.length === 0 || !selectedIdsSet) {
    return { checked: false, indeterminate: false, selectedCount: 0 };
  }

  let selectedCount = 0;
  for (const id of groupItemIds) {
    if (selectedIdsSet.has(id)) {
      selectedCount += 1;
    }
  }

  const allSelected = selectedCount === groupItemIds.length;
  const someSelected = selectedCount > 0 && selectedCount < groupItemIds.length;

  return {
    checked: allSelected,
    indeterminate: someSelected,
    selectedCount,
  };
}
