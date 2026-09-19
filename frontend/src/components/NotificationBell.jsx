import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../services/api";
import {
  clearAllNotifications,
  deleteNotification,
  evaluateEventReminders,
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  timeAgo,
} from "../utils/notificationService";
import Modal from "./teacher/Modal";
import { trackOf } from "./teacher/status";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconBell,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconInbox,
  IconLayers,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
  IconXCircle,
} from "./teacher/icons";

/**
 * How each kind of notification looks. Tints come from the status palette,
 * so a notification about an approval is the same green as the Approved pill.
 */
const TYPE_META = {
  approved: { Icon: IconCheckCircle, track: trackOf("approved"), label: "Approved" },
  rejected: { Icon: IconXCircle, track: trackOf("rejected"), label: "Rejected" },
  needs_changes: { Icon: IconAlertTriangle, track: trackOf("pending"), label: "Changes" },
  progress: { Icon: IconActivity, track: trackOf("in_progress"), label: "Progress" },
  published: { Icon: IconLayers, track: trackOf("published"), label: "Published" },
  reminder: { Icon: IconClock, track: "#0EA5E9", label: "Reminders" },
  submitted: { Icon: IconInbox, track: trackOf("pending"), label: "New" },
  resubmitted: { Icon: IconRefresh, track: trackOf("under_review"), label: "Resubmitted" },
};

const FALLBACK_META = { Icon: IconBell, track: "#64748B", label: "Other" };

/** The filter tabs each role gets — only the kinds that role can receive. */
const FILTERS = {
  teacher: ["all", "approved", "rejected", "needs_changes", "progress", "reminder"],
  dean: ["all", "submitted", "resubmitted"],
};

const EMPTY_COPY = {
  teacher: "You will be told here when the Dean approves, rejects or moves one of your events.",
  dean: "New and resubmitted events for your review will appear here.",
};

const POLL_INTERVAL_MS = 30_000;
const TOAST_MS = 6_000;

/**
 * Every page mounts its own bell, so without this the reminder check would
 * re-run on each navigation. Once per user per interval is plenty; a check
 * that was cut short (unmount) does not count.
 */
const REMINDER_RECHECK_MS = 10 * 60 * 1000;
const lastReminderCheck = new Map(); // userId -> timestamp

/**
 * The notification bell, for every role that has one.
 *
 * Polls the signed-in user's own feed. Anything that arrives after the first
 * load also raises a toast, and `onNew` lets the page behind it refresh — the
 * Dean dashboard uses it to update its counts when a submission comes in.
 *
 * For teachers it also runs the event-day reminder check once per visit, so
 * "your event is tomorrow" notices are created without any server scheduler.
 */
