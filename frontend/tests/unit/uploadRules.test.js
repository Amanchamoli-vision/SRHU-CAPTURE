import { describe, expect, it } from "vitest";

import {
  MAX_DOC_TOTAL,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_TOTAL,
  limitFor,
  overLimitMessage,
  usedBytes,
  validatePick,
} from "../../src/utils/uploadRules";
import { DEFAULT_UPLOAD_LIMITS } from "../../src/utils/uploadLimits";

const MB = 1024 * 1024;

/** validatePick only reads name, type and size, so a plain object is enough. */
const file = (name, mb, type) => ({ name, size: Math.round(mb * MB), type });
const jpg = (name, mb) => file(name, mb, "image/jpeg");
const mp4 = (name, mb) => file(name, mb, "video/mp4");
const pdf = (name, mb) => file(name, mb, "application/pdf");

describe("the fallback constants track the shared defaults", () => {
  it("derives from DEFAULT_UPLOAD_LIMITS rather than restating them", () => {
    expect(MAX_IMAGE_COUNT).toBe(DEFAULT_UPLOAD_LIMITS.max_photos_per_event);
    expect(MAX_IMAGE_SIZE).toBe(DEFAULT_UPLOAD_LIMITS.max_photo_size_mb * MB);
    expect(MAX_VIDEO_TOTAL).toBe(DEFAULT_UPLOAD_LIMITS.max_video_total_mb * MB);
    expect(MAX_DOC_TOTAL).toBe(DEFAULT_UPLOAD_LIMITS.max_documents_total_mb * MB);
  });
});

describe("limitFor", () => {
  it("honours a configured document budget instead of the built-in constant", () => {
    // Documents became configurable; this used to ignore its argument entirely.
    expect(limitFor("document", { max_documents_total_mb: 40 })).toBe(40 * MB);
  });

  it("falls back to the constant when no limits are supplied", () => {
    expect(limitFor("document", null)).toBe(MAX_DOC_TOTAL);
  });

  it("returns null for photos with no combined budget", () => {
    expect(limitFor("image", { max_photo_total_mb: null })).toBeNull();
  });
});

describe("usedBytes", () => {
  it("counts stored files plus in-flight uploads, ignoring failed ones", () => {
    const saved = [{ file_size: 5 * MB }];
    const pending = [{ size: 3 * MB }, { size: 9 * MB, error: "boom" }];
    expect(usedBytes(saved, pending)).toBe(8 * MB);
  });
});

describe("validatePick — types", () => {
  it("rejects a file whose type is not an allowed image", () => {
    const { accepted, rejections } = validatePick({
      files: [file("notes.bmp", 1, "image/bmp")],
      kind: "image",
    });
    expect(accepted).toHaveLength(0);
    expect(rejections[0]).toMatch(/not a JPG, PNG, WEBP or GIF/);
  });

  it("falls back to the extension when the picker reports no type", () => {
    // Android's picker often leaves file.type empty.
    const { accepted } = validatePick({ files: [file("photo.png", 1, "")], kind: "image" });
    expect(accepted).toHaveLength(1);
  });
});

describe("validatePick — per-file size", () => {
  it("rejects a photo above the configured per-file limit", () => {
    const { accepted, rejections } = validatePick({
      files: [jpg("big.jpg", 30)],
      kind: "image",
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_photo_size_mb: 25 },
    });
    expect(accepted).toHaveLength(0);
    expect(rejections[0]).toMatch(/larger than 25 MB/);
  });

  it("rejects a video above the configured per-file limit", () => {
    const { rejections } = validatePick({
      files: [mp4("clip.mp4", 150)],
      kind: "video",
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_video_size_mb: 100 },
    });
    expect(rejections[0]).toMatch(/larger than 100 MB/);
  });
});

describe("validatePick — counts", () => {
  it("stops at the configured photo count", () => {
    const { accepted, rejections } = validatePick({
      files: [jpg("a.jpg", 1), jpg("b.jpg", 1), jpg("c.jpg", 1)],
      kind: "image",
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_photos_per_event: 2 },
    });
    expect(accepted).toHaveLength(2);
    expect(rejections[0]).toMatch(/limit is 2 photos/);
  });

  it("treats a null video count as unlimited", () => {
    const files = Array.from({ length: 12 }, (_, i) => mp4(`v${i}.mp4`, 1));
    const { accepted, rejections } = validatePick({
      files,
      kind: "video",
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_videos_per_event: null },
    });
    expect(accepted).toHaveLength(12);
    expect(rejections).toHaveLength(0);
  });
});

describe("validatePick — combined budget", () => {
  it("keeps everything picked before the file that broke the budget", () => {
    const { accepted, overLimit } = validatePick({
      files: [mp4("a.mp4", 60), mp4("b.mp4", 60), mp4("c.mp4", 60)],
      kind: "video",
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_video_total_mb: 150 },
    });
    expect(accepted.map((f) => f.name)).toEqual(["a.mp4", "b.mp4"]);
    expect(overLimit).toMatch(/You have exceeded the limit/);
  });

  it("counts what is already attached towards the budget", () => {
    const { accepted, overLimit } = validatePick({
      files: [mp4("new.mp4", 60)],
      kind: "video",
      savedItems: [{ file_size: 150 * MB }],
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_video_total_mb: 200 },
    });
    expect(accepted).toHaveLength(0);
    expect(overLimit).toBeTruthy();
  });

  it("applies the configured document budget", () => {
    const { accepted, overLimit } = validatePick({
      files: [pdf("a.pdf", 8), pdf("b.pdf", 8)],
      kind: "document",
      limits: { ...DEFAULT_UPLOAD_LIMITS, max_documents_total_mb: 10 },
    });
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(overLimit).toBeTruthy();
  });
});

describe("validatePick — duplicate names", () => {
  it("routes a same-named file to duplicates rather than rejecting it", () => {
    const { accepted, duplicates } = validatePick({
      files: [jpg("Photo.JPG", 1)],
      kind: "image",
      existingNames: ["photo.jpg"],
    });
    expect(accepted).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });
});

describe("overLimitMessage", () => {
  it("uses the wording PRD 11 specifies, with the configured limit", () => {
    expect(overLimitMessage("video", { max_video_total_mb: 200 })).toBe(
      "You have exceeded the limit. Maximum allowed video size is 200 MB.",
    );
  });
});
