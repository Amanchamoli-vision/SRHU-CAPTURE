/**
 * Download names for generated reports: the event's own title, made safe.
 * "IEEE Conference" downloads as "IEEE Conference.pdf".
 *
 * The server sends this name (Content-Disposition, built by
 * backend/app/utils/file_names.py); reportFileName() applies the same rules
 * so a download still gets a good name if the header cannot be read. Keep the
 * two in step.
 */

export const MAX_STEM_LENGTH = 80;
const DEFAULT_STEM = "Event Report";
// Characters no file system accepts, plus control characters.
// eslint-disable-next-line no-control-regex
const INVALID = /[\\/:*?"<>|\u0000-\u001F\u007F]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function truncate(stem, limit) {
  if (stem.length <= limit) return stem;
  let cut = stem.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  // Break at a word if that keeps most of the length; else cut hard.
  if (space >= Math.floor(limit / 2)) cut = cut.slice(0, space);
  return cut.replace(/[ .\-_,;]+$/, "");
}

/** "<title>.pdf", safe on every file system and still readable. */
export function reportFileName(title, fallback = DEFAULT_STEM) {
  let stem = String(title ?? "").normalize("NFKC");
  stem = stem.replace(INVALID, " ").replace(/\s+/g, " ").trim();
  if (stem.toLowerCase().endsWith(".pdf")) stem = stem.slice(0, -4);
  stem = stem.replace(/^[ .]+|[ .]+$/g, "");
  stem = truncate(stem, MAX_STEM_LENGTH).replace(/^[ .]+|[ .]+$/g, "");
  if (!stem) stem = fallback;
  if (RESERVED.test(stem)) stem = `${stem} Report`;
  return `${stem}.pdf`;
}

/** The file name the server gave a download, or null if it cannot be read. */
export function fileNameFromResponse(response) {
  const header = response?.headers?.get("Content-Disposition") || "";
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}
