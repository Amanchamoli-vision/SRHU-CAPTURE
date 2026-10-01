import { describe, expect, it } from "vitest";

describe("date range filter logic", () => {
  const matchesDateRange = (eventDate, startDate, endDate) => {
    if (!eventDate) return false;
    if (startDate && eventDate < startDate) return false;
    if (endDate && eventDate > endDate) return false;
    return true;
  };

  const validateDateRange = (startDate, endDate) => {
    if (startDate && endDate && startDate > endDate) {
      return "Start date cannot be after end date.";
    }
    return null;
  };

  it("filters events within inclusive date range", () => {
    const events = [
      { id: 1, event_date: "2026-03-01" },
      { id: 2, event_date: "2026-03-15" },
      { id: 3, event_date: "2026-03-31" },
      { id: 4, event_date: "2026-04-01" },
    ];

    const filtered = events.filter((e) =>
      matchesDateRange(e.event_date, "2026-03-01", "2026-03-31")
    );

    expect(filtered.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("filters events with only start date", () => {
    const events = [
      { id: 1, event_date: "2026-02-28" },
      { id: 2, event_date: "2026-03-01" },
      { id: 3, event_date: "2026-04-10" },
    ];

    const filtered = events.filter((e) =>
      matchesDateRange(e.event_date, "2026-03-01", "")
    );

    expect(filtered.map((e) => e.id)).toEqual([2, 3]);
  });

  it("filters events with only end date", () => {
    const events = [
      { id: 1, event_date: "2026-02-28" },
      { id: 2, event_date: "2026-03-01" },
      { id: 3, event_date: "2026-04-10" },
    ];

    const filtered = events.filter((e) =>
      matchesDateRange(e.event_date, "", "2026-03-01")
    );

    expect(filtered.map((e) => e.id)).toEqual([1, 2]);
  });

  it("validates that start date cannot be after end date", () => {
    expect(validateDateRange("2026-05-10", "2026-05-01")).toBe(
      "Start date cannot be after end date."
    );
    expect(validateDateRange("2026-05-01", "2026-05-10")).toBeNull();
    expect(validateDateRange("2026-05-01", "2026-05-01")).toBeNull();
  });
});
