import { describe, expect, it } from "vitest";
import {
  calculateGroupSelectionState,
  extractSubmissionDate,
  formatMonthLabel,
  formatRowDate,
  getSubmissionsSummary,
  groupSubmissionsByDate,
  groupSubmissionsByStatus,
} from "../../src/utils/submissionGrouping";

describe("submissionGrouping utility", () => {
  describe("extractSubmissionDate", () => {
    it("extracts year, month, day, and isoDate from event_date without timezone offset", () => {
      const res = extractSubmissionDate({ event_date: "2026-10-04" });
      expect(res).toEqual({
        year: 2026,
        month: 10,
        day: 4,
        isoDate: "2026-10-04",
      });
    });

    it("falls back to start_date or created_at if event_date is missing", () => {
      const res1 = extractSubmissionDate({ start_date: "2025-09-15" });
      expect(res1?.year).toBe(2025);
      expect(res1?.month).toBe(9);
      expect(res1?.day).toBe(15);

      const res2 = extractSubmissionDate({ created_at: "2024-12-01T10:30:00Z" });
      expect(res2?.year).toBe(2024);
      expect(res2?.month).toBe(12);
    });

    it("returns null for empty or null event", () => {
      expect(extractSubmissionDate(null)).toBeNull();
      expect(extractSubmissionDate({})).toBeNull();
    });
  });

  describe("formatMonthLabel", () => {
    it("formats year and month to uppercase month name and year", () => {
      expect(formatMonthLabel(2026, 10)).toBe("OCTOBER 2026");
      expect(formatMonthLabel(2026, 9)).toBe("SEPTEMBER 2026");
      expect(formatMonthLabel(2025, 12)).toBe("DECEMBER 2025");
    });
  });

  describe("formatRowDate", () => {
    it("formats dates with single digit day without leading zero", () => {
      expect(formatRowDate("2026-10-04")).toBe("4 Oct 2026");
      expect(formatRowDate("2026-09-30")).toBe("30 Sep 2026");
      expect(formatRowDate("2025-01-01")).toBe("1 Jan 2025");
    });

    it("handles empty or missing date gracefully", () => {
      expect(formatRowDate("")).toBe("—");
      expect(formatRowDate(null)).toBe("—");
    });
  });

  describe("groupSubmissionsByDate", () => {
    const sampleSubmissions = [
      { id: "e1", event_name: "Workshop A", event_date: "2026-10-04" },
      { id: "e2", event_name: "Workshop B", event_date: "2026-10-01" },
      { id: "e3", event_name: "Workshop C", event_date: "2026-09-30" },
      { id: "e4", event_name: "Workshop D", event_date: "2026-09-15" },
      { id: "e5", event_name: "Seminar E", event_date: "2025-11-20" },
      { id: "e6", event_name: "Conference F", event_date: "2025-05-10" },
    ];

    it("groups submissions into Year -> Month -> Items structure", () => {
      const groups = groupSubmissionsByDate(sampleSubmissions);

      // 2 distinct years: 2026 and 2025
      expect(groups).toHaveLength(2);

      // Newest year first
      expect(groups[0].year).toBe(2026);
      expect(groups[0].count).toBe(4);
      expect(groups[1].year).toBe(2025);
      expect(groups[1].count).toBe(2);

      // Under 2026: 2 months (October and September)
      expect(groups[0].months).toHaveLength(2);
      expect(groups[0].months[0].monthLabel).toBe("OCTOBER 2026");
      expect(groups[0].months[0].count).toBe(2);
      expect(groups[0].months[1].monthLabel).toBe("SEPTEMBER 2026");
      expect(groups[0].months[1].count).toBe(2);

      // Under 2025: 2 months (November and May)
      expect(groups[1].months).toHaveLength(2);
      expect(groups[1].months[0].monthLabel).toBe("NOVEMBER 2025");
      expect(groups[1].months[1].monthLabel).toBe("MAY 2025");
    });

    it("sorts items within a month by date desc", () => {
      const groups = groupSubmissionsByDate(sampleSubmissions);
      const octItems = groups[0].months[0].items;

      expect(octItems[0].id).toBe("e1"); // 4 Oct 2026
      expect(octItems[1].id).toBe("e2"); // 1 Oct 2026
    });

    it("does not create empty months or empty years", () => {
      const groups = groupSubmissionsByDate(sampleSubmissions);
      for (const yearGroup of groups) {
        expect(yearGroup.count).toBeGreaterThan(0);
        for (const monthGroup of yearGroup.months) {
          expect(monthGroup.count).toBeGreaterThan(0);
          expect(monthGroup.items.length).toBeGreaterThan(0);
        }
      }
    });

    it("returns empty array when passed empty or non-array input", () => {
      expect(groupSubmissionsByDate([])).toEqual([]);
      expect(groupSubmissionsByDate(null)).toEqual([]);
    });
  });

  describe("groupSubmissionsByStatus", () => {
    it("groups items into status categories and removes empty groups", () => {
      const items = [
        { id: 1, event_name: "P1", status: "pending", event_date: "2026-10-01" },
        { id: 2, event_name: "P2", status: "pending", event_date: "2026-10-02" },
        { id: 3, event_name: "A1", status: "approved", event_date: "2026-09-10" },
      ];

      const groups = groupSubmissionsByStatus(items);
      expect(groups).toHaveLength(2);
      expect(groups[0].statusKey).toBe("pending");
      expect(groups[0].count).toBe(2);
      expect(groups[1].statusKey).toBe("approved");
      expect(groups[1].count).toBe(1);
    });
  });

  describe("getSubmissionsSummary", () => {
    it("calculates submissions count, workshops count, and data through date", () => {
      const items = [
        { id: 1, event_name: "Workshop 1", event_type: "Workshop", event_date: "2026-10-04" },
        { id: 2, event_name: "Seminar 1", event_type: "Seminar", event_date: "2026-09-28" },
      ];

      const summary = getSubmissionsSummary(items);
      expect(summary.totalSubmissions).toBe(2);
      expect(summary.totalWorkshops).toBe(2);
      expect(summary.lastUpdatedFormatted).toBe("4 Oct 2026");
    });
  });

  describe("calculateGroupSelectionState", () => {
    it("calculates checked, unchecked, and indeterminate states", () => {
      const ids = ["1", "2", "3"];

      // None selected
      const emptySet = new Set();
      expect(calculateGroupSelectionState(ids, emptySet)).toEqual({
        checked: false,
        indeterminate: false,
        selectedCount: 0,
      });

      // Partial selected -> indeterminate
      const partialSet = new Set(["1"]);
      expect(calculateGroupSelectionState(ids, partialSet)).toEqual({
        checked: false,
        indeterminate: true,
        selectedCount: 1,
      });

      // All selected -> checked, not indeterminate
      const allSet = new Set(["1", "2", "3"]);
      expect(calculateGroupSelectionState(ids, allSet)).toEqual({
        checked: true,
        indeterminate: false,
        selectedCount: 3,
      });
    });
  });

  describe("Multi-year and 3+ months sample dataset verification", () => {
    it("correctly segregates dataset spanning 2 years and 4 months", () => {
      const data = [
        { id: "101", event_name: "Workshop Oct 2026", event_date: "2026-10-04" },
        { id: "102", event_name: "Workshop Sep 2026", event_date: "2026-09-18" },
        { id: "103", event_name: "Workshop Aug 2026", event_date: "2026-08-22" },
        { id: "104", event_name: "Seminar Dec 2025", event_date: "2025-12-15" },
        { id: "105", event_name: "Conference Mar 2025", event_date: "2025-03-10" },
      ];

      const grouped = groupSubmissionsByDate(data);

      expect(grouped).toHaveLength(2);
      expect(grouped[0].year).toBe(2026);
      expect(grouped[1].year).toBe(2025);

      // Verify months under 2026
      expect(grouped[0].months).toHaveLength(3);
      expect(grouped[0].months.map((m) => m.monthLabel)).toEqual([
        "OCTOBER 2026",
        "SEPTEMBER 2026",
        "AUGUST 2026",
      ]);

      // Verify months under 2025
      expect(grouped[1].months).toHaveLength(2);
      expect(grouped[1].months.map((m) => m.monthLabel)).toEqual([
        "DECEMBER 2025",
        "MARCH 2025",
      ]);

      // Check counts
      expect(grouped[0].count).toBe(3);
      expect(grouped[1].count).toBe(2);
    });
  });
});

