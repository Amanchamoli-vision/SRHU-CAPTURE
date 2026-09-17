import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchTeacherNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  timeAgo,
} from "../utils/notificationService";

/* ============ Inline SVG Icons ============ */
const IconBell = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconCheckCircle = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </svg>
);
const IconAlertTriangle = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </svg>
);
const IconAlertCircle = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);
const IconLayers = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);
const IconClock = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const IconX = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconSearch = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const IconCheckCheck = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="2 12 7 17 12 12" />
    <polyline points="12 12 17 17 22 12" />
  </svg>
);
const IconArrowRight = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconEdit = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconInbox = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 12h4l2 3h4l2-3h4" />
    <path d="M5.5 5h13l2 7v6a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18v-6l2-7Z" />
  </svg>
);

/* ============ Helpers ============ */

const NOTIF_ICON_MAP = {
  approved: { Icon: IconCheckCircle, color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  rejected: { Icon: IconAlertTriangle, color: "text-rose-500", bg: "bg-rose-50", ring: "ring-rose-200" },
  needs_changes: { Icon: IconAlertCircle, color: "text-amber-500", bg: "bg-amber-50", ring: "ring-amber-200" },
  published: { Icon: IconLayers, color: "text-purple-500", bg: "bg-purple-50", ring: "ring-purple-200" },
  reminder: { Icon: IconClock, color: "text-sky-500", bg: "bg-sky-50", ring: "ring-sky-200" },
};

const STATUS_FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "needs_changes", label: "Changes" },
  { key: "published", label: "Published" },
  { key: "reminder", label: "Reminders" },
];

const POLL_INTERVAL_MS = 60_000; // 1-minute poll

/**
 * NotificationBell Component
 *
 * Props:
 *  - currentUser: { id, name, email, role } profile object (must have .id)
 */
