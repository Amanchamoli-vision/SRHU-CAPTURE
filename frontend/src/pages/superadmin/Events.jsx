import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, apiJson } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import StatusChip from "../../components/teacher/StatusChip";
import Pagination from "../../components/common/Pagination";
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [teacherNames, setTeacherNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rawPer = Number(searchParams.get("per")) || 25;
  const per = [25, 50, 100].includes(rawPer) ? rawPer : 25;
  const skip = (page - 1) * per;

  const urlQ = searchParams.get("q") || "";
  const [searchDraft, setSearchDraft] = useState(urlQ);

  // Sync draft when URL q changes (e.g. back button, clear filters)
  useEffect(() => {
    setSearchDraft(urlQ);
  }, [urlQ]);

  // Debounce searchDraft -> URL query string, resetting to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchDraft.trim();
      if (trimmed !== urlQ) {
        const next = new URLSearchParams(searchParams);
        if (trimmed) next.set("q", trimmed);
        else next.delete("q");
        next.delete("page");
        setSearchParams(next, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft, urlQ, searchParams, setSearchParams]);

  const statusFilter = STATUS_TABS.some((t) => t.key === searchParams.get("status"))
    ? searchParams.get("status")
    : "all";

  const setStatusFilter = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === "all") next.delete("status");
    else next.set("status", key);
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const setPage = (nextPage) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const setPerPage = (nextPer) => {
    const next = new URLSearchParams(searchParams);
    if (nextPer !== 25) next.set("per", String(nextPer));
    else next.delete("per");
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(per),
      });
      if (statusFilter !== "all") {
        params.set("status_bucket", statusFilter);
      }
      if (urlQ) {
        params.set("q", urlQ);
      }

      const [eventData, userData] = await Promise.all([
        apiJson(`/dean/events?${params}`),
        Object.keys(teacherNames).length === 0 ? apiJson("/superadmin/users") : Promise.resolve(null),
      ]);

      setEvents(eventData?.events || []);
      setTotal(eventData?.total || 0);
      if (eventData?.counts) {
        setCounts(eventData.counts);
      }
      if (userData?.users) {
        setTeacherNames(
          Object.fromEntries(userData.users.map((u) => [u.id, u.name || u.email]))
        );
      }
    } catch (err) {
      if (err?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Load events error:", err);
      setError(err.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [skip, per, statusFilter, urlQ, teacherNames, navigate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      setError("");
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (urlQ) params.set("q", urlQ);

      const res = await apiFetch(`/superadmin/events/export?${params}`);
      if (!res.ok) throw new Error("Failed to export events");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `events_naac_nirf_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export CSV error:", err);
      setError("Failed to export accreditation CSV.");
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const visibleEvents = events;

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
            <div className="flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={loadEvents} disabled={loading} className="btn btn-ghost">
                {loading ? <span className="spin h-4 w-4" /> : <IconRefresh />}
                Refresh
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exporting}
                className="btn btn-primary"
                title="Download full CSV dump for NAAC/NIRF accreditation"
              >
                {exporting ? <span className="spin h-4 w-4" /> : null}
                Export (NAAC / NIRF)
              </button>
            </div>
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
              placeholder="Search event, venue or teacher"
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
              <p className="h3 mt-4 text-ink">
                {total === 0 && !urlQ && statusFilter === "all" ? "No events yet" : "No matches"}
              </p>
              <p className="prose-muted mt-1 text-sm">
                {total === 0 && !urlQ && statusFilter === "all"
                  ? "Nothing has been submitted for review."
                  : "Try a different search or clear the status filter."}
              </p>
              {(urlQ || statusFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    const next = new URLSearchParams(searchParams);
                    next.delete("q");
                    next.delete("status");
                    next.delete("page");
                    setSearchParams(next, { replace: true });
                  }}
                  className="btn btn-ghost btn-sm mt-5"
                >
                  Clear filters
                </button>
              )}
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
