import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../services/api";
import {
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
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        eyebrow="Inbox"
        title="All notifications"
        subtitle={`${notifications.length} total · ${unreadCount} unread`}
        wide
        footer={
          <>
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
            className="input pl-10"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter notifications">
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

        <div className="-mx-6 mt-4 border-t hairline">
          {filteredHistory.length === 0 ? (
            emptyState("Nothing matches", "Try a different search or filter.")
          ) : (
            <ul>{filteredHistory.map((n) => renderItem(n, false))}</ul>
          )}
        </div>
      </Modal>

      {/* ---------------------------------------------------------- toasts */}
      {toasts.length > 0 && (
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
