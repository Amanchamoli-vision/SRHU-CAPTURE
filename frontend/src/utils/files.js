/**
 * File helpers shared by the upload panel and the submit preview.
 *
 * Lifted verbatim out of UploadPanel so the preview labels attachment sizes
 * exactly as the upload step did, rather than growing a second rounding rule
 * that shows the same file as two different sizes on two screens.
 */

/** 1536 -> "1.5 KB", 20971520 -> "20.0 MB". */
export function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function getFileExtension(fileName) {
  const parts = String(fileName || "").split(".");
  if (parts.length <= 1) return "FILE";
  return parts.pop().toUpperCase().slice(0, 4);
}

export default formatFileSize;