export default function NotificationBell({ currentUser, onNew }) {
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const knownIds = useRef(null);
  // The latest callback, without restarting the poll every time the parent
  // re-renders and hands over a new function.
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const [historySearch, setHistorySearch] = useState("");

  // Rows being removed, so a second click cannot fire a second request while
  // the first is still in flight.
  const [deletingIds, setDeletingIds] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");

  const userId = currentUser?.id;
  const role = currentUser?.role === "dean" ? "dean" : "teacher";

  const eventPath = (id) => (role === "dean" ? `/dean/events/${id}` : `/teacher/events/${id}`);

  /* ---- Fetch, and spot what is new since the last look ---- */
  const loadNotifications = useCallback(async () => {
    if (!userId) return [];
    try {
      setLoading(true);
      const list = await fetchNotifications(userId);
      setNotifications(list);

      if (knownIds.current === null) {
        // First load: everything already there is history, not news.
        knownIds.current = new Set(list.map((n) => n.id));
      } else {
        const fresh = list.filter((n) => !n.is_read && !knownIds.current.has(n.id));
        list.forEach((n) => knownIds.current.add(n.id));

        if (fresh.length > 0) {
          setToasts((prev) => [...fresh.slice(0, 3), ...prev].slice(0, 3));
          onNewRef.current?.(fresh);
        }
      }

      return list;
    } catch (err) {
      console.warn("NotificationBell: fetch error", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Poll only while the tab is visible; a hidden tab (possibly one of many)
  // stops, and catches up immediately when it is shown again.
  useEffect(() => {
    knownIds.current = null;
    let interval = null;

    const start = () => {
      if (interval === null) interval = setInterval(loadNotifications, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        loadNotifications();
        start();
      }
    };

    loadNotifications();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadNotifications]);

  /* ---- Teachers: event-day reminders, once per visit ---- */
  useEffect(() => {
    if (!userId || role !== "teacher") return undefined;
    const last = lastReminderCheck.get(userId) || 0;
    if (Date.now() - last < REMINDER_RECHECK_MS) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const [{ events = [] } = {}, existing] = await Promise.all([
          apiJson("/teacher/events"),
          fetchNotifications(userId),
        ]);
        if (cancelled) return;
        const created = await evaluateEventReminders(userId, events, existing, {
          isCancelled: () => cancelled,
        });
        if (!cancelled) lastReminderCheck.set(userId, Date.now());
        if (created && !cancelled) {
          // Reminders are generated on this device; they are not "news" to toast.
          const list = await fetchNotifications(userId);
          list.forEach((n) => knownIds.current?.add(n.id));
          setNotifications(list);
        }
      } catch (err) {
        console.warn("Reminder check skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  /* ---- Toasts clear themselves ---- */
  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(0, -1)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  /* ---- Close on outside click or Escape ---- */
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  /* ---- Actions ---- */
  const markRead = async (notif) => {
    if (notif.is_read) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    await markNotificationAsRead(userId, notif.id);
  };

  const markAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
    );
    await markAllNotificationsAsRead(userId);
  };

  /**
   * Remove one notification.
   *
   * No confirmation: a notification is already transient — the server drops
   * it an hour after it is read — so a dialog would be friction on something
   * of no consequence. Clearing the whole list does confirm.
   */
  const removeOne = async (notif) => {
    if (deletingIds.includes(notif.id)) return;

    setDeletingIds((prev) => [...prev, notif.id]);
    // Optimistic: the row goes now, and comes back if the server refuses.
    const snapshot = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    setToasts((prev) => prev.filter((t) => t.id !== notif.id));

    const ok = await deleteNotification(userId, notif.id);
    if (!ok) setNotifications(snapshot);

    setDeletingIds((prev) => prev.filter((id) => id !== notif.id));
  };

  const confirmClearAll = async () => {
    setClearing(true);
    const snapshot = notifications;
    const { ok } = await clearAllNotifications(userId);

    if (ok) {
      setNotifications([]);
      setToasts([]);
      setConfirmClear(false);
      setOpen(false);
      setHistoryOpen(false);
    } else {
      setNotifications(snapshot);
      setConfirmClear(false);
    }
    setClearing(false);
  };

  /** Open the event — the page that carries its status, history and remarks. */
  const openNotification = (notif) => {
    markRead(notif);
    setOpen(false);
    setHistoryOpen(false);
    setToasts((prev) => prev.filter((t) => t.id !== notif.id));

    const eventId = notif.event_id || notif.data?.event_id;
    if (eventId) navigate(eventPath(eventId));
  };

  const editAndResubmit = (notif) => {
    markRead(notif);
    setOpen(false);
    setHistoryOpen(false);
    navigate(`/teacher/create-event?editEventId=${notif.event_id}`);
  };

  const filteredHistory = notifications.filter((n) => {
    if (historyFilter !== "all" && n.notification_type !== historyFilter) return false;
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return [n.title, n.message, n.data?.event_name].some((field) =>
      String(field || "").toLowerCase().includes(q)
    );
  });

  /* ---- One notification row ---- */
  const renderItem = (notif, compact) => {
    const meta = TYPE_META[notif.notification_type] || FALLBACK_META;
    const canEdit =
      role === "teacher" &&
      notif.event_id &&
      (notif.notification_type === "rejected" || notif.notification_type === "needs_changes");

    return (
      <li key={notif.id} className="border-b hairline last:border-b-0">
        <div
          role="button"
          tabIndex={0}
          onClick={() => openNotification(notif)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openNotification(notif))}
          className={`flex cursor-pointer gap-3 px-4 py-3.5 transition hover:bg-raised/45 ${
            notif.is_read ? "" : "bg-accent/4"
          }`}
        >
          <span
            className="icon-tile icon-tile-track h-8 w-8 shrink-0 rounded-lg"
            style={{ "--track": meta.track }}
          >
            <meta.Icon className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm leading-snug text-ink ${notif.is_read ? "font-medium" : "font-semibold"}`}>
                {notif.title || "Notification"}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                {!notif.is_read && (
                  <span className="dot dot-sm" style={{ "--track": meta.track }} aria-label="Unread" />
                )}
                {timeAgo(notif.created_at)}

                {/* stopPropagation: the whole row is a button that opens the
                    event, so without it deleting would also navigate away. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOne(notif);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  disabled={deletingIds.includes(notif.id)}
                  title="Delete this notification"
                  aria-label={`Delete notification: ${notif.title || "Notification"}`}
                  className="icon-btn icon-btn-sm -my-1 -mr-1.5 shrink-0 text-muted hover:text-err"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>

            <p className={`prose-muted mt-0.5 text-xs ${compact ? "line-clamp-2" : ""}`}>
              {notif.message}
            </p>

            {notif.event_id && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="btn btn-ghost btn-xs">
                  View event
                  <IconArrowRight />
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      editAndResubmit(notif);
                    }}
                    className="btn btn-ghost btn-xs"
                  >
                    <IconEdit />
                    Edit &amp; resubmit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  };

  const emptyState = (title, body) => (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="icon-tile mb-3 h-12 w-12 rounded-2xl">
        <IconInbox className="h-5 w-5" />
      </span>
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      <p className="prose-muted mt-1 max-w-xs text-xs">{body}</p>
    </div>
  );

  /**
   * The bell lives inside the app header, which carries a `backdrop-filter`
   * (deliberately: it makes the header the containing block for the dropdown,
   * which is `position: fixed`). A dialog rendered in that subtree inherits
   * the same containing block, so `.hv-backdrop`'s `inset: 0` resolved
   * against the header strip rather than the viewport -- the panel was
   * clipped off the top of the screen and only the header was dimmed. The
   * header also re-tokenises its subtree for dark chrome (`--c-ink` near
   * white), which `.hv-popover` restores for the dropdown but not for a
   * modal, leaving its rows near-white on white.
   *
   * Portalling to <body> takes the dialogs out of the header on both counts,
   * and leaves the shared Modal and the global styles untouched.
   */
  const inBodyPortal = (node) =>
    typeof document === "undefined" ? node : createPortal(node, document.body);

  return (
    <div ref={wrapRef} className="relative">
      {/* -------------------------------------------------------- the bell */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="icon-btn icon-btn-sm relative sm:h-11 sm:w-11 sm:rounded-xl"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        title="Notifications"
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="num absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-[#12100a]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ------------------------------------------------------- the panel
          On a phone the bell is not at the screen edge (the menu button sits
          beside it), so a panel hung from the bell would run off the left.
          There it spans the width under the header instead — `fixed` resolves
          against the header, whose backdrop-filter makes it the containing
          block — and from sm up it drops from the bell as usual. */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="hv-popover glass glass-blur fixed inset-x-3 top-full z-50 mt-2 flex max-h-[min(32rem,80vh)] flex-col overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:w-[min(23rem,calc(100vw-1.5rem))]"
        >
          <div className="flex items-center justify-between gap-3 border-b hairline px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="font-display text-sm font-semibold text-ink">Notifications</p>
              {unreadCount > 0 && <span className="chip chip-sm chip-ember">{unreadCount} new</span>}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="icon-btn icon-btn-sm"
              aria-label="Close notifications"
            >
              <IconX />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-muted">
                <span className="spin h-4 w-4 text-accent" />
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              emptyState("No notifications yet", EMPTY_COPY[role])
            ) : (
              <ul>{notifications.slice(0, 8).map((n) => renderItem(n, true))}</ul>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t hairline px-4 py-2.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                  className="btn btn-ghost btn-xs"
                >
                  <IconCheck />
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="btn btn-ghost btn-xs text-err"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  Clear all
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setHistoryOpen(true);
                }}
                className="link text-xs font-semibold"
              >
                View all
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ the full history */}
{inBodyPortal(
        <Modal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          eyebrow="Inbox"
          title="All notifications"
          subtitle={`${notifications.length} total · ${unreadCount} unread`}
          wide
          footer={
            <>
              {/* Destructive action kept to the left, away from Close, so it
                  is not the button the thumb lands on by accident. */}
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={notifications.length === 0}
                className="btn btn-ghost btn-sm mr-auto text-err"
              >
                <IconTrash />
                Clear all
              </button>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="btn btn-ghost btn-sm"
              >
                <IconCheck />
                Mark all read
              </button>
              <button type="button" onClick={() => setHistoryOpen(false)} className="btn btn-brand btn-sm">
                Close
              </button>
            </>
          }
        >
          {/* The controls stay put while only the list scrolls. Previously the
              whole body scrolled as one block, so on a long list the search box
              and the filters disappeared off the top. */}
          <div className="flex max-h-[min(calc(86svh-15rem),32rem)] flex-col">
            <div className="shrink-0 space-y-3">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                  <IconSearch className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search notifications…"
                  aria-label="Search notifications"
                  className="input pl-10 pr-9"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch("")}
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted transition hover:text-ink"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div
                className="flex flex-wrap gap-1.5"
                role="tablist"
                aria-label="Filter notifications"
              >
                {FILTERS[role].map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={historyFilter === key}
                    onClick={() => setHistoryFilter(key)}
                    className="tab"
                  >
                    {key === "all" ? "All" : (TYPE_META[key] || FALLBACK_META).label}
                  </button>
                ))}
              </div>

              {/* Says what the filter is actually showing, so an empty-looking
                  inbox is never mistaken for an empty one. */}
              <p className="prose-muted text-xs" aria-live="polite">
                {filteredHistory.length === notifications.length
                  ? `${notifications.length} notification${notifications.length === 1 ? "" : "s"}`
                  : `Showing ${filteredHistory.length} of ${notifications.length}`}
              </p>
            </div>

            {/* Full-bleed so rows meet the panel edge, as they do in the
                dropdown; the negative margin is cancelled by the row padding. */}
            <div className="-mx-6 mt-3 min-h-0 flex-1 overflow-y-auto border-t hairline">
              {filteredHistory.length === 0 ? (
                notifications.length === 0
                  ? emptyState("No notifications yet", EMPTY_COPY[role])
                  : emptyState("Nothing matches", "Try a different search or filter.")
              ) : (
                <ul>{filteredHistory.map((n) => renderItem(n, false))}</ul>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Clearing the whole list is the one notification action worth
          confirming: it is irreversible and removes things the user may not
          have read. The count comes from state, and the server reports the
          real number it removed. */}
{inBodyPortal(
        <Modal
          open={confirmClear}
          onClose={() => !clearing && setConfirmClear(false)}
          eyebrow="Notifications"
          title="Are you sure you want to clear all notifications?"
          subtitle={
            notifications.length === 1
              ? "1 notification will be removed."
              : `All ${notifications.length} notifications will be removed.`
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                disabled={clearing}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearAll}
                disabled={clearing}
                className="btn btn-danger btn-sm"
              >
                {clearing ? <span className="spin h-3.5 w-3.5" /> : <IconTrash />}
                {clearing ? "Clearing…" : "Clear all"}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink">
            This removes every notification in your inbox, read and unread. It
            cannot be undone — but it does not affect the events themselves.
          </p>
        </Modal>
      )}

      {/* ---------------------------------------------------------- toasts
          Portalled for the same reason as the dialogs above: `fixed` inside
          the header resolved against the header strip, so the toasts stacked
          over it instead of the bottom-right of the screen, in the header's
          near-white ink on the page's white surface. */}
      {toasts.length > 0 &&
        inBodyPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-85 max-w-[calc(100vw-2.5rem)] flex-col gap-3">
          {toasts.map((notif) => {
            const meta = TYPE_META[notif.notification_type] || FALLBACK_META;
            return (
              <div key={notif.id} className="toast pointer-events-auto" role="status">
                <span
                  className="icon-tile icon-tile-track h-9 w-9 shrink-0 rounded-xl"
                  style={{ "--track": meta.track }}
                >
                  <meta.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-ink">{notif.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{notif.message}</p>
                  {notif.event_id && (
                    <button
                      type="button"
                      onClick={() => openNotification(notif)}
                      className="link mt-1.5 font-display text-xs font-semibold"
                    >
                      View event →
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== notif.id))}
                  aria-label="Dismiss notification"
                  className="shrink-0 text-muted transition hover:text-ink"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        )}
    </div>
  );
}
