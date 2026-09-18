import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../../services/api";
import { fetchCurrentUser, signOut } from "../../services/auth";
import { canTeacherEditEvent } from "../../utils/constants";
import {
  getTeacherDrafts,
  deleteTeacherDraft,
  duplicateEventAsDraft,
  decodeEventMetadata,
} from "../../utils/draftStorage";
import TeacherShell from "../../components/teacher/TeacherShell";
import Modal from "../../components/teacher/Modal";
import StatusChip from "../../components/teacher/StatusChip";
import { isApprovedStatus, isPendingStatus, trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconEdit,
  IconInbox,
  IconPlus,
  IconRefresh,
  IconRotateCcw,
  IconSearch,
  IconTrash,
  IconX,
} from "../../components/teacher/icons";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const DATE_FILTERS = [
  { key: "all_time", label: "All dates" },
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "custom", label: "Custom range" },
];

/**
 * Table columns, ordered by how much each one tells the teacher at a glance.
 * Actions is pinned to the right edge, so on a narrow screen it is Venue —
 * the least decisive field, and one still shown in full on the details page —
 * that slides under the pin rather than the status or the event name.
 */
const COLUMNS = [
  { label: "Event", className: "" },
  { label: "Status", className: "" },
  { label: "Type", className: "" },
  { label: "Date", className: "" },
  { label: "Venue", className: "hidden min-[1340px]:table-cell" },
  { label: "Actions", className: "sticky right-0 bg-raised/45 text-right" },
];

/**
 * Everything a teacher can do to one of their events. Shared by the desktop
 * table and the mobile card list so the two can never drift apart.
 */
function EventActions({ item, canDelete, onDuplicate, onDelete }) {
  return (
    <>
      {item.isDraft && (
        <Link
          to={`/teacher/create-event?draftId=${item.id}`}
          title="Continue editing draft"
          className="btn btn-brand btn-xs"
        >
          <IconEdit />
          Edit
        </Link>
      )}

      {!item.isDraft && item.status === "rejected" && (
        <Link
          to={`/teacher/create-event?editEventId=${item.id}`}
          title="Edit and resubmit event"
          className="btn btn-danger btn-xs"
        >
          <IconRefresh />
          Resubmit
        </Link>
      )}

      {/* Editable until the Dean approves it. Rejected events already have
          their own Resubmit action above. */}
      {!item.isDraft &&
        item.status !== "rejected" &&
        canTeacherEditEvent(item) && (
          <Link
            to={`/teacher/create-event?editEventId=${item.id}`}
            title="Edit event"
            className="btn btn-ghost btn-xs"
          >
            <IconEdit />
            Edit
          </Link>
        )}

      {!item.isDraft && (
        <Link
          to={`/teacher/events/${item.id}`}
          title="View event details"
          className="btn btn-ghost btn-xs"
        >
          View
          <IconArrowRight />
        </Link>
      )}

      <button
        type="button"
        onClick={() => onDuplicate(item)}
        title="Duplicate as new draft"
        aria-label="Duplicate as new draft"
        className="icon-btn icon-btn-sm hover:border-ember/60 hover:text-emberink"
      >
        <IconCopy />
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(item)}
          title="Delete event"
          aria-label="Delete event"
          className="icon-btn icon-btn-sm hover:border-err/50 hover:text-err"
        >
          <IconTrash />
        </button>
      )}
    </>
  );
}

