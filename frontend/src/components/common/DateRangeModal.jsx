import { useEffect, useState } from "react";
import Modal from "../teacher/Modal";
import { IconCalendar, IconRotateCcw } from "../teacher/icons";

/**
 * Date Range Modal
 *
 * Filter events occurring between a Start Date and an End Date.
 * Supported across Dean, Teacher, and Event Manager roles.
 */
export default function DateRangeModal({
  open,
  onClose,
  startDate = "",
  endDate = "",
  onApply,
  onClear,
}) {
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraftStart(startDate || "");
      setDraftEnd(endDate || "");
      setError("");
    }
  }, [open, startDate, endDate]);

  const handleStartChange = (val) => {
    setDraftStart(val);
    if (val && draftEnd && val > draftEnd) {
      setError("Start date cannot be after end date.");
    } else {
      setError("");
    }
  };

  const handleEndChange = (val) => {
    setDraftEnd(val);
    if (draftStart && val && draftStart > val) {
      setError("End date cannot be before start date.");
    } else {
      setError("");
    }
  };

  const handleApply = (e) => {
    e?.preventDefault();
    if (draftStart && draftEnd && draftStart > draftEnd) {
      setError("Start date cannot be after end date.");
      return;
    }
    setError("");
    onApply?.({ startDate: draftStart, endDate: draftEnd });
    onClose?.();
  };

  const handleClear = () => {
    setDraftStart("");
    setDraftEnd("");
    setError("");
    onClear?.();
    onClose?.();
  };

  const hasActiveFilter = Boolean(startDate || endDate);
  const canApply = !error && Boolean(draftStart || draftEnd);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Filter Events"
      title={
        <span className="inline-flex items-center gap-2">
          <IconCalendar className="h-5 w-5 text-accent shrink-0" aria-hidden="true" />
          <span>Filter by Date Range</span>
        </span>
      }
      subtitle="Select a start date and end date to view events within that period."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {(hasActiveFilter || draftStart || draftEnd) && (
              <button
                type="button"
                onClick={handleClear}
                className="btn btn-ghost btn-xs text-err hover:bg-err/10"
              >
                <IconRotateCcw className="h-3.5 w-3.5" />
                Clear filter
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply || Boolean(error)}
              className="btn btn-primary btn-sm"
            >
              Apply Filter
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleApply} className="space-y-4 py-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="date-range-start"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink"
            >
              <IconCalendar className="h-3.5 w-3.5 text-muted" />
              Start Date
            </label>
            <input
              id="date-range-start"
              type="date"
              value={draftStart}
              max={draftEnd || undefined}
              onChange={(e) => handleStartChange(e.target.value)}
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="date-range-end"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink"
            >
              <IconCalendar className="h-3.5 w-3.5 text-muted" />
              End Date
            </label>
            <input
              id="date-range-end"
              type="date"
              value={draftEnd}
              min={draftStart || undefined}
              onChange={(e) => handleEndChange(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        {error && (
          <div
            className="rounded-lg border border-err/20 bg-err/10 px-3.5 py-2.5 text-xs text-err"
            role="alert"
          >
            {error}
          </div>
        )}

        <p className="prose-muted text-[11px] leading-relaxed">
          Tip: You can select both dates for a closed interval, or just a start date to see all events from that day onwards.
        </p>
      </form>
    </Modal>
  );
}