export default function NotificationBell({ currentUser }) {
  const navigate = useNavigate();
  const bellRef = useRef(null);
  const panelRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // History modal state
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");

  const userId = currentUser?.id;

  /* ---- Fetch notifications ---- */
  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const list = await fetchTeacherNotifications(userId);
      setNotifications(list);
    } catch (err) {
      console.warn("NotificationBell: fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  /* ---- Close on outside click ---- */
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* ---- Derived state ---- */
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayBadge = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  /* ---- Actions ---- */
  const handleMarkAsRead = async (notif) => {
    if (notif.is_read) return;
    await markNotificationAsRead(userId, notif.id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notif.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead(userId);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
    );
  };

  const handleNotifClick = (notif) => {
    handleMarkAsRead(notif);
    setOpen(false);

    const eventId = notif.event_id || notif.data?.event_id;
    if (!eventId) return;

    if (notif.notification_type === "rejected" || notif.notification_type === "needs_changes") {
      navigate(`/teacher/create-event?editEventId=${eventId}`);
    } else {
      navigate(`/teacher/events/${eventId}`);
    }
  };

  /* ---- Filtered list for history modal ---- */
  const filteredHistory = notifications.filter((n) => {
    if (historyFilter !== "all" && n.notification_type !== historyFilter) return false;
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      const matchTitle = (n.title || "").toLowerCase().includes(q);
      const matchMsg = (n.message || "").toLowerCase().includes(q);
      const matchEvent = (n.data?.event_name || "").toLowerCase().includes(q);
      return matchTitle || matchMsg || matchEvent;
    }
    return true;
  });

  /* ---- Render a single notification item ---- */
  const renderNotifItem = (notif, compact = false) => {
    const type = notif.notification_type || "approved";
    const iconCfg = NOTIF_ICON_MAP[type] || NOTIF_ICON_MAP.approved;
    const { Icon, color, bg } = iconCfg;

    const actionLabel =
      type === "rejected"
        ? "Edit & Resubmit"
        : type === "needs_changes"
        ? "Edit Event"
        : "View Event";

    const ActionIcon = type === "rejected" || type === "needs_changes" ? IconEdit : IconArrowRight;

    return (
      <div
        key={notif.id}
        onClick={() => handleNotifClick(notif)}
        className={`group relative cursor-pointer border-b border-slate-100 px-4 py-3.5 transition hover:bg-slate-50/80 last:border-b-0 ${
          !notif.is_read ? "bg-slate-50/50" : ""
        }`}
      >
        <div className="flex gap-3">
          {/* Icon */}
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg} ${color}`}>
            <Icon className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm leading-tight ${!notif.is_read ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                {notif.title || "Notification"}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {!notif.is_read && (
                  <span className="h-2 w-2 rounded-full bg-[#101A33] animate-pulse" />
                )}
                <span className="text-[11px] text-slate-400 whitespace-nowrap">
                  {timeAgo(notif.created_at)}
                </span>
              </div>
            </div>

            <p className={`mt-1 text-xs leading-relaxed ${!notif.is_read ? "text-slate-600" : "text-slate-500"} ${compact ? "line-clamp-2" : ""}`}>
              {notif.message}
            </p>

            {/* Contextual action button */}
            {notif.event_id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNotifClick(notif);
                }}
                className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  type === "rejected"
                    ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : type === "needs_changes"
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <ActionIcon className="h-3 w-3" />
                {actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Bell Button */}
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="relative inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        aria-label="Notifications"
      >
        <IconBell className={`h-5 w-5 transition-transform ${unreadCount > 0 ? "animate-[bellSwing_0.5s_ease-in-out]" : ""}`} />
        {displayBadge && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {displayBadge}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 z-50 w-[380px] max-h-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{ animation: "ccNotifFadeIn 0.2s ease-out" }}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#101A33] px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          {/* Notification List */}
          <div className="max-h-[340px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <div className="relative mb-3 h-8 w-8">
                  <div className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
                  <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-[#101A33]" />
                </div>
                <p className="text-xs text-slate-400">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <IconInbox />
                </div>
                <p className="text-sm font-medium text-slate-500">No notifications yet</p>
                <p className="mt-1 text-xs text-slate-400">
                  You'll be notified when events are approved or updated.
                </p>
              </div>
            ) : (
              notifications.slice(0, 8).map((n) => renderNotifItem(n, true))
            )}
          </div>

          {/* Panel Footer */}
          {notifications.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold transition ${
                  unreadCount > 0
                    ? "text-[#101A33] hover:text-[#D4AF6A]"
                    : "cursor-not-allowed text-slate-300"
                }`}
              >
                <IconCheckCheck className="h-3.5 w-3.5" />
                Mark all as read
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setHistoryOpen(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#101A33] hover:text-[#D4AF6A] transition"
              >
                View all notifications
                <IconArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notification History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
            style={{ animation: "ccNotifFadeIn 0.2s ease-out" }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Notification History
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {notifications.length} total • {unreadCount} unread
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {/* Search + Filter */}
            <div className="border-b border-slate-100 px-6 py-3 space-y-3">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <IconSearch />
                </div>
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search notifications..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:bg-white focus:ring-2 focus:ring-[#101A33]/15"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setHistoryFilter(tab.key)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      historyFilter === tab.key
                        ? "bg-[#101A33] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <IconInbox />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No matching notifications</p>
                  <p className="mt-1 text-xs text-slate-400">Try adjusting your search or filter.</p>
                </div>
              ) : (
                filteredHistory.map((n) => renderNotifItem(n, false))
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
                className={`inline-flex items-center gap-1.5 text-sm font-semibold transition ${
                  unreadCount > 0
                    ? "text-[#101A33] hover:text-[#D4AF6A]"
                    : "cursor-not-allowed text-slate-300"
                }`}
              >
                <IconCheckCheck className="h-4 w-4" />
                Mark all as read
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes bellSwing {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(3deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes ccNotifFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