function MyEvents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeFilter = searchParams.get("filter") || "all";

  // Data state
  const [events, setEvents] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Search & date filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all_time"); // all_time | today | this_week | this_month | custom
  const [customFromDate, setCustomFromDate] = useState("");
  const [customToDate, setCustomToDate] = useState("");

  // Delete modal state
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError("");

      const userProfile = await fetchCurrentUser();

      if (!userProfile) {
        navigate("/login");
        return;
      }

      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // Fetch teacher's events from the API (MongoDB)
      const { events: teacherEvents } = await apiJson("/teacher/events");

      // Fetch local teacher drafts
      const teacherDrafts = getTeacherDrafts(userProfile.id);

      setEvents(teacherEvents || []);
      setDrafts(teacherDrafts || []);
    } catch (err) {
      console.error("My Events error:", err);
      setError(err.message || "Failed to load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Feedback is shown as a floating toast so it never pushes the list down
  // and forces the teacher to scroll.
  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = setTimeout(() => setSuccessMessage(""), 4500);

    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleTabClick = (tabKey) => {
    setSearchParams({ filter: tabKey });
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setDateFilter("all_time");
    setCustomFromDate("");
    setCustomToDate("");
    setSearchParams({ filter: "all" });
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    activeFilter !== "all" ||
    dateFilter !== "all_time" ||
    customFromDate !== "" ||
    customToDate !== "";

  // Duplicate Event
  const handleDuplicate = (targetEvent) => {
    if (!profile) return;
    try {
      const newDraft = duplicateEventAsDraft(profile.id, targetEvent);
      setSuccessMessage(`Event "${targetEvent.event_name || targetEvent.eventName}" duplicated as draft.`);
      setTimeout(() => {
        navigate(`/teacher/create-event?draftId=${newDraft.id}`);
      }, 600);
    } catch (err) {
      console.error("Duplicate error:", err);
      alert("Failed to duplicate event.");
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingEvent || !profile) return;
    try {
      setDeletingLoading(true);
      if (deletingEvent.isDraft) {
        deleteTeacherDraft(profile.id, deletingEvent.id);
        setDrafts((prev) => prev.filter((d) => d.id !== deletingEvent.id));
      } else {
        await apiJson(`/teacher/events/${deletingEvent.id}`, { method: "DELETE" });
        setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id));
      }

      setSuccessMessage("Event deleted successfully.");
      setDeletingEvent(null);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete event: " + (err.message || "Unknown error"));
    } finally {
      setDeletingLoading(false);
    }
  };

  // Combined events and drafts
  const allCombinedItems = [
    ...drafts.map((d) => ({ ...d, isDraft: true, status: "draft" })),
    ...events.map((e) => ({ ...e, isDraft: false })),
  ];

  // Calculate tab counts. Drafts are counted from the combined list, not from
  // `drafts` alone: once a draft has a file attached it lives on the server and
  // arrives in `events` with a "draft" status, which is what the filter below
  // matches on.
  const tabCounts = {
    all: allCombinedItems.length,
    draft: allCombinedItems.filter((item) => item.status === "draft").length,
    pending: events.filter((e) => isPendingStatus(e.status)).length,
    // Approved includes events the Dean has since marked in progress or
    // completed; each row's status pill still names the exact stage.
    approved: events.filter((e) => isApprovedStatus(e.status)).length,
    rejected: events.filter((e) => e.status === "rejected").length,
  };

  // --- Filtering Conditions ---
  const matchesSearch = (item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const name = (item.event_name || item.eventName || "").toLowerCase();
    const venue = (item.location || "").toLowerCase();
    const { meta } = decodeEventMetadata(item.description || "");
    const dept = (item.department || meta.department || "").toLowerCase();
    return name.includes(q) || venue.includes(q) || dept.includes(q);
  };

  const matchesStatus = (item) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "draft") return item.status === "draft";
    if (activeFilter === "pending" || activeFilter === "submitted") {
      return isPendingStatus(item.status);
    }
    if (activeFilter === "approved") return isApprovedStatus(item.status);
    if (activeFilter === "rejected") return item.status === "rejected";
    return true;
  };

  const matchesDate = (item) => {
    if (dateFilter === "all_time") return true;
    const eventDateStr = item.event_date || item.eventDate;
    if (!eventDateStr) return false;

    if (dateFilter === "today") {
      const todayStr = new Date().toISOString().split("T")[0];
      return eventDateStr === todayStr;
    }

    if (dateFilter === "this_week") {
      const d = new Date(eventDateStr);
      if (isNaN(d.getTime())) return false;
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return d >= monday && d <= sunday;
    }

    if (dateFilter === "this_month") {
      const d = new Date(eventDateStr);
      if (isNaN(d.getTime())) return false;
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    if (dateFilter === "custom") {
      if (customFromDate && eventDateStr < customFromDate) return false;
      if (customToDate && eventDateStr > customToDate) return false;
      return true;
    }

    return true;
  };

  // Evaluates combination of Search + Status + Date Filter (AND logic)
  const filteredItems = allCombinedItems.filter(
    (item) => matchesSearch(item) && matchesStatus(item) && matchesDate(item)
  );

  const canDeleteItem = (item) => item.isDraft || canTeacherEditEvent(item);

  // ============================================================
  // MAIN UI
  //
  // The screen is height-locked: only the list body scrolls, so the
  // toolbar, the status chips and the column headers always stay put.
  // ============================================================

  return (
    <TeacherShell
      active="events"
      profile={profile}
      onLogout={handleLogout}
      railBadge={tabCounts.all}
      railNote="Filter by status, search by name, venue or department, then act on any row."
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
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="toast toast-ok pointer-events-auto" role="status">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
              <IconCheck className="h-3 w-3" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{successMessage}</p>
            <button
              onClick={() => setSuccessMessage("")}
              aria-label="Dismiss message"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6 lg:py-6">

        {/* ================================================
            COMMAND BAR
            Title, search, date range, status chips and the
            primary action — every control on one screen.
        ================================================ */}
        <div className="glass shrink-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-5">

            <div className="mr-auto min-w-0">
              <p className="eyebrow">Teacher Panel</p>
              <h1 className="h3 mt-0.5 truncate text-ink">My Events</h1>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-60 xl:w-72">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                <IconSearch className="h-4 w-4" />
              </span>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, venue, or department…"
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

            {/* Date range. A select rather than five chips: it carries the
                same five choices in one control instead of a whole row. */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by date range"
              className="input w-full sm:w-auto"
            >
              {DATE_FILTERS.map((df) => (
                <option key={df.key} value={df.key}>
                  {df.label}
                </option>
              ))}
            </select>

            {dateFilter === "custom" && (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  aria-label="From date"
                  className="input min-w-0 flex-1 sm:w-38 sm:flex-none"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  aria-label="To date"
                  className="input min-w-0 flex-1 sm:w-38 sm:flex-none"
                />
              </div>
            )}

            <Link to="/teacher/create-event" className="btn btn-primary btn-sm shrink-0">
              <IconPlus />
              <span className="hidden sm:inline">New Event</span>
            </Link>
          </div>

          {/* Status tabs + result count */}
          <div className="flex flex-wrap items-center gap-1.5 border-t hairline bg-raised/35 px-4 py-2.5 sm:px-5">
            {STATUS_TABS.map((tab) => {
              const isSelected = activeFilter === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabClick(tab.key)}
                  aria-selected={isSelected}
                  role="tab"
                  className="tab"
                >
                  {tab.label}
                  <span className="tab-count">{tabCounts[tab.key] || 0}</span>
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-3">
              <p className="num text-xs font-medium text-muted">
                Showing {filteredItems.length} of {allCombinedItems.length}
              </p>

              {isFiltered && (
                <button type="button" onClick={handleClearFilters} className="btn btn-ghost btn-xs">
                  <IconRotateCcw />
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================================================
            EVENTS LIST
            Fills the remaining height; its body is the only
            scrolling region on the page.
        ================================================ */}
        <div className="glass relative flex min-h-0 flex-1 flex-col overflow-hidden">

          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
              <div className="flex items-center gap-2.5 text-sm font-medium text-muted">
                <span className="spin h-4 w-4 text-accent" />
                Loading your events…
              </div>
            </div>
          )}

          {!loading && filteredItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="icon-tile mb-4 h-14 w-14 rounded-2xl">
                <IconInbox className="h-6 w-6" />
              </span>

              <p className="h3 text-ink">No events found.</p>

              <p className="prose-muted mt-1 text-sm">
                {isFiltered
                  ? "No events match the selected search keywords or filter criteria."
                  : "You haven't created any events yet."}
              </p>

              {isFiltered ? (
                <button type="button" onClick={handleClearFilters} className="btn btn-brand btn-sm mt-5">
                  <IconRotateCcw />
                  Clear filters
                </button>
              ) : (
                <Link to="/teacher/create-event" className="btn btn-primary btn-sm mt-5">
                  <IconPlus />
                  Create an event
                </Link>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">

              {/* ------------------------------------------------
                  MOBILE: a table cannot show an event's context in
                  390px, so each event becomes a card instead.
              ------------------------------------------------ */}
              <ul className="divide-y divide-line/8 md:hidden">
                {filteredItems.map((item) => {
                  const { meta } = decodeEventMetadata(item.description);
                  const department = item.department || meta.department;
                  const isRejected = item.status === "rejected";

                  return (
                    <li
                      key={item.id}
                      style={isRejected ? { "--track": trackOf("rejected") } : undefined}
                      className={`px-4 py-3.5 ${isRejected ? "bg-[color-mix(in_srgb,var(--track)_6%,transparent)]" : ""}`}
                    >
                      <p className="truncate font-display text-sm font-semibold text-ink">
                        {item.event_name || item.eventName || "Untitled Draft"}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
                        <StatusChip status={item.status} />
                        {/* Joined rather than separate spans so a wrap never
                            strands a lone separator at the end of a line. */}
                        <span>
                          {[
                            department,
                            item.event_type || item.eventType,
                            item.event_date || item.eventDate,
                            item.location,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Nothing set yet"}
                        </span>
                      </div>

                      {isRejected && item.rejection_reason && (
                        <p className="mt-1.5 text-xs" style={{ color: trackOf("rejected") }}>
                          <span className="font-semibold">Rejection reason:</span>{" "}
                          {item.rejection_reason}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <EventActions
                          item={item}
                          canDelete={canDeleteItem(item)}
                          onDuplicate={handleDuplicate}
                          onDelete={setDeletingEvent}
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
                  {filteredItems.map((item) => {
                    const { description: cleanDesc, meta } = decodeEventMetadata(item.description);
                    const department = item.department || meta.department;
                    const isRejected = item.status === "rejected";

                    return (
                      <tr
                        key={item.id}
                        style={isRejected ? { "--track": trackOf("rejected") } : undefined}
                        className={`group transition hover:bg-raised/35 ${
                          isRejected ? "bg-[color-mix(in_srgb,var(--track)_5%,transparent)]" : ""
                        }`}
                      >
                        {/* Event name, with its context on one muted line */}
                        <td className="max-w-56 px-4 py-3 xl:max-w-80">
                          <p
                            className="truncate font-display text-sm font-semibold text-ink"
                            title={item.event_name || item.eventName || "Untitled Draft"}
                          >
                            {item.event_name || item.eventName || "Untitled Draft"}
                          </p>

                          <p className="truncate text-xs text-muted" title={cleanDesc || undefined}>
                            {department ? `${department} • ` : ""}
                            {cleanDesc || "No description"}
                          </p>

                          {isRejected && item.rejection_reason && (
                            <p
                              className="line-clamp-2 text-xs"
                              style={{ color: trackOf("rejected") }}
                              title={item.rejection_reason}
                            >
                              <span className="font-semibold">Reason:</span> {item.rejection_reason}
                            </p>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusChip status={item.status} />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">
                          {item.event_type || item.eventType || <NotSet />}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted">
                          {item.event_date || item.eventDate || <NotSet />}
                        </td>

                        <td className="hidden max-w-48 px-4 py-3 text-sm text-muted min-[1340px]:table-cell">
                          <span className="block truncate" title={item.location}>
                            {item.location || <NotSet />}
                          </span>
                        </td>

                        {/* Actions, pinned so they stay reachable */}
                        <td className="sticky right-0 whitespace-nowrap bg-surface px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.12)] transition group-hover:bg-raised/60">
                          <div className="flex items-center justify-end gap-1.5">
                            <EventActions
                              item={item}
                              canDelete={canDeleteItem(item)}
                              onDuplicate={handleDuplicate}
                              onDelete={setDeletingEvent}
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

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deletingEvent)}
        onClose={() => !deletingLoading && setDeletingEvent(null)}
        eyebrow="Confirm"
        title="Delete Event"
        subtitle={deletingEvent?.isDraft ? "Draft event deletion" : "Submitted event deletion"}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeletingEvent(null)}
              disabled={deletingLoading}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deletingLoading}
              className="btn btn-danger btn-sm"
            >
              {deletingLoading && <span className="spin h-3.5 w-3.5" />}
              {deletingLoading ? "Deleting…" : "Delete Event"}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="icon-tile icon-tile-track" style={{ "--track": trackOf("rejected") }}>
            <IconAlertTriangle />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-ink">
              {deletingEvent?.event_name || deletingEvent?.eventName || "Untitled Event"}
            </p>
            <p className="prose-muted mt-1 text-xs">
              Venue: {deletingEvent?.location || "Not set"} · Date:{" "}
              {deletingEvent?.event_date || deletingEvent?.eventDate || "Not set"}
            </p>
          </div>
        </div>

        <p className="prose-muted mt-4 text-sm">
          Are you sure you want to delete this event? This will permanently remove it from
          your records.
        </p>
      </Modal>
    </TeacherShell>
  );
}

const NotSet = () => <span className="italic text-muted/70">Not set</span>;

export default MyEvents;
