import { PER_PAGE_OPTIONS } from "../../hooks/useTableQuery";

/**
 * Page controls for a server-paged table.
 *
 * Shows a real range ("Showing 26–50 of 312") rather than a row count, because
 * with server paging the number of rows on screen says nothing about how many
 * there are.
 */
function Pagination({ page, perPage, total, onPageChange, onPerPageChange, disabled }) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline px-4 py-3 sm:px-6">
      <p className="prose-muted text-xs">
        {total === 0 ? "No events" : `Showing ${from}–${to} of ${total}`}
      </p>

      <div className="flex items-center gap-2">
        <label className="prose-muted flex items-center gap-1.5 text-xs">
          <span className="hidden sm:inline">Per page</span>
          <select
            value={perPage}
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            disabled={disabled}
            aria-label="Rows per page"
            className="input h-8 w-auto py-0 text-xs"
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="btn btn-ghost btn-xs"
        >
          Previous
        </button>

        <span className="prose-muted px-1 text-xs tabular-nums">
          {page} of {pageCount}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= pageCount}
          className="btn btn-ghost btn-xs"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Pagination;
