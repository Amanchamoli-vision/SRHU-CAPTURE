import { describe, expect, it } from "vitest";

import { MAX_STEM_LENGTH, fileNameFromResponse, reportFileName } from "../../src/utils/fileNames";

// Same cases as backend/tests/test_file_names.py: the two rules must agree.
describe("reportFileName", () => {
  it("uses the event title", () => {
    expect(reportFileName("IEEE Conference")).toBe("IEEE Conference.pdf");
  });

  it("replaces invalid characters and collapses spaces", () => {
    expect(reportFileName('AI: "Ethics" / Law? <2026>|*')).toBe("AI Ethics Law 2026.pdf");
    expect(reportFileName("Line\nbreak\tand\u0000null")).toBe("Line break and null.pdf");
  });

  it("keeps the extension exactly once", () => {
    expect(reportFileName("Budget.pdf")).toBe("Budget.pdf");
    expect(reportFileName("Budget.PDF")).toBe("Budget.pdf");
  });

  it("cuts a long title at a word", () => {
    const title =
      "International Conference on Advances in Computing Communication and Sustainable Engineering Practices 2026";
    const stem = reportFileName(title).slice(0, -4);
    expect(stem.length).toBeLessThanOrEqual(MAX_STEM_LENGTH);
    expect(title.startsWith(stem)).toBe(true);
    expect(title[stem.length]).toBe(" ");
  });

  it("cuts one very long word hard", () => {
    expect(reportFileName("x".repeat(300))).toHaveLength(MAX_STEM_LENGTH + 4);
  });

  it("falls back for empty or unusable titles", () => {
    for (const title of [null, undefined, "", "   ", "???", "..."]) {
      expect(reportFileName(title)).toBe("Event Report.pdf");
    }
  });

  it("avoids reserved Windows names", () => {
    expect(reportFileName("CON")).toBe("CON Report.pdf");
  });

  it("keeps non-ASCII titles", () => {
    expect(reportFileName("वार्षिक खेल दिवस")).toBe("वार्षिक खेल दिवस.pdf");
  });

  it("drops trailing dots and spaces", () => {
    expect(reportFileName(" Annual Day. ")).toBe("Annual Day.pdf");
  });
});

describe("fileNameFromResponse", () => {
  const response = (value) => ({ headers: { get: () => value } });

  it("prefers the UTF-8 name", () => {
    expect(fileNameFromResponse(response(`attachment; filename="IEEE_Conference.pdf"; filename*=UTF-8''IEEE%20Conference.pdf`)))
      .toBe("IEEE Conference.pdf");
  });

  it("falls back to the plain name, or null", () => {
    expect(fileNameFromResponse(response('attachment; filename="Report.pdf"'))).toBe("Report.pdf");
    expect(fileNameFromResponse(response(null))).toBeNull();
  });
});
