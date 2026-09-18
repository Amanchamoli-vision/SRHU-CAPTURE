import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchCurrentUser, signOut } from "../../services/auth";
import { apiJson, isAbortError } from "../../services/api";
import DeanShell from "../../components/dean/DeanShell";
import Modal from "../../components/teacher/Modal";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArchive,
  IconCheck,
  IconCheckCircle,
  IconEye,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconX,
} from "../../components/teacher/icons";
import {
  DEAN_STATUS_FILTERS,
  canApprove,
  canReject,
  canRevoke,
  getApproveLabel,
  getStatusBucket,
} from "../../utils/constants";
import useEventTypes from "../../hooks/useEventTypes";
import useTableQuery from "../../hooks/useTableQuery";
import Pagination from "../../components/common/Pagination";
import EventsTable from "../../components/dean/EventsTable";

/**
 * Table columns, ordered by how much each one drives the Dean's decision.
 * Action is pinned to the right edge, so on a narrow screen it is Location —
 * the least decisive field, and the one still shown in full on the details
 * page — that slides under the pin rather than the status or the event name.
 */
/**
 * The three decisions the Dean can take on a row. Shared by the desktop table
 * and the mobile card list so the two can never drift apart.
 */
function EventActions({ event, isProcessing, onApprove, onReject, onRevoke, onRemove }) {
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

      {/* Reject and Revoke are separate actions over separate statuses, so
          at most one of them ever applies to a given row. */}
      {canReject(event) && (
        <button
          type="button"
          onClick={() => onReject(event)}
          disabled={isProcessing}
          title="Reject this event"
          className="btn btn-danger btn-xs"
        >
          {isProcessing ? <span className="spin h-3.5 w-3.5" /> : <IconX />}
          Reject
        </button>
      )}

      {canRevoke(event) && (
        <button
          type="button"
          onClick={() => onRevoke(event)}
          disabled={isProcessing}
          title="Withdraw this event's approval"
          className="btn btn-danger btn-xs"
        >
          {isProcessing ? <span className="spin h-3.5 w-3.5" /> : <IconX />}
          Revoke
        </button>
      )}

      {/* Remove: archive (reversible) or delete for good. Both live behind
          one control so the destructive option is never a stray click away
          from Approve. */}
      <button
        type="button"
        onClick={() => onRemove(event)}
        disabled={isProcessing}
        title="Archive or delete this event"
        aria-label={`Archive or delete ${event.event_name}`}
        className="icon-btn icon-btn-sm text-err"
      >
        <IconArchive />
      </button>

      {canApprove(event) && (
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

  // Archiving / deleting, kept separate from `decision`: that state already
  // branches four ways, and mixing an irreversible delete into it is how a
  // mis-click ends up destroying an event's media.
  // { event, mode: "archive" | "delete", confirmText }
  const [removal, setRemoval] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters and paging live in the URL (see useTableQuery), so a filtered
  // page can be linked and reloaded, and there is one place a filter can be
  // out of step with the rows it produced. Every filter change resets to
  // page 1 -- narrowing a filter while on page 7 would otherwise show an
  // empty table and read as a bug.
  const { query, setFilter, setPage, setPerPage, reset } = useTableQuery();
  // Categories come from the server now, so a type a teacher added is
  // filterable here -- which the old hardcoded list could not do.
  const { types: eventTypes } = useEventTypes();
  const { page, per, q: searchQuery, status: statusFilter, type: typeFilter,
          date: selectedDate } = query;

  // The search box is uncontrolled by the URL while typing: writing every
  // keystroke to history would flood it and refetch per character.
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  // Totals for the status tabs and the footer, straight from the server --
  // they must count the whole result set, not the page on screen.
  const [total, setTotal] = useState(0);
  const [eventCounts, setEventCounts] = useState({ all: 0 });

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
      if (query.date) params.set("event_date", query.date);
      if (query.type) params.set("event_type", query.type);
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
      setEventCounts(data?.counts || { all: data?.total || 0 });
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      handleApiError(err, "Failed to load events", "Load events error");
      setEvents([]);
      setTotal(0);
    } finally {
      if (loadControllerRef.current === controller) setLoading(false);
    }
    // handleApiError is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.skip, query.per, query.date, query.type, query.q, query.status]);

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
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    loadDeanProfile();
  }, []);

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

  const handleDateChange = (event) => setFilter("date", event.target.value);

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

  // ============================================================
  // ARCHIVE / DELETE (PRD 1)
  // ============================================================

  const confirmRemoval = async () => {
    const event = removal?.event;
    if (!event) return;

    const deleting = removal.mode === "delete";

    try {
      setProcessingId(event.id);
      setError("");
      setSuccess("");

      if (deleting) {
        await apiJson(`/dean/events/${event.id}`, { method: "DELETE" });
      } else {
        await apiJson(`/dean/events/${event.id}/archive`, { method: "PATCH" });
      }

      setRemoval(null);
      setSuccess(
        deleting ? "Event deleted permanently." : "Event moved to the archive.",
      );
      // Refetch rather than splicing the row out: on a paged list, removing
      // one row locally would leave 24 of 25 with no way to pull the next in.
      await loadEvents();
    } catch (err) {
      handleApiError(
        err,
        deleting ? "Failed to delete event" : "Failed to archive event",
        "Remove event error",
      );
      setRemoval(null);
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * Reload the current page after a decision.
   *
   * Patching the row in place was right while the whole list lived in the
   * browser. Now that the server does the filtering and the counting, an
   * approved event has to leave the Pending tab and the tab counts have to
   * move with it — neither of which a local splice can do.
   */
  const refreshAfterDecision = () => loadEvents();

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

      await refreshAfterDecision();

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
      const revoking = decision?.kind === "revoke";
      const data = await apiJson(
        `/dean/events/${event.id}/${revoking ? "revoke" : "reject"}`,
        {
          method: "PATCH",
          body: revoking
            ? { revocation_reason: reason }
            : { rejection_reason: reason },
        },
      );

      await refreshAfterDecision();

      setSuccess(
        data.message ||
          (revoking ? "Event approval revoked." : "Event rejected successfully."),
      );
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

  // `events` is one page of an already-filtered result set, so there is no
  // second, client-side filtering pass to apply.
  const visibleEvents = events;

  const isFiltered =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    typeFilter !== "" ||
    selectedDate !== "";

  const handleClearAllFilters = () => {
    setSearchDraft("");
    reset();
  };

  // The decision dialog's copy depends on what the current status makes of it:
  // approving a rejection clears the reason, rejecting an approval revokes it.
  const decisionEvent = decision?.event;
  const decisionBucket = getStatusBucket(decisionEvent?.status);
  // Its own action now, not a rejection wearing a different label (PRD 18).
  const isRevoking = decision?.kind === "revoke";
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
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search name, venue, or type…"
                aria-label="Search events"
                className="input pl-10 pr-9"
              />

              {searchDraft && (
                <button
                  type="button"
                  onClick={() => setSearchDraft("")}
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
                onChange={(e) => setFilter("type", e.target.value)}
                aria-label="Filter by program type"
                className="input min-w-0 flex-1 sm:w-40 sm:flex-none"
              >
                <option value="">All programs</option>
                {eventTypes.map((type) => (
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
                onClick={() => setFilter("status", tab.key)}
                className="tab"
              >
                {tab.label}
                <span className="tab-count">{eventCounts[tab.key] ?? 0}</span>
              </button>
            ))}

            <div className="ml-auto flex items-center gap-3">
              <p className="num text-xs font-medium text-muted">
                {total === 0
                  ? "No events"
                  : `Showing ${query.skip + 1}–${query.skip + visibleEvents.length} of ${total}`}
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

          <EventsTable
            events={visibleEvents}
            loading={loading}
            formatEventDate={formatEventDate}
            emptyHint={
              isFiltered
                ? "No events match the current filters."
                : "No events have been submitted yet."
            }
            onClearFilters={isFiltered ? handleClearAllFilters : undefined}
            renderActions={(event) => (
              <EventActions
                event={event}
                isProcessing={processingId === event.id}
                onApprove={(e) => openDecision(e, "approve")}
                onReject={(e) => openDecision(e, "reject")}
                onRevoke={(e) => openDecision(e, "revoke")}
                onRemove={(e) => setRemoval({ event: e, mode: "archive", confirmText: "" })}
              />
            )}
          />

          {/* Outside the scrolling body: the page is height-locked, so the
              controls have to stay put while the rows scroll under them. */}
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
        </div>
      </div>

      {/* ==================================================================
          ARCHIVE OR DELETE
          Two outcomes behind one control, with the reversible one selected by
          default and the irreversible one gated behind typing DELETE.
      ================================================================== */}
      <Modal
        open={Boolean(removal)}
        onClose={() => !processingId && setRemoval(null)}
        eyebrow="Remove"
        title="Remove this event?"
        subtitle={removal?.event?.event_name || ""}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRemoval(null)}
              disabled={Boolean(processingId)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
                removal?.mode === "delete" ? "btn-danger" : "btn-brand"
              }`}
              onClick={confirmRemoval}
              disabled={
                Boolean(processingId) ||
                (removal?.mode === "delete" && removal?.confirmText !== "DELETE")
              }
            >
              {processingId ? <span className="spin h-3.5 w-3.5" /> : null}
              {removal?.mode === "delete" ? "Delete permanently" : "Archive"}
            </button>
          </>
        }
      >
        <div className="space-y-2.5">
          {[
            {
              mode: "archive",
              label: "Archive",
              hint: "Hides it from All Events but keeps the record, its media and its report. You can restore it from the Archive at any time.",
            },
            {
              mode: "delete",
              label: "Delete permanently",
              hint: "Removes the event, its photos, videos, documents and report. This cannot be undone.",
            },
          ].map((option) => (
            <label
              key={option.mode}
              className={`glass flex cursor-pointer gap-3 rounded-xl p-3.5 ${
                removal?.mode === option.mode ? "ring-1 ring-accent/40" : ""
              }`}
            >
              <input
                type="radio"
                name="removalMode"
                checked={removal?.mode === option.mode}
                onChange={() =>
                  setRemoval((current) => ({
                    ...current,
                    mode: option.mode,
                    confirmText: "",
                  }))
                }
                className="mt-1 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">
                  {option.label}
                </span>
                <span className="prose-muted block text-xs">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {removal?.mode === "delete" && (
          <div className="field mt-4">
            <label htmlFor="deleteConfirm">
              Type <span className="font-semibold">DELETE</span> to confirm
            </label>
            <input
              id="deleteConfirm"
              type="text"
              value={removal.confirmText}
              onChange={(event) =>
                setRemoval((current) => ({
                  ...current,
                  confirmText: event.target.value,
                }))
              }
              autoComplete="off"
              placeholder="DELETE"
              className="input"
            />
          </div>
        )}
      </Modal>

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
              : "Do you want to approve?"
            : isRevoking
            ? "Revoke this approval?"
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

            {decision?.kind === "approve" && (
              <button
                type="button"
                onClick={() =>
                  navigate(`/dean/events/${decisionEvent?.id}?action=approve`)
                }
                disabled={decisionBusy}
                className="btn btn-ghost btn-sm"
              >
                Open event and approve
              </button>
            )}

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
                {decisionBusy
                  ? isRevoking
                    ? "Revoking…"
                    : "Rejecting…"
                  : isRevoking
                  ? "Revoke approval"
                  : "Reject"}
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
                ? "This event is approved. Revoking withdraws that approval, invalidates any generated report, and notifies the teacher — who can then fix and resubmit it."
                : "This event is rejected. Re-approving it clears the existing rejection reason and notifies the teacher."}
            </p>
          </div>
        )}

        {/* Revoke belongs here too: confirmReject will not send without a
            reason, so omitting the field made the button a silent no-op. */}
        {(decision?.kind === "reject" || decision?.kind === "revoke") && (
          <div className="field mt-5">
            <label htmlFor="rejectReason">
              {decision?.kind === "revoke"
                ? "Reason for revoking approval"
                : "Reason for rejection"}
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
              placeholder={
                decision?.kind === "revoke"
                  ? "Why is this approval being withdrawn?"
                  : "What needs to change before this can be approved?"
              }
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
