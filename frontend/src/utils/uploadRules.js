/**
 * What may be attached to an event, and how much of it.
 *
 * Pure functions, deliberately: the wizard's pick handler was already long,
 * and these rules are the part most worth testing on their own.
 *
 * The photo and video *amounts* are no longer constants here — they are the
 * Super Admin's configuration, fetched by `services/uploadLimits.js` and
 * passed in as `limits`. What stays hardcoded is what is not configurable:
 * which formats are accepted, and the document budget.
 *
 * The server is still the authority on every limit; this exists so a teacher
 * learns about one before spending minutes uploading, not after.
 */

import { FALLBACK_UPLOAD_LIMITS } from "../services/uploadLimits";

/** PRD 7: four photo formats. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

/** PRD 9: combined budget only — any number of documents, no per-file cap. */
export const MAX_DOC_TOTAL = 15 * 1024 * 1024;
export const ALLOWED_DOC_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
];

/**
 * `accept` lists both extensions and MIME types on purpose: Android's picker
 * honours extensions, desktop browsers honour MIME types, and listing only one
 * greys out valid files on the other.
 */
export const IMAGE_ACCEPT = [
  ...ALLOWED_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
  ...ALLOWED_IMAGE_TYPES,
].join(",");

export const DOC_ACCEPT = ALLOWED_DOC_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export const formatMb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

const MEGABYTE = 1024 * 1024;

/** Megabytes from the server to bytes, passing `null` ("no limit") through. */
export const mbToBytes = (megabytes) =>
  megabytes == null ? null : megabytes * MEGABYTE;

const extensionOf = (name) => (name || "").split(".").pop()?.toLowerCase() || "";

/**
 * The four numbers the wizard needs for one upload kind, in bytes and counts,
 * derived from the Super Admin's configuration.
 *
 * Every caller goes through this rather than reading `limits` directly, so a
 * missing or half-loaded configuration resolves to the fallback in one place.
 * `null` for a cap means that cap is off.
 */
export function rulesFor(kind, limits = FALLBACK_UPLOAD_LIMITS) {
  const config = { ...FALLBACK_UPLOAD_LIMITS, ...(limits || {}) };

  if (kind === "image") {
    return {
      maxCount: config.max_photos_per_event,
      maxFileBytes: mbToBytes(config.max_photo_size_mb),
      maxTotalBytes: mbToBytes(config.max_photo_total_mb),
    };
  }
  if (kind === "video") {
    return {
      maxCount: config.max_videos_per_event,
      maxFileBytes: mbToBytes(config.max_video_size_mb),
      maxTotalBytes: mbToBytes(config.max_video_total_mb),
    };
  }
  // Documents are not Super Admin configurable: one combined budget, no
  // per-file cap and no count cap (PRD 9).
  return { maxCount: null, maxFileBytes: null, maxTotalBytes: MAX_DOC_TOTAL };
}

/** The over-limit copy PRD 11 specifies, reused for photos and documents. */
export function overLimitMessage(kind, limitBytes) {
  const noun = kind === "video" ? "video" : kind === "image" ? "photo" : "document";
  return `You have exceeded the limit. Maximum allowed ${noun} size is ${formatMb(limitBytes)}.`;
}

/** Combined size of what is already attached plus what is still uploading. */
export function usedBytes(saved = [], pending = []) {
  const stored = saved.reduce((sum, item) => sum + (item.file_size || 0), 0);
  const inFlight = pending
    .filter((upload) => !upload.error)
    .reduce((sum, upload) => sum + (upload.size || 0), 0);
  return stored + inFlight;
}

/** The combined byte budget for a kind, or null when it has none. */
export function limitFor(kind, limits) {
  return rulesFor(kind, limits).maxTotalBytes;
}

/**
 * Sort a batch of picked files into accepted, rejected and duplicate-named.
 *
 * Checks run type -> per-file size -> count -> running total -> duplicate
 * name, in that order, so the teacher is never asked to confirm a duplicate
 * for a file that would have been rejected anyway.
 *
 * @param {object} args
 * @param {object} args.limits the Super Admin's configuration; omitted or
 *   partial falls back to the shipped defaults.
 * @returns {{accepted: File[], duplicates: File[], rejections: string[],
 *            overLimit: string|null}}
 */
export function validatePick({
  files,
  kind,
  limits,
  savedItems = [],
  pendingUploads = [],
  existingNames = [],
}) {
  const accepted = [];
  const duplicates = [];
  const rejections = [];
  let overLimit = null;

  const isImage = kind === "image";
  const isDocument = kind === "document";
  const { maxCount, maxFileBytes, maxTotalBytes } = rulesFor(kind, limits);

  let runningBytes = usedBytes(savedItems, pendingUploads);
  let runningCount =
    savedItems.length + pendingUploads.filter((upload) => !upload.error).length;

  const takenNames = new Set(
    [...existingNames, ...pendingUploads.map((upload) => upload.name)]
      .filter(Boolean)
      .map((name) => name.trim().toLowerCase()),
  );

  for (const file of files) {
    const extension = extensionOf(file.name);

    if (isImage) {
      const typeOk = ALLOWED_IMAGE_TYPES.includes(file.type);
      const extOk = ALLOWED_IMAGE_EXTENSIONS.includes(extension);
      // Some pickers report an empty type; the extension then decides.
      if (!(typeOk || (!file.type && extOk))) {
        rejections.push(`"${file.name}" is not a JPG, PNG, WEBP or GIF.`);
        continue;
      }
    } else if (kind === "video") {
      if (!file.type.startsWith("video/")) {
        rejections.push(`"${file.name}" is not a video.`);
        continue;
      }
    } else if (isDocument) {
      if (!ALLOWED_DOC_EXTENSIONS.includes(extension)) {
        rejections.push(`"${file.name}" is not a supported document type.`);
        continue;
      }
    }

    if (maxFileBytes != null && file.size > maxFileBytes) {
      rejections.push(`"${file.name}" is larger than ${formatMb(maxFileBytes)}.`);
      continue;
    }

    if (maxCount != null && runningCount >= maxCount) {
      const noun = isImage ? "photos" : kind === "video" ? "videos" : "files";
      rejections.push(
        `"${file.name}" was not added. The limit is ${maxCount} ${noun}.`,
      );
      continue;
    }

    if (maxTotalBytes != null && runningBytes + file.size > maxTotalBytes) {
      // Everything picked before this one is still accepted, which is what
      // "you have exceeded the limit" implies.
      overLimit = overLimitMessage(kind, maxTotalBytes);
      break;
    }

    runningBytes += file.size;
    runningCount += 1;

    if (takenNames.has(file.name.trim().toLowerCase())) {
      duplicates.push(file);
    } else {
      takenNames.add(file.name.trim().toLowerCase());
      accepted.push(file);
    }
  }

  return { accepted, duplicates, rejections, overLimit };
}
