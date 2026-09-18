import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchCurrentUser, signOut } from "../../services/auth";
import { apiJson, isAbortError } from "../../services/api";
import DeanShell from "../../components/dean/DeanShell";
import { programShare } from "../../components/dean/programShades";
import PageHero from "../../components/teacher/PageHero";
import StatusChip from "../../components/teacher/StatusChip";
import StatCard from "../../components/common/StatCard";
import { trackOf } from "../../components/teacher/status";
import useThemeTokens from "../../components/theme/useThemeTokens";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconChartBar,
  IconCheckCircle,
  IconChartPie,
  IconClock,
  IconEye,
  IconFilter,
  IconInbox,
  IconLayers,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconX,
  IconXCircle,
} from "../../components/teacher/icons";
import { decodeEventMetadata } from "../../utils/draftStorage";
import {
  DEAN_STATUS_FILTERS,
  EVENT_TYPES,
  countByStatusBucket,
  matchesEventSearch,
  matchesStatusFilter,
} from "../../utils/constants";

/** The whole submission set — not a status, so it takes its own hue. */
const TOTAL_TRACK = "#0EA5E9"; // sky

export default function DeanDashboard() {
  const navigate = useNavigate();
  const tokens = useThemeTokens();

  // "overview" is the numbers and the program mix; "submissions" is the same
  // events as a filterable list. Both live on this screen, as they did before
  // the two views shared a sidebar toggle.
  const [activeView, setActiveView] = useState("overview");

  // ============================================
  // STATES
  // ============================================

  const [stats, setStats] = useState({
    total_events: 0,
    pending_events: 0,
    approved_events: 0,
    rejected_events: 0,
  });

  const [events, setEvents] = useState([]);

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedEventType, setSelectedEventType] = useState("");

  // Signed-in Dean, used for the header and rail account blocks.
  const [deanProfile, setDeanProfile] = useState(null);

  // Client-side filters. Intentionally kept out of filtersRef: they narrow
  // the events already fetched and must never trigger a server refetch.
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [error, setError] = useState("");

  // The filters in force, read by the refresh a new notification triggers.
  const filtersRef = useRef({ selectedDate: "", selectedEventType: "" });

  useEffect(() => {
    filtersRef.current = { selectedDate, selectedEventType };
  }, [selectedDate, selectedEventType]);

  // ============================================
  // LOGOUT
  // ============================================

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  // ============================================
  // ERRORS
  // apiJson clears the session on a 401 (the token is refreshed ahead of
  // expiry, so a 401 means it was revoked or expired): go to the login page.
  // ============================================

  const isSignedOut = (err) => {
    if (err?.status !== 401) return false;
    navigate("/login", { replace: true });
    return true;
  };

  // ============================================
  // LOAD STATS
  // ============================================

  const loadStats = async () => {
    try {
      setLoadingStats(true);

      const data = await apiJson("/dean/dashboard/stats");

      setStats({
        total_events: data?.total_events || 0,
        pending_events: data?.pending_events || 0,
        approved_events: data?.approved_events || 0,
        rejected_events: data?.rejected_events || 0,
      });
    } catch (err) {
      console.error("Stats error:", err);
      if (isSignedOut(err)) return;
      setError(err?.message || "Unable to load dashboard statistics.");
    } finally {
      setLoadingStats(false);
    }
  };

  // ============================================
  // LOAD EVENTS
  //
  // Filters can change faster than the server answers. Each load aborts the
  // one before it, so a slow older response can never overwrite the list for
  // the filters now on screen.
  // ============================================

  const eventsControllerRef = useRef(null);

  useEffect(() => () => eventsControllerRef.current?.abort(), []);

  const loadEvents = async (date = "", eventType = "") => {
    eventsControllerRef.current?.abort();
    const controller = new AbortController();
    eventsControllerRef.current = controller;

    try {
      setLoadingEvents(true);
      setError("");

      const params = new URLSearchParams();

      if (date) {
        params.append("event_date", date);
      }

      if (eventType) {
        params.append("event_type", eventType);
      }

      const queryString = params.toString();

      const data = await apiJson(
        queryString ? `/dean/events?${queryString}` : "/dean/events",
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;
      setEvents(data?.events || []);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      console.error("Events error:", err);
      if (isSignedOut(err)) return;

      setEvents([]);

      setError(err?.message || "Unable to load events.");
    } finally {
      if (eventsControllerRef.current === controller) setLoadingEvents(false);
    }
  };

  // ============================================
  // INITIAL LOAD
  // ============================================

  const loadDeanProfile = async () => {
    try {
      const data = await fetchCurrentUser();

      if (data) {
        setDeanProfile(data);
      }
    } catch (err) {
      // Non-blocking: the shell falls back to a neutral initial.
      console.error("Load dean profile error:", err);
    }
  };

  useEffect(() => {
    loadStats();
    loadEvents("", "");
    loadDeanProfile();
  }, []);

  // ============================================
  // WHEN A NOTIFICATION ARRIVES
  //
  // The bell in the shell polls the Dean's own notification feed — which the
  // server fills on every submission *and* resubmission — and calls this when
  // something new lands, so the counts and the list stay current.
  // ============================================

  const refreshAfterNotification = () => {
    loadStats();
    loadEvents(
      filtersRef.current.selectedDate,
      filtersRef.current.selectedEventType
    );
  };

  // ============================================
  // GET UNIQUE EVENT TYPES
  // ============================================

  // Sourced from the fixed list the API accepts, not from the currently
  // loaded rows -- otherwise selecting a type collapses the dropdown to that
  // one option and the Dean cannot switch without clearing filters.
  const eventTypes = EVENT_TYPES;

  // Status chip counts and the client-filtered list. Counts always come from
  // the full fetch scope so they stay stable while filtering.
  const statusCounts = useMemo(() => countByStatusBucket(events), [events]);

  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          matchesEventSearch(event, searchQuery) &&
          matchesStatusFilter(event, statusFilter)
      ),
    [events, searchQuery, statusFilter]
  );

  const isFiltered =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    selectedDate !== "" ||
    selectedEventType !== "";

  // ============================================
  // PROGRAM MIX
  // ============================================

  // Largest share first, each row carrying its own shade of the accent. The
  // shades are rebuilt when the theme flips, because the chart is SVG and
  // cannot inherit the token itself.
  const programMix = useMemo(
    () => programShare(events, tokens.accent),
    [events, tokens.accent]
  );

  const statCards = [
    {
      key: "total",
      label: "Total Events",
      value: stats.total_events,
      hint: "Everything submitted across campus",
      track: TOTAL_TRACK,
      Icon: IconLayers,
    },
    {
      key: "pending",
      label: "Pending",
      value: stats.pending_events,
      hint: "Awaiting your decision",
      track: trackOf("pending"),
      Icon: IconClock,
    },
    {
      key: "approved",
      label: "Approved",
      value: stats.approved_events,
      hint: "Cleared to go ahead",
      track: trackOf("approved"),
      Icon: IconCheckCircle,
    },
    {
      key: "rejected",
      label: "Rejected",
      value: stats.rejected_events,
      hint: "Sent back to the teacher",
      track: trackOf("rejected"),
      Icon: IconXCircle,
    },
  ];

  // ============================================
  // FILTER A PROGRAM TYPE
  // ============================================

  const handleTypeSelect = (name) => {
    if (!name) return;

    setSelectedEventType(name);
    setActiveView("submissions");

    loadEvents(selectedDate, name);
  };

  // ============================================
  // DATE FILTER
  // ============================================

  const handleDateChange = (event) => {
    const date = event.target.value;

    setSelectedDate(date);

    loadEvents(date, selectedEventType);
  };

  // ============================================
  // EVENT TYPE FILTER
  // ============================================

  const handleEventTypeChange = (event) => {
    const eventType = event.target.value;

    setSelectedEventType(eventType);

    loadEvents(selectedDate, eventType);
  };

  // ============================================
  // CLEAR FILTERS
  // ============================================

  const clearFilters = () => {
    setSelectedDate("");
    setSelectedEventType("");
    setSearchQuery("");
    setStatusFilter("all");

    loadEvents("", "");
  };

  // ============================================
  // REFRESH
  // ============================================

  const refreshDashboard = async () => {
    setError("");

    await Promise.all([
      loadStats(),
      loadEvents(selectedDate, selectedEventType),
    ]);
  };

  const busy = loadingStats || loadingEvents;

  // ============================================
  // RENDER
  // ============================================

  return (
    <DeanShell
      active="dashboard"
      profile={deanProfile}
      onLogout={handleLogout}
      railBadge={events.length}
      railNote="Teachers propose events, you approve them. Pending submissions are the queue that needs you."
      onNotification={refreshAfterNotification}
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        <PageHero
          eyebrow="Dean Panel"
          title="Campus Event"
          accent="Overview"
          subtitle={`Welcome back, ${
            deanProfile?.name || "Dean"
          }. Review, filter and track every event submitted across campus.`}
          actions={
            <>
              <button
                type="button"
                onClick={refreshDashboard}
                disabled={busy}
                className="btn btn-ghost"
              >
                {busy ? <span className="spin h-4 w-4" /> : <IconRefresh />}
                Refresh
              </button>

              <Link to="/dean/events" className="btn btn-primary">
                <IconCalendar />
                Review queue
              </Link>
            </>
          }
        />

        {error && (
          <div
            className="mt-6 flex items-start gap-3 rounded-2xl border p-4"
            data-tint=""
            style={{ "--track": trackOf("rejected") }}
            role="alert"
          >
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Something didn’t load</p>
              <p className="prose-muted mt-0.5 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={refreshDashboard}
              className="btn btn-ghost btn-xs shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ------------------------------------------------------- the views */}
        <div
          role="tablist"
          aria-label="Dashboard views"
          className="mt-7 flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "overview"}
            onClick={() => setActiveView("overview")}
            className="tab"
          >
            <IconChartPie className="h-4 w-4" />
            Overview
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeView === "submissions"}
            onClick={() => setActiveView("submissions")}
            className="tab"
          >
            <IconInbox className="h-4 w-4" />
            Submissions
            <span className="tab-count">{statusCounts.all}</span>
          </button>
        </div>

        {/* ==================================================== OVERVIEW === */}
        {activeView === "overview" && (
          <>
            {/* The shared KPI card, identical on the Teacher and Super
                Admin dashboards; the 1.5rem gaps match theirs too. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {statCards.map((card, i) => (
                <StatCard
                  key={card.key}
                  index={i}
                  label={card.label}
                  value={loadingStats ? "—" : card.value}
                  Icon={card.Icon}
                  track={card.track}
                  hint={card.hint}
                />
              ))}
            </div>


            {/* ---------------------------------------------- program mix */}
            <section className="glass reveal mt-6 overflow-hidden" style={{ "--i": 5 }}>
              <div className="flex flex-col gap-3 border-b hairline px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <span className="icon-tile">
                    <IconChartPie />
                  </span>
                  <div>
                    <p className="eyebrow">Distribution</p>
                    <h2 className="h3 text-ink">Programs by type</h2>
                    <p className="prose-muted mt-0.5 text-xs">
                      Pick a program to see only its events.
                    </p>
                  </div>
                </div>

                {selectedEventType && (
                  <div className="flex items-center gap-2.5">
                    <span className="chip chip-solid">{selectedEventType}</span>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="btn btn-ghost btn-xs"
                    >
                      <IconRotateCcw />
                      Show all
                    </button>
                  </div>
                )}
              </div>

              <div className="p-6">
                {loadingEvents ? (
                  <div className="flex h-65 flex-col items-center justify-center gap-3">
                    <span className="spin h-10 w-10 text-accent" />
                    <p className="prose-muted text-sm">Loading programs…</p>
                  </div>
                ) : programMix.length === 0 ? (
                  <div className="flex h-65 flex-col items-center justify-center text-center">
                    <span className="icon-tile mb-4 h-14 w-14 rounded-2xl">
                      <IconChartBar className="h-6 w-6" />
                    </span>
                    <p className="h3 text-ink">No program data yet</p>
                    <p className="prose-muted mt-1 text-sm">
                      Once teachers submit events, their mix appears here.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-8 lg:flex-row">

                    {/* The ring. One hue, shaded by share — identity is
                        carried by the labelled rows beside it, never by the
                        colour alone. */}
                    <div
                      className="h-60 w-full shrink-0 lg:w-75"
                      role="img"
                      aria-label={`Programs by type: ${programMix
                        .map((entry) => `${entry.name} ${entry.value}`)
                        .join(", ")}`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={programMix}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={104}
                            innerRadius={68}
                            paddingAngle={2}
                            onClick={(slice) => handleTypeSelect(slice?.name)}
                            cursor="pointer"
                            isAnimationActive={false}
                          >
                            {programMix.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={entry.shade}
                                stroke={`rgb(${tokens.surface})`}
                                strokeWidth={2}
                                opacity={
                                  selectedEventType &&
                                  selectedEventType.toLowerCase() !==
                                    entry.name.toLowerCase()
                                    ? 0.3
                                    : 1
                                }
                              />
                            ))}
                          </Pie>

                          {/* The total, reading through the hole. */}
                          <text
                            x="50%"
                            y="50%"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={`rgb(${tokens.ink})`}
                            style={{ fontFamily: "Sora, system-ui, sans-serif" }}
                          >
                            <tspan x="50%" dy="-6" fontSize="28" fontWeight="700">
                              {events.length}
                            </tspan>
                            <tspan
                              x="50%"
                              dy="26"
                              fontSize="11"
                              fontWeight="600"
                              letterSpacing="1.6"
                              fill={`rgb(${tokens.muted})`}
                            >
                              EVENTS
                            </tspan>
                          </text>

                          <Tooltip
                            cursor={false}
                            formatter={(value, name) => [
                              `${value} event${value !== 1 ? "s" : ""}`,
                              name,
                            ]}
                            contentStyle={{
                              background: `rgb(${tokens.surface})`,
                              border: "1px solid rgb(15 23 42 / .1)",
                              borderRadius: "0.75rem",
                              boxShadow: "0 18px 50px -20px rgb(15 23 42 / .28)",
                              fontSize: "0.8rem",
                              padding: "0.5rem 0.7rem",
                            }}
                            itemStyle={{ color: `rgb(${tokens.ink})` }}
                            labelStyle={{ color: `rgb(${tokens.muted})` }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* The rows: the same data, directly labelled, and each
                        one filters exactly like a slice. */}
                    <ul className="w-full min-w-0 flex-1 space-y-1">
                      {programMix.map((entry) => {
                        const total = events.length || 1;
                        const pct = Math.round((entry.value / total) * 100);
                        const active =
                          selectedEventType &&
                          selectedEventType.toLowerCase() === entry.name.toLowerCase();

                        return (
                          <li key={entry.name}>
                            <button
                              type="button"
                              onClick={() => handleTypeSelect(entry.name)}
                              aria-pressed={Boolean(active)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                                active ? "bg-accent/8" : "hover:bg-raised/45"
                              }`}
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: entry.shade }}
                              />

                              <span className="w-24 shrink-0 truncate text-sm font-medium text-ink">
                                {entry.name}
                              </span>

                              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-raised">
                                <span
                                  className="block h-full rounded-full transition-[width] duration-300"
                                  style={{ width: `${pct}%`, background: entry.shade }}
                                />
                              </span>

                              <span className="num w-20 shrink-0 text-right text-sm text-muted">
                                <span className="font-semibold text-ink">{entry.value}</span>{" "}
                                ({pct}%)
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ================================================= SUBMISSIONS === */}
        {activeView === "submissions" && (
          <>
            {/* ------------------------------------------------------ filters
                One toolbar line for the inputs, one for the status chips. The
                labels live on the controls themselves (placeholder, first
                option, aria-label), so nothing is lost to a screen reader. */}
            <div className="glass mt-4 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-5">

                <div className="mr-auto flex shrink-0 items-center gap-2.5">
                  <span className="icon-tile h-9 w-9 rounded-xl">
                    <IconFilter className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="eyebrow">Narrow</p>
                    <h2 className="mt-0.5 font-display text-sm font-semibold text-ink">
                      Filters
                    </h2>
                  </div>
                </div>

                {/* Search + status narrow the loaded events; no refetch. */}
                <div className="relative w-full sm:w-60 xl:w-72">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                    <IconSearch className="h-4 w-4" />
                  </span>

                  <input
                    id="deanEventSearch"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, venue, or type…"
                    aria-label="Search events"
                    className="input pl-10 pr-9"
                  />

                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted transition hover:text-ink"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  aria-label="Filter by date"
                  title="Filter by date"
                  className="input w-full sm:w-auto"
                />

                <select
                  value={selectedEventType}
                  onChange={handleEventTypeChange}
                  aria-label="Filter by program type"
                  title="Filter by program type"
                  className="input w-full sm:w-auto"
                >
                  <option value="">All programs</option>
                  {eventTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                {/* Only once there is something to clear — an always-on
                    button reads as a control rather than an escape hatch. */}
                {isFiltered && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="btn btn-ghost btn-sm shrink-0"
                  >
                    <IconRotateCcw />
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t hairline bg-raised/35 px-4 py-2.5 sm:px-5">
                {DEAN_STATUS_FILTERS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className="tab"
                  >
                    {tab.label}
                    <span className="tab-count">{statusCounts[tab.key] ?? 0}</span>
                  </button>
                ))}

                <p className="num ml-auto text-xs font-medium text-muted">
                  Showing {visibleEvents.length} of {statusCounts.all}
                </p>
              </div>
            </div>

            {/* -------------------------------------------------------- list */}
            <div className="glass mt-4 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-5 py-4 sm:px-6">
                <h2 className="h3 text-base text-ink">
                  {selectedEventType ? `${selectedEventType} programs` : "All programs"}
                </h2>

                <Link to="/dean/events" className="btn btn-ghost btn-xs">
                  Open review queue
                  <IconArrowRight />
                </Link>
              </div>

              {loadingEvents ? (
                <div className="flex items-center justify-center gap-2.5 p-10 text-sm font-medium text-muted">
                  <span className="spin h-4 w-4 text-accent" />
                  Loading events…
                </div>
              ) : visibleEvents.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <span className="icon-tile mb-4 h-14 w-14 rounded-2xl">
                    <IconInbox className="h-6 w-6" />
                  </span>

                  <p className="h3 text-ink">No events found</p>

                  <p className="prose-muted mt-1 text-sm">
                    {isFiltered
                      ? "No events match the current filters."
                      : "No events have been submitted yet."}
                  </p>

                  {isFiltered && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="btn btn-brand btn-sm mt-5"
                    >
                      <IconRotateCcw />
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        {["Program", "Status", "Type", "Date", "Location", "Action"].map(
                          (label) => (
                            <th
                              key={label}
                              className={`whitespace-nowrap border-b hairline bg-raised/45 px-5 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-muted ${
                                label === "Action" ? "text-right" : ""
                              }`}
                            >
                              {label}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-line/8">
                      {visibleEvents.map((event) => (
                        <tr key={event.id} className="transition hover:bg-raised/35">
                          <td className="max-w-72 px-5 py-3.5">
                            <p className="truncate font-display text-sm font-semibold text-ink">
                              {event.event_name || "Untitled Program"}
                            </p>
                            {event.description && (
                              <p className="mt-0.5 truncate text-xs text-muted">
                                {decodeEventMetadata(event.description).description}
                              </p>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-3.5">
                            <StatusChip status={event.status} />
                          </td>

                          <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                            {event.event_type || "—"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                            {event.event_date || "—"}
                          </td>

                          <td className="max-w-48 px-5 py-3.5 text-sm text-muted">
                            <span className="block truncate" title={event.location}>
                              {event.location || "—"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-3.5 text-right">
                            <Link
                              to={`/dean/events/${event.id}`}
                              className="btn btn-ghost btn-xs"
                            >
                              <IconEye />
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DeanShell>
  );
}
