import { useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconFilm,
  IconRotateCcw,
  IconTrash,
  IconUploadCloud,
  IconX,
} from "./icons";

const formatFileSize = (bytes) => {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const getFileExtension = (fileName) => {
  const parts = String(fileName || "").split(".");
  if (parts.length <= 1) return "FILE";
  return parts.pop().toUpperCase().slice(0, 4);
};

/**
 * One upload step of the create-event wizard: a drop zone, the files already
 * stored on the server, and any upload still in flight.
 *
 * Purely presentational. The parent owns the files and does the uploading, so
 * photos, videos and documents all share this one component and can never
 * drift apart in look or behaviour.
 */
export default function UploadPanel({
  kind, // "image" | "video" | "document"
  items = [], // already uploaded, from the server
  uploads = [], // in flight: { key, name, size, progress, error }
  accept,
  max = null, // maximum number of files, or null for no limit
  maxSizeLabel,
  hint,
  emptyLabel,
  disabled = false,
  onPick,
  onRemove,
  onRetry,
  onDismiss,
  // Called when a saved file's (signed, expiring) link fails to load.
  onLoadError,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const active = items.length + uploads.filter((u) => !u.error).length;
  const full = max != null && active >= max;
  const locked = disabled || full;

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length > 0) onPick?.(files);
  };

  return (
    <div>
      {/* ------------------------------------------------------- drop zone */}
      <div
        onDragOver={(e) => {
          if (locked) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (locked) return;
          handleFiles(e.dataTransfer?.files);
        }}
        className={`dropzone ${dragging ? "is-dragging" : ""} ${locked ? "is-locked" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
          disabled={locked}
        />

        <span className="icon-tile">
          {kind === "video" ? <IconFilm /> : <IconUploadCloud />}
        </span>

        <p className="mt-3 font-display text-sm font-semibold text-ink">
          {full ? `You have added the maximum of ${max}` : emptyLabel}
        </p>
        <p className="prose-muted mt-1 text-xs">{hint}</p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={locked}
          className="btn btn-ghost btn-sm mt-4"
        >
          Browse files
        </button>

        <p className="prose-muted mt-2.5 text-[11px]">
          {maxSizeLabel}
          {max != null && ` · ${active} of ${max} added`}
        </p>
      </div>

      {/* ----------------------------------------------------- in flight */}
      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {uploads.map((upload) => (
            <li
              key={upload.key}
              className={`rounded-xl border px-4 py-3 ${
                upload.error ? "border-err/35 bg-err/5" : "hairline bg-raised/40"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{upload.name}</p>
                  <p className="prose-muted mt-0.5 text-xs">
                    {upload.error ? (
                      <span className="text-err">{upload.error}</span>
                    ) : upload.progress == null ? (
                      "Uploading…"
                    ) : (
                      `Uploading… ${Math.round(upload.progress * 100)}%`
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {upload.error ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRetry?.(upload)}
                        className="btn btn-ghost btn-xs"
                      >
                        <IconRotateCcw />
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismiss?.(upload)}
                        className="icon-btn icon-btn-sm"
                        aria-label={`Dismiss ${upload.name}`}
                      >
                        <IconX />
                      </button>
                    </>
                  ) : (
                    <span className="spin h-4 w-4 text-accent" />
                  )}
                </div>
              </div>

              {!upload.error && (
                <div className="progress-track mt-2.5">
                  <span
                    className={`progress-bar ${upload.progress == null ? "is-indeterminate" : ""}`}
                    style={
                      upload.progress == null
                        ? undefined
                        : { width: `${Math.max(3, upload.progress * 100)}%` }
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------- uploaded */}
      {items.length > 0 &&
        (kind === "document" ? (
          <ul className="mt-4 space-y-2.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border hairline bg-raised/40 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="icon-tile h-10 w-10 rounded-xl font-display text-[11px] font-bold">
                    {getFileExtension(item.file_name)}
                  </span>
                  <div className="min-w-0">
                    <a
                      href={item.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="link block truncate text-sm font-medium"
                    >
                      {item.file_name}
                    </a>
                    <p className="prose-muted mt-0.5 text-xs">
                      {formatFileSize(item.file_size)} · Saved
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove?.(item)}
                  disabled={disabled || item.removing}
                  className="btn btn-ghost btn-xs shrink-0 text-err"
                >
                  {item.removing ? <span className="spin h-3.5 w-3.5" /> : <IconTrash />}
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="media-tile group">
                {kind === "video" ? (
                  <video
                    src={item.media_url}
                    className="media-thumb"
                    preload="metadata"
                    muted
                    playsInline
                    controls
                    onError={() => onLoadError?.()}
                  />
                ) : (
                  <a href={item.media_url} target="_blank" rel="noreferrer">
                    <img
                      src={item.media_url}
                      alt={item.file_name}
                      loading="lazy"
                      className="media-thumb"
                      onError={() => onLoadError?.()}
                    />
                  </a>
                )}

                <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{item.file_name}</p>
                    <p className="prose-muted mt-0.5 text-[11px]">
                      {formatFileSize(item.file_size)} · Saved
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove?.(item)}
                    disabled={disabled || item.removing}
                    className="icon-btn icon-btn-sm shrink-0 text-err"
                    aria-label={`Remove ${item.file_name}`}
                    title="Remove"
                  >
                    {item.removing ? <span className="spin h-3.5 w-3.5" /> : <IconTrash />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {items.length === 0 && uploads.length === 0 && (
        <p className="prose-muted mt-4 flex items-center gap-2 text-xs">
          <IconAlertTriangle className="h-4 w-4 shrink-0 text-muted" />
          Nothing added yet. This step is optional — you can continue without it.
        </p>
      )}
    </div>
  );
}
