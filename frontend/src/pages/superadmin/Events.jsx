import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson, isAbortError } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import Pagination from "../../components/common/Pagination";
import useTableQuery from "../../hooks/useTableQuery";
import StatusChip from "../../components/teacher/StatusChip";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconInbox,
  IconRefresh,
  IconSearch,
  IconX,
} from "../../components/teacher/icons";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const formatDay = (value) => {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Every submitted event, read-only, so the superadmin can open any event and
 * see its photos, videos and documents. Decisions stay with the Deans.
 */
export default function SuperAdminEvents() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  // Status, search and page live in the URL (see useTableQuery), the same way
  // the Dean's table holds them: linkable, and one place a filter can be out
  // of step with the rows it produced. Every filter change resets to page 1.
  const { query, setFilter, setPage, setPerPage } = useTableQuery();
  const { page, per, q: searchQuery, status: statusFilter } = query;

  const [events, setEvents] = useState([]);
  const [teacherNames, setTeacherNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Totals for the status tabs and the footer, from the server: with one page
  // fetched, the rows on screen cannot say how many there are.
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });

  // Uncontrolled by the URL while typing; see the debounce below.
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  const setStatusFilter = (key) => setFilter("status", key, { replace: true });

  // The teacher directory, only to turn a teacher_id into a name. Fetched
  // once on mount rather than per page: it does not change as the table is
  // paged, and re-requesting it on every Next click would undo the point.
  useEffect(() => {
    let cancelled = false;

    apiJson("/superadmin/users")
      .then((data) => {
        if (cancelled) return;
        setTeacherNames(
          Object.fromEntries((data?.users || []).map((u) => [u.id, u.name || u.email])),
        );
      })
      .catch(() => {
        // Non-blocking: the row simply omits "by <teacher>".
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Only the newest request may update the list: paging or typing quickly
  // must not let a slow, older response overwrite the newer one.
  const loadControllerRef = useRef(null);

  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const loadEvents = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        skip: String(query.skip),
        limit: String(query.per),
      });
      if (query.q) params.set("q", query.q);
      if (query.status && query.status !== "all") {
        params.set("status_bucket", query.status);
      }

      const data = await apiJson(`/dean/events?${params}`, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      setEvents(data?.events || []);
      setTotal(data?.total || 0);
      setCounts(data?.counts || { all: data?.total || 0 });
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      if (err?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Load events error:", err);
      setError(err.message || "Failed to load events");
      setEvents([]);
      setTotal(0);
    } finally {
      if (loadControllerRef.current === controller) setLoading(false);
    }
  }, [navigate, query.skip, query.per, query.q, query.status]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // A bookmarked ?page=99 would otherwise show an empty table that reads as
  // "no matches". Clamp to the last real page.
  useEffect(() => {
    if (loading || total === 0) return;
    const lastPage = Math.max(1, Math.ceil(total / per));
    if (page > lastPage) setPage(lastPage);
  }, [loading, total, per, page, setPage]);

  // Debounced so typing does not fire a request per character; `replace`
  // keeps the back button useful instead of one entry per keystroke.
  useEffect(() => {
    if (searchDraft === searchQuery) return undefined;
    const timer = setTimeout(
      () => setFilter("q", searchDraft, { replace: true }),
      350,
    );
    return () => clearTimeout(timer);
  }, [searchDraft, searchQuery, setFilter]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  // `events` is already one filtered page from the server; the name is kept
  // so the list below reads the same as before.
  const visibleEvents = events;

  // True when an empty table is the result of a filter rather than an empty
  // system, which decides which empty state to show.
  const filtered = statusFilter !== "all" || Boolean(searchQuery);

  return (
    <SuperAdminShell
      active="events"
      profile={profile}
      onLogout={handleLogout}
      railNote="Read-only: open any event to see its photos, videos and documents. Deans make the decisions."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
        <PageHero
          eyebrow="Super Admin"
          title="All"
          accent="Events"
          subtitle="Every event submitted across campus, with the photos, videos and documents attached to it."
          actions={
            <button type="button" onClick={loadEvents} disabled={loading} className="btn btn-ghost">
              {loading ? <span className="spin h-4 w-4" /> : <IconRefresh />}
              Refresh
            </button>
          }
        />

        {error && (
          <div className="toast toast-err mt-6" role="alert">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <p className="flex-1 text-sm font-medium text-ink">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="icon-btn icon-btn-sm -my-1 -mr-1 border-0 bg-transparent"
              aria-label="Dismiss"
            >
              <IconX />
            </button>
          </div>
        )}

        <div className="reveal mt-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between" style={{ "--i": 1 }}>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className="tab"
              >
                {tab.key !== "all" && <span className="dot dot-sm" style={{ "--track": trackOf(tab.key) }} />}
                {tab.label}
                <span className="tab-count">{counts[tab.key]}</span>
              </button>
            ))}
          </div>

          <label className="relative block w-full md:w-72">
            <span className="sr-only">Search events</span>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search event, venue or organiser"
              className="input pl-10"
            />
          </label>
        </div>

        <section className="glass reveal mt-4 overflow-hidden" style={{ "--i": 2 }}>
          {loading ? (
            <div className="px-6 py-16 text-center">
              <span className="spin mx-auto mb-4 block h-9 w-9 text-accent" />
              <p className="prose-muted text-sm">Loading events…</p>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="icon-tile mx-auto">
                <IconInbox />
              </span>
              <p className="h3 mt-4 text-ink">{filtered ? "No matches" : "No events yet"}</p>
              <p className="prose-muted mt-1 text-sm">
                {filtered
                  ? "Try a different search or clear the status filter."
                  : "Nothing has been submitted for review."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line/10">
              {visibleEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    to={`/superadmin/events/${event.id}`}
                    className="flex flex-col gap-2 px-5 py-4 transition hover:bg-raised/50 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-semibold text-ink">
                        {event.event_name || "Untitled Event"}
                      </p>
                      <p className="prose-muted mt-0.5 truncate text-xs">
                        {[event.event_type, formatDay(event.event_date), event.location]
                          .filter(Boolean)
                          .join(" · ")}
                        {teacherNames[event.teacher_id] ? ` · by ${teacherNames[event.teacher_id]}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusChip status={event.status} />
                      <span className="btn btn-ghost btn-xs">
                        View
                        <IconArrowRight />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {total > 0 && (
            <Pagination
              page={page}
              perPage={per}
              total={total}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              disabled={loading}
            />
          )}
        </section>
      </div>
    </SuperAdminShell>
  );
}
