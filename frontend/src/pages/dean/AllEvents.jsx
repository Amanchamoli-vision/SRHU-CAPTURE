import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchCurrentUser, signOut } from "../../services/auth";
import { apiJson, isAbortError } from "../../services/api";
import DeanShell from "../../components/dean/DeanShell";
import Modal from "../../components/teacher/Modal";
import StatusChip from "../../components/teacher/StatusChip";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconCheck,
  IconCheckCircle,
  IconEye,
  IconInbox,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconX,
} from "../../components/teacher/icons";
import {
  DEAN_STATUS_FILTERS,
  EVENT_TYPES,
  canApproveEvent,
  canRejectEvent,
  countByStatusBucket,
  getApproveLabel,
  getRejectLabel,
  getRejectLabelShort,
  getStatusBucket,
  matchesEventSearch,
  matchesStatusFilter,
  matchesTypeFilter,
} from "../../utils/constants";

/**
 * Table columns, ordered by how much each one drives the Dean's decision.
 * Action is pinned to the right edge, so on a narrow screen it is Location —
 * the least decisive field, and the one still shown in full on the details
 * page — that slides under the pin rather than the status or the event name.
 */
const COLUMNS = [
  { label: "Event", className: "" },
  { label: "Status", className: "" },
  { label: "Type", className: "" },
  { label: "Date", className: "" },
  { label: "Location", className: "hidden min-[1340px]:table-cell" },
  { label: "Action", className: "sticky right-0 text-right" },
];

/**
 * The three decisions the Dean can take on a row. Shared by the desktop table
 * and the mobile card list so the two can never drift apart.
 */
function EventActions({ event, isProcessing, onApprove, onReject }) {
  return (
    <>
      <Link
        to={`/dean/events/${event.id}`}
        title="View full details"
        aria-label={`View full details for ${event.event_name}`}
        className="icon-btn icon-btn-sm"
      >
        <IconEye />
      </Link>

      {canRejectEvent(event) && (
        <button
          type="button"
          onClick={() => onReject(event)}
          disabled={isProcessing}
          title={getRejectLabel(event)}
          className="btn btn-danger btn-xs"
        >
          {isProcessing ? <span className="spin h-3.5 w-3.5" /> : <IconX />}
          {getRejectLabelShort(event)}
        </button>
      )}

      {canApproveEvent(event) && (
        <button
          type="button"
          onClick={() => onApprove(event)}
          disabled={isProcessing}
          title={getApproveLabel(event)}
          className="btn btn-ok btn-xs"
        >
          {isProcessing ? <span className="spin h-3.5 w-3.5" /> : <IconCheck />}
          {getApproveLabel(event)}
        </button>
      )}
    </>
  );
}

