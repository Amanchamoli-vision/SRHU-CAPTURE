import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons";

/**
 * Bottom sheet on a phone, centred panel from 640px up — the Himovation
 * dialog treatment. Escape and a backdrop click both close it, and the page
 * behind it cannot scroll while it is open.
 */
export default function Modal({ open, onClose, eyebrow, title, subtitle, wide, children, footer, zIndex }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="hv-backdrop"
      style={zIndex ? { zIndex } : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={`modal-panel ${wide ? "modal-panel-lg" : ""}`}
      >
        <div className="flex items-start justify-between gap-4 border-b hairline px-6 py-5">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="h3 mt-1 text-ink">{title}</h2>
            {subtitle && <p className="prose-muted mt-1 text-xs">{subtitle}</p>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-btn icon-btn-sm shrink-0"
            aria-label="Close dialog"
          >
            <IconX />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t hairline px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
