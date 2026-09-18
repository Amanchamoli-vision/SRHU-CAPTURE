/**
 * Table filters and paging, held in the URL query string.
 *
 * The URL is the single source of truth rather than component state, so a
 * filtered page can be linked, bookmarked and reloaded into the same view —
 * and there is only one place a filter can be out of step with the page it
 * produced.
 *
 * Every filter change resets to page 1. Without that, narrowing a filter while
 * on page 7 shows an empty table and looks like a bug.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export const DEFAULT_PER_PAGE = 25;
export const PER_PAGE_OPTIONS = [25, 50, 100];

export default function useTableQuery(defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = useMemo(() => {
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const rawPer = Number(searchParams.get("per")) || DEFAULT_PER_PAGE;
    const per = PER_PAGE_OPTIONS.includes(rawPer) ? rawPer : DEFAULT_PER_PAGE;

    return {
      page,
      per,
      q: searchParams.get("q") ?? defaults.q ?? "",
      status: searchParams.get("status") ?? defaults.status ?? "all",
      type: searchParams.get("type") ?? defaults.type ?? "",
      date: searchParams.get("date") ?? defaults.date ?? "",
      skip: (page - 1) * per,
    };
    // defaults is a literal at every call site; re-reading it per render is fine.
  }, [searchParams, defaults.q, defaults.status, defaults.type, defaults.date]);

  const write = useCallback(
    (next, { replace = false } = {}) => {
      const params = new URLSearchParams();
      // Only non-default values are written, so the common case stays a clean
      // URL rather than ?page=1&per=25&q=&status=all&type=&date=
      if (next.page > 1) params.set("page", String(next.page));
      if (next.per !== DEFAULT_PER_PAGE) params.set("per", String(next.per));
      if (next.q) params.set("q", next.q);
      if (next.status && next.status !== "all") params.set("status", next.status);
      if (next.type) params.set("type", next.type);
      if (next.date) params.set("date", next.date);
      setSearchParams(params, { replace });
    },
    [setSearchParams],
  );

  /** Change one filter and return to the first page. */
  const setFilter = useCallback(
    (name, value, options) => {
      write({ ...query, [name]: value, page: 1 }, options);
    },
    [query, write],
  );

  const setPage = useCallback(
    (page) => write({ ...query, page: Math.max(1, page) }),
    [query, write],
  );

  const setPerPage = useCallback(
    (per) => write({ ...query, per, page: 1 }),
    [query, write],
  );

  const reset = useCallback(
    () => write({ page: 1, per: query.per, q: "", status: "all", type: "", date: "" }),
    [query.per, write],
  );

  return { query, setFilter, setPage, setPerPage, reset };
}