function AllEvents() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Selected date
  // Empty means all dates
  const [selectedDate, setSelectedDate] = useState("");

  // Client-side filters. These narrow the events already fetched from the
  // server; they never trigger a refetch.
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");

  // Signed-in Dean, used for the shell's account blocks.
  const [deanProfile, setDeanProfile] = useState(null);

  // The decision being confirmed: { event, kind: "approve" | "reject" }.
  // A themed dialog rather than window.confirm / window.prompt, so a rejection
  // reason is typed in the product instead of in an OS box.
  const [decision, setDecision] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  // ============================================================
  // ERRORS
  // A 401 means the session is gone (apiJson already cleared it): go to the
  // login page. Anything else, including a 409 when the event moved on
  // meanwhile, is shown with the backend's message.
  // ============================================================

  const handleApiError = (err, fallback, context) => {
    console.error(`${context}:`, err);
    if (err?.status === 401) {
      navigate("/login", { replace: true });
      return;
    }
    setError(err?.message || fallback);
  };

  // ============================================================
  // LOAD EVENTS
  //
  // Only the newest request may update the list: changing the date quickly
  // must not let a slow, older response overwrite the newer one.
  // ============================================================

  const loadControllerRef = useRef(null);

  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const loadEvents = async (date = selectedDate) => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;

    try {
      setLoading(true);
      setError("");

      const query = date ? `?event_date=${encodeURIComponent(date)}` : "";
      const data = await apiJson(`/dean/events${query}`, { signal: controller.signal });

      if (controller.signal.aborted) return;
      setEvents(data?.events || []);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      handleApiError(err, "Failed to load events", "Load events error");
      setEvents([]);
    } finally {
      if (loadControllerRef.current === controller) setLoading(false);
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

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
    loadEvents("");
    loadDeanProfile();
  }, []);

  // ============================================================
  // AUTO-DISMISS SUCCESS
  //
  // Feedback is shown as a floating toast so it never pushes the
  // table down and forces the Dean to scroll.
  // ============================================================

  useEffect(() => {
    if (!success) {
      return undefined;
    }

    const timer = setTimeout(() => setSuccess(""), 4500);

    return () => clearTimeout(timer);
  }, [success]);

  // ============================================================
  // DATE CHANGE
  // ============================================================

  const handleDateChange = (event) => {
    const date = event.target.value;

    setSelectedDate(date);

    // Immediately load events for selected date
    loadEvents(date);
  };

  // ============================================================
  // FORMAT DATE
  // ============================================================

  const formatEventDate = (value) => {
    if (!value) {
      return "—";
    }

    const dateObject = new Date(`${value}T00:00:00`);

    if (Number.isNaN(dateObject.getTime())) {
      return value;
    }

    return dateObject.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // ============================================================
  // LOGOUT
  // ============================================================

  const handleLogout = async () => {
    await signOut();

    navigate("/login");
  };

  // ============================================================
  // OPEN / CLOSE A DECISION
  // ============================================================

  const openDecision = (event, kind) => {
    setDecision({ event, kind });
    setRejectReason("");
    setReasonError("");
  };

  const closeDecision = () => {
    if (processingId) return; // never abandon a request mid-flight
    setDecision(null);
    setRejectReason("");
    setReasonError("");
  };

  /** Replace the row the API just returned a fresh copy of. */
  const applyUpdatedEvent = (updated) => {
    setEvents((previousEvents) =>
      previousEvents.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  // ============================================================
  // APPROVE EVENT
  // ============================================================

  const confirmApprove = async () => {
    const event = decision?.event;

    if (!event) {
      return;
    }

    try {
      setProcessingId(event.id);
      setError("");
      setSuccess("");

      const data = await apiJson(`/dean/events/${event.id}/approve`, { method: "PATCH" });

      applyUpdatedEvent(data.event);

      setSuccess(data.message || "Event approved successfully.");
      setDecision(null);
    } catch (err) {
      handleApiError(err, "Failed to approve event", "Approve event error");
      setDecision(null);
    } finally {
      setProcessingId(null);
    }
  };

  // ============================================================
  // REJECT EVENT
  // ============================================================

  const confirmReject = async () => {
    const event = decision?.event;

    if (!event) {
      return;
    }

    const reason = rejectReason.trim();

    if (!reason) {
      setReasonError("A reason is required — the teacher sees it verbatim.");
      return;
    }

    try {
      setProcessingId(event.id);
      setError("");
      setSuccess("");
      setReasonError("");

      // In the body, not the query string: long reasons would hit URL
      // limits and end up in access logs.
      const data = await apiJson(`/dean/events/${event.id}/reject`, {
        method: "PATCH",
        body: { rejection_reason: reason },
      });

      applyUpdatedEvent(data.event);

      setSuccess(data.message || "Event rejected successfully.");
      setDecision(null);
    } catch (err) {
      handleApiError(err, "Failed to reject event", "Reject event error");
      setDecision(null);
    } finally {
      setProcessingId(null);
    }
  };

  // ============================================================
  // EVENT COUNTS
  //
  // Always computed from the full fetch scope, never from the
  // client-filtered list, so the chip totals stay stable while filtering.
  // ============================================================

  const eventCounts = useMemo(() => countByStatusBucket(events), [events]);

  // ============================================================
  // CLIENT-SIDE FILTERING (search + status + program type)
  // ============================================================

  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          matchesEventSearch(event, searchQuery) &&
          matchesStatusFilter(event, statusFilter) &&
          matchesTypeFilter(event, typeFilter)
      ),
    [events, searchQuery, statusFilter, typeFilter]
  );

  const isFiltered =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    typeFilter !== "" ||
    selectedDate !== "";

  const handleClearAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("");
    setSelectedDate("");
    loadEvents("");
  };

  // The decision dialog's copy depends on what the current status makes of it:
  // approving a rejection clears the reason, rejecting an approval revokes it.
  const decisionEvent = decision?.event;
  const decisionBucket = getStatusBucket(decisionEvent?.status);
  const isRevoking = decision?.kind === "reject" && decisionBucket === "approved";
  const isReapproving = decision?.kind === "approve" && decisionBucket === "rejected";
  const decisionBusy = Boolean(processingId);

  // ============================================================
  // MAIN UI
  //
  // The screen is height-locked: only the table body scrolls, so the
  // toolbar, the status chips and the column headers always stay put.
  // ============================================================

  return (
    <DeanShell
      active="events"
      profile={deanProfile}
      onLogout={handleLogout}
      railBadge={eventCounts.all}
      railNote="Approve or reject from the row, or open an event for the full proposal, its media and its documents."
      locked
    >
      {/* Toasts sit bottom-right so feedback never shifts the layout or covers
          the filter controls. */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-85 max-w-[calc(100vw-2.5rem)] flex-col gap-3">
        {error && (
          <div className="toast toast-err pointer-events-auto" role="alert">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="toast toast-ok pointer-events-auto" role="status">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
              <IconCheck className="h-3 w-3" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{success}</p>
            <button
              type="button"
              onClick={() => setSuccess("")}
              aria-label="Dismiss message"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* `min-w-0` lets the main column shrink below its content width so the
          cards stay inside the viewport and the table — not the page — owns
          any horizontal overflow. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6 lg:py-6">

        {/* ================================================
            COMMAND BAR
            Title, search, program type, date and the status
            chips — every control on one screen, no scrolling.
        ================================================ */}
        <div className="glass shrink-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-5">

            <div className="mr-auto min-w-0">
              <p className="eyebrow">Dean Panel</p>
              <h1 className="h3 mt-0.5 truncate text-ink">All Events</h1>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-60 xl:w-72">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                <IconSearch className="h-4 w-4" />
              </span>

              <input
                id="eventSearch"
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

            {/* Program type + date share a line on narrow screens */}
            <div className="flex w-full gap-2.5 sm:w-auto">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by program type"
                className="input min-w-0 flex-1 sm:w-40 sm:flex-none"
              >
                <option value="">All programs</option>
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <input
                id="eventDate"
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                aria-label="Filter by event date"
                className="input min-w-0 flex-1 sm:w-42 sm:flex-none"
              />
            </div>

            <button
              type="button"
              onClick={() => loadEvents(selectedDate)}
              disabled={loading}
              className="btn btn-ghost btn-sm shrink-0"
            >
              {loading ? <span className="spin h-4 w-4" /> : <IconRefresh />}
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          {/* Status tabs + result count */}
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
                <span className="tab-count">{eventCounts[tab.key] ?? 0}</span>
              </button>
            ))}

            <div className="ml-auto flex items-center gap-3">
              <p className="num text-xs font-medium text-muted">
                Showing {visibleEvents.length} of {eventCounts.all}
              </p>

              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="btn btn-ghost btn-xs"
                >
                  <IconRotateCcw />
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================================================
            EVENTS TABLE
            Fills the remaining height; its body is the only
            scrolling region on the page.
        ================================================ */}
        <div className="glass relative flex min-h-0 flex-1 flex-col overflow-hidden">

          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
              <div className="flex items-center gap-2.5 text-sm font-medium text-muted">
                <span className="spin h-4 w-4 text-accent" />
                Loading events…
              </div>
            </div>
          )}

          {!loading && visibleEvents.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
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
                  onClick={handleClearAllFilters}
                  className="btn btn-brand btn-sm mt-5"
                >
                  <IconRotateCcw />
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">

              {/* ------------------------------------------------
                  MOBILE: a table cannot show a decision's context
                  in 390px, so each event becomes a card instead.
              ------------------------------------------------ */}
              <ul className="divide-y divide-line/8 md:hidden">
                {visibleEvents.map((event) => {
                  const rejected = getStatusBucket(event.status) === "rejected";

                  return (
                    <li
                      key={event.id}
                      style={rejected ? { "--track": trackOf("rejected") } : undefined}
                      className={`px-4 py-3.5 ${
                        rejected
                          ? "bg-[color-mix(in_srgb,var(--track)_6%,transparent)]"
                          : ""
                      }`}
                    >
                      <Link
                        to={`/dean/events/${event.id}`}
                        className="block w-full truncate text-left font-display text-sm font-semibold text-ink"
                        title={event.event_name}
                      >
                        {event.event_name || "Untitled Event"}
                      </Link>

                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
                        <StatusChip status={event.status} />
                        {/* Joined rather than separate spans so a wrap never
                            strands a lone separator at the end of a line. */}
                        <span>
                          {[
                            event.event_type,
                            formatEventDate(event.event_date),
                            event.location,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>

                      {rejected && event.rejection_reason && (
                        <p className="mt-1.5 text-xs" style={{ color: trackOf("rejected") }}>
                          <span className="font-semibold">Reason:</span>{" "}
                          {event.rejection_reason}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <EventActions
                          event={event}
                          isProcessing={processingId === event.id}
                          onApprove={(e) => openDecision(e, "approve")}
                          onReject={(e) => openDecision(e, "reject")}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <table className="hidden w-full text-left md:table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.label}
                        className={`whitespace-nowrap border-b hairline bg-raised/45 px-4 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-muted backdrop-blur ${column.className}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-line/8">
                  {visibleEvents.map((event) => {
                    const isProcessing = processingId === event.id;
                    const rejected = getStatusBucket(event.status) === "rejected";

                    return (
                      <tr
                        key={event.id}
                        style={rejected ? { "--track": trackOf("rejected") } : undefined}
                        className={`group transition hover:bg-raised/35 ${
                          rejected
                            ? "bg-[color-mix(in_srgb,var(--track)_5%,transparent)]"
                            : ""
                        }`}
                      >
                        {/* Event */}
                        <td className="max-w-56 px-4 py-3 xl:max-w-72">
                          <Link
                            to={`/dean/events/${event.id}`}
                            title={event.event_name}
                            className="block max-w-full truncate text-left font-display text-sm font-semibold text-ink transition hover:text-accent"
                          >
                            {event.event_name || "Untitled Event"}
                          </Link>

                          {rejected && event.rejection_reason && (
                            <p
                              title={event.rejection_reason}
                              className="max-w-full truncate text-xs"
                              style={{ color: trackOf("rejected") }}
                            >
                              <span className="font-semibold">Reason:</span>{" "}
                              {event.rejection_reason}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusChip status={event.status} />
                        </td>

                        {/* Type */}
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">
                          {event.event_type || "—"}
                        </td>

                        {/* Date */}
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">
                          {formatEventDate(event.event_date)}
                        </td>

                        {/* Location */}
                        <td className="hidden max-w-48 px-4 py-3 text-sm text-muted min-[1340px]:table-cell">
                          <span className="block truncate" title={event.location}>
                            {event.location || "—"}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="sticky right-0 whitespace-nowrap bg-surface px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] transition group-hover:bg-raised/60">
                          <div className="flex items-center justify-end gap-1.5">
                            <EventActions
                              event={event}
                              isProcessing={isProcessing}
                              onApprove={(e) => openDecision(e, "approve")}
                              onReject={(e) => openDecision(e, "reject")}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================
          THE DECISION
          One dialog for both halves of the decision: the reject side adds a
          reason field, and both sides spell out what changes for the teacher.
      ================================================================== */}
      <Modal
        open={Boolean(decision)}
        onClose={closeDecision}
        eyebrow="Confirm"
        title={
          decision?.kind === "approve"
            ? isReapproving
              ? "Re-approve event"
              : "Approve event"
            : isRevoking
            ? "Revoke approval & reject"
            : "Reject event"
        }
        subtitle={
          decision?.kind === "approve"
            ? "The teacher is notified of the decision."
            : "The teacher sees the reason you give."
        }
        footer={
          <>
            <button
              type="button"
              onClick={closeDecision}
              disabled={decisionBusy}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>

            {decision?.kind === "approve" ? (
              <button
                type="button"
                onClick={confirmApprove}
                disabled={decisionBusy}
                className="btn btn-ok btn-sm"
              >
                {decisionBusy ? <span className="spin h-3.5 w-3.5" /> : <IconCheck />}
                {decisionBusy
                  ? "Approving…"
                  : isReapproving
                  ? "Re-approve"
                  : "Approve"}
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmReject}
                disabled={decisionBusy}
                className="btn btn-danger btn-sm"
              >
                {decisionBusy ? <span className="spin h-3.5 w-3.5" /> : <IconX />}
                {decisionBusy ? "Rejecting…" : isRevoking ? "Revoke & reject" : "Reject"}
              </button>
            )}
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span
            className="icon-tile icon-tile-track"
            style={{
              "--track":
                decision?.kind === "approve" ? trackOf("approved") : trackOf("rejected"),
            }}
          >
            {decision?.kind === "approve" ? <IconCheckCircle /> : <IconAlertTriangle />}
          </span>

          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-ink">
              {decisionEvent?.event_name || "Untitled Event"}
            </p>
            <p className="prose-muted mt-1 text-xs">
              {[
                decisionEvent?.event_type,
                formatEventDate(decisionEvent?.event_date),
                decisionEvent?.location,
              ]
                .filter(Boolean)
                .join(" · ") || "No details recorded"}
            </p>
          </div>
        </div>

        {/* What the decision actually changes, when it is not the plain case */}
        {(isRevoking || isReapproving) && (
          <div
            className="mt-4 rounded-xl border px-4 py-3"
            data-tint=""
            style={{ "--track": trackOf(isRevoking ? "rejected" : "approved") }}
          >
            <p className="text-sm text-ink">
              {isRevoking
                ? "This event is approved. Rejecting it revokes the approval, hides its generated report, and notifies the teacher."
                : "This event is rejected. Re-approving it clears the existing rejection reason and notifies the teacher."}
            </p>
          </div>
        )}

        {decision?.kind === "reject" && (
          <div className="field mt-5">
            <label htmlFor="rejectReason">
              Reason for rejection
              <span className="req">*</span>
            </label>

            <textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (reasonError) setReasonError("");
              }}
              rows={4}
              autoFocus
              placeholder="What needs to change before this can be approved?"
              aria-invalid={reasonError ? "true" : undefined}
              aria-describedby={reasonError ? "rejectReasonError" : undefined}
              className="input"
            />

            {reasonError && (
              <p id="rejectReasonError" className="field-error">
                {reasonError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </DeanShell>
  );
}

export default AllEvents;
