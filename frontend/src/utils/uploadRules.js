/**
 * What may be attached to an event, and how much of it.
 *
 * Pure functions, deliberately: the wizard's pick handler was already long,
 * and these rules are the part most worth testing on their own.
 *
 * Mirrors the server's limits (backend/app/config.py). The server is the
 * authority — this exists so a teacher learns about a limit before spending
 * minutes uploading, not after.
 */

/** PRD 7: ten photos, 20 MB each, four formats. */
export const MAX_IMAGE_COUNT = 10;
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

/** PRD 11: one combined budget, no cap on how many files it is split across. */
export const MAX_VIDEO_TOTAL = 200 * 1024 * 1024;

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

export const DEFAULT_UPLOAD_LIMITS = {
  max_photos_per_event: 10,
  max_photo_size_mb: 20,
  max_photo_total_mb: null,
  max_videos_per_event: null,
  max_video_size_mb: 200,
  max_video_total_mb: 200,
};

export const formatMb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

const extensionOf = (name) => (name || "").split(".").pop()?.toLowerCase() || "";

/** The over-limit copy PRD 11 specifies, reused for documents. */
export function overLimitMessage(kind, limits = null) {
  const noun = kind === "video" ? "video" : kind === "image" ? "photo" : "document";
  const limit = limitFor(kind, limits);
  return `You have exceeded the limit. Maximum allowed ${noun} size is ${formatMb(limit)}.`;
}

/** Combined size of what is already attached plus what is still uploading. */
export function usedBytes(saved = [], pending = []) {
  const stored = saved.reduce((sum, item) => sum + (item.file_size || 0), 0);
  const inFlight = pending
    .filter((upload) => !upload.error)
    .reduce((sum, upload) => sum + (upload.size || 0), 0);
  return stored + inFlight;
}

export function limitFor(kind, limits = null) {
  if (kind === "video") {
    const mb = limits?.max_video_total_mb;
    return mb != null ? mb * 1024 * 1024 : MAX_VIDEO_TOTAL;
  }
  if (kind === "document") return MAX_DOC_TOTAL;
  if (kind === "image") {
    const mb = limits?.max_photo_total_mb;
    return mb != null ? mb * 1024 * 1024 : null;
  }
  return null; // photos without total budget are capped per file and count
}

/**
 * Sort a batch of picked files into accepted, rejected and duplicate-named.
 *
 * Checks run type -> per-file size -> running total -> duplicate name, in that
 * order, so the teacher is never asked to confirm a duplicate for a file that
 * would have been rejected anyway.
 *
 * @returns {{accepted: File[], duplicates: File[], rejections: string[],
 *            overLimit: string|null}}
 */
export function validatePick({
  files,
  kind,
  savedItems = [],
  pendingUploads = [],
  existingNames = [],
  limits = null,
}) {
  const accepted = [];
  const duplicates = [];
  const rejections = [];
  let overLimit = null;

  const isImage = kind === "image";
  const isVideo = kind === "video";
  const isDocument = kind === "document";

  const maxImageCount = limits?.max_photos_per_event ?? MAX_IMAGE_COUNT;
  const maxImageSize =
    limits?.max_photo_size_mb != null
      ? limits.max_photo_size_mb * 1024 * 1024
      : MAX_IMAGE_SIZE;
  const maxVideoCount = limits?.max_videos_per_event ?? null;
  const maxVideoSize =
    limits?.max_video_size_mb != null
      ? limits.max_video_size_mb * 1024 * 1024
      : null;

  const totalLimit = limitFor(kind, limits);

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
    } else if (isVideo) {
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

    if (isImage && file.size > maxImageSize) {
      rejections.push(`"${file.name}" is larger than ${formatMb(maxImageSize)}.`);
      continue;
    }

    if (isVideo && maxVideoSize != null && file.size > maxVideoSize) {
      rejections.push(`"${file.name}" is larger than ${formatMb(maxVideoSize)}.`);
      continue;
    }

    if (isImage && runningCount >= maxImageCount) {
      rejections.push(
        `"${file.name}" was not added. The limit is ${maxImageCount} photos.`,
      );
      continue;
    }

    if (isVideo && maxVideoCount != null && runningCount >= maxVideoCount) {
      rejections.push(
        `"${file.name}" was not added. The limit is ${maxVideoCount} videos.`,
      );
      continue;
    }

    if (totalLimit != null && runningBytes + file.size > totalLimit) {
      // Everything picked before this one is still accepted, which is what
      // "you have exceeded the limit" implies.
      overLimit = overLimitMessage(kind, limits);
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
