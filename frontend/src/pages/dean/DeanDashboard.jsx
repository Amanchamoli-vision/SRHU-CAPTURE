import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../../services/supabase";
import { API_BASE_URL } from "../../services/api";

const PIE_COLORS = [
  "#101A33",
  "#D4AF6A",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#EC4899",
  "#84CC16",
  "#F97316",
  "#6366F1",
  "#A855F7",
];

/* ============ Inline icons (no external icon library needed) ============ */
const IconRefresh = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
    <path d="M4 4v4.5h4.5" />
    <path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
    <path d="M20 20v-4.5h-4.5" />
  </svg>
);
const IconLayers = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);
const IconClock = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const IconCheckCircle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </svg>
);
const IconXCircle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </svg>
);
const IconFilter = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 5h16M7 12h10M10 19h4" />
  </svg>
);
const IconX = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconPieChart = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5Z" />
  </svg>
);
const IconBarChart = ({ className = "h-9 w-9" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
  </svg>
);
const IconInbox = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 12h4l2 3h4l2-3h4" />
    <path d="M5.5 5h13l2 7v6a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18v-6l2-7Z" />
  </svg>
);
const IconAlertTriangle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </svg>
);
const IconGrid = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);
const IconCalendar = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
const IconBell = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);
const IconSparkle = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2Z" />
  </svg>
);

// ============================================
// TIME AGO HELPER
// ============================================
const timeAgo = (isoString) => {
  if (!isoString) return "";
  const seconds = Math.floor(
    (Date.now() - new Date(isoString).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function DeanDashboard() {
  const navigate = useNavigate();

  // ============================================
  // SIDEBAR VIEW STATE
  // ============================================

  const [activeView, setActiveView] = useState("dashboard"); // "dashboard" | "events"

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

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [error, setError] = useState("");

  // ============================================
  // NOTIFICATION STATES
  // ============================================

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toasts, setToasts] = useState([]);

  const filtersRef = useRef({ selectedDate: "", selectedEventType: "" });

  useEffect(() => {
    filtersRef.current = { selectedDate, selectedEventType };
  }, [selectedDate, selectedEventType]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ============================================
  // GET SUPABASE SESSION
  // ============================================

  const getSession = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      throw sessionError;
    }

    if (!session) {
      navigate("/login");
      return null;
    }

    return session;
  };

  // ============================================
  // AUTHORIZED FETCH (handles expired/invalid token)
  // ============================================

  const authorizedFetch = async (url, options = {}) => {
    const session = await getSession();

    if (!session) {
      return null;
    }

    const doFetch = (token) =>
      fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

    let response = await doFetch(session.access_token);

    if (response.status === 401) {
      console.warn(
        "Access token rejected (401). Attempting session refresh..."
      );

      const { data: refreshed, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !refreshed?.session) {
        console.error(
          "Session refresh failed, redirecting to login.",
          refreshError
        );

        await supabase.auth.signOut();
        navigate("/login");
        return null;
      }

      response = await doFetch(
        refreshed.session.access_token
      );

      if (response.status === 401) {
        console.error(
          "Still unauthorized after refresh, redirecting to login."
        );

        await supabase.auth.signOut();
        navigate("/login");
        return null;
      }
    }

    return response;
  };

  // ============================================
  // LOAD STATS
  // ============================================

  const loadStats = async () => {
    try {
      setLoadingStats(true);

      const response = await authorizedFetch(
        `${API_BASE_URL}/dean/dashboard/stats`,
        { method: "GET" }
      );

      if (!response) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Stats API failed: ${response.status}`
        );
      }

      const data = await response.json();

      setStats({
        total_events: data.total_events || 0,
        pending_events: data.pending_events || 0,
        approved_events: data.approved_events || 0,
        rejected_events: data.rejected_events || 0,
      });
    } catch (err) {
      console.error("Stats error:", err);
      setError("Unable to load dashboard statistics.");
    } finally {
      setLoadingStats(false);
    }
  };

  // ============================================
  // LOAD EVENTS
  // ============================================

  const loadEvents = async (
    date = "",
    eventType = ""
  ) => {
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

      const url = queryString
        ? `${API_BASE_URL}/dean/events?${queryString}`
        : `${API_BASE_URL}/dean/events`;

      const response = await authorizedFetch(url, {
        method: "GET",
      });

      if (!response) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Events API failed: ${response.status}`
        );
      }

      const data = await response.json();

      setEvents(data.events || []);
    } catch (err) {
      console.error("Events error:", err);

      setEvents([]);

      setError("Unable to load events.");
    } finally {
      setLoadingEvents(false);
    }
  };

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {
    loadStats();
    loadEvents("", "");
  }, []);

  // ============================================
  // REALTIME: NEW EVENT NOTIFICATIONS
  // ============================================

  useEffect(() => {
    const channel = supabase
      .channel("dean-new-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
        },
        (payload) => {
          const newEvent = payload.new;

          const notification = {
            id: `${newEvent.id}-${Date.now()}`,
            event_id: newEvent.id,
            event_name: newEvent.event_name || "Untitled Program",
            event_type: newEvent.event_type,
            created_at: newEvent.created_at || new Date().toISOString(),
            read: false,
          };

          // Add to notification list (bell dropdown)
          setNotifications((prev) => [notification, ...prev].slice(0, 30));

          // Show toast popup
          setToasts((prev) => [...prev, notification]);

          // Auto refresh stats + currently visible events
          loadStats();
          loadEvents(
            filtersRef.current.selectedDate,
            filtersRef.current.selectedEventType
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ============================================
  // AUTO-DISMISS TOASTS
  // ============================================

  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 5000);

    return () => clearTimeout(timer);
  }, [toasts]);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true }))
    );
  };

  const toggleNotifications = () => {
    setShowNotifications((prev) => {
      const next = !prev;
      if (next) markAllNotificationsRead();
      return next;
    });
  };

  const handleNotificationClick = (notification) => {
    setShowNotifications(false);
    setActiveView("events");
    navigate(`/dean/events/${notification.event_id}`);
  };

  // ============================================
  // GET UNIQUE EVENT TYPES
  // ============================================

  const eventTypes = useMemo(() => {
    const types = [];

    events.forEach((event) => {
      const type = event.event_type?.trim();

      if (!type) {
        return;
      }

      const alreadyExists = types.some(
        (existingType) =>
          existingType.toLowerCase() ===
          type.toLowerCase()
      );

      if (!alreadyExists) {
        types.push(type);
      }
    });

    return types;
  }, [events]);

  // ============================================
  // CREATE PIE CHART DATA
  // ============================================

  const eventTypeData = useMemo(() => {
    const typeMap = {};

    events.forEach((event) => {
      const rawType = event.event_type?.trim();

      if (!rawType) {
        return;
      }

      const existingKey = Object.keys(typeMap).find(
        (key) =>
          key.toLowerCase() ===
          rawType.toLowerCase()
      );

      if (existingKey) {
        typeMap[existingKey] += 1;
      } else {
        typeMap[rawType] = 1;
      }
    });

    return Object.entries(typeMap).map(([name, value]) => ({
      name,
      value,
    }));
  }, [events]);

  // ============================================
  // PIE CHART CLICK
  // ============================================

  const handlePieClick = (data) => {
    if (!data || !data.name) {
      return;
    }

    const clickedType = data.name;

    setSelectedEventType(clickedType);
    setActiveView("events");

    loadEvents(
      selectedDate,
      clickedType
    );
  };

  // ============================================
  // DATE FILTER
  // ============================================

  const handleDateChange = (event) => {
    const date = event.target.value;

    setSelectedDate(date);

    loadEvents(
      date,
      selectedEventType
    );
  };

  // ============================================
  // EVENT TYPE FILTER
  // ============================================

  const handleEventTypeChange = (event) => {
    const eventType = event.target.value;

    setSelectedEventType(eventType);

    loadEvents(
      selectedDate,
      eventType
    );
  };

  // ============================================
  // CLEAR FILTERS
  // ============================================

  const clearFilters = () => {
    setSelectedDate("");
    setSelectedEventType("");

    loadEvents("", "");
  };

  // ============================================
  // REFRESH
  // ============================================

  const refreshDashboard = async () => {
    setError("");

    await Promise.all([
      loadStats(),
      loadEvents(
        selectedDate,
        selectedEventType
      ),
    ]);
  };

  // ============================================
  // STATUS STYLE
  // ============================================

  const getStatusStyle = (status) => {
    switch (status?.toLowerCase()) {
      case "approved":
        return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
      case "rejected":
        return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20";
      case "pending":
        return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
      default:
        return "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/10";
    }
  };

  const getStatusDot = (status) => {
    switch (status?.toLowerCase()) {
      case "approved":
        return "bg-emerald-500";
      case "rejected":
        return "bg-rose-500";
      case "pending":
        return "bg-amber-500";
      default:
        return "bg-slate-400";
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-[#F3F5F9]">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        @keyframes ccFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ccToastIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes ccPulseRing { 0% { box-shadow: 0 0 0 0 rgba(212,175,106,0.55);} 70% { box-shadow: 0 0 0 8px rgba(212,175,106,0);} 100% { box-shadow: 0 0 0 0 rgba(212,175,106,0);} }
      `}</style>

      {/* ================= TOASTS ================= */}
      <div className="fixed right-5 top-[84px] z-50 flex w-[340px] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{ animation: "ccToastIn 0.3s ease-out both" }}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#101A33] text-[#D4AF6A]">
              <IconSparkle />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                New event submitted
              </p>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                {toast.event_name}
                {toast.event_type ? ` · ${toast.event_type}` : ""}
              </p>
              <button
                onClick={() => {
                  dismissToast(toast.id);
                  handleNotificationClick(toast);
                }}
                className="mt-1.5 text-xs font-semibold text-[#101A33] hover:text-[#c79a54]"
              >
                View event →
              </button>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              <IconX />
            </button>
          </div>
        ))}
      </div>

      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex h-[68px] items-center justify-between px-6">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101A33]">
              <span className="font-display text-sm font-semibold text-[#D4AF6A]">CC</span>
            </div>
            <div>
              <h1 className="font-display text-base font-semibold leading-tight text-[#101A33]">
                Campus Capture
              </h1>
              <p className="text-[11px] font-medium text-slate-400">
                Swami Rama Himalayan University
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">

            {/* NOTIFICATION BELL */}
            <div className="relative">
              <button
                onClick={toggleNotifications}
                style={
                  unreadCount > 0
                    ? { animation: "ccPulseRing 1.8s infinite" }
                    : undefined
                }
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              >
                <IconBell />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowNotifications(false)}
                  ></div>

                  <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Notifications
                      </p>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50"
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#101A33]/5 text-[#101A33]">
                              <IconCalendar className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {n.event_name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {n.event_type ? `${n.event_type} · ` : ""}
                                {timeAgo(n.created_at)}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={refreshDashboard}
              className="inline-flex items-center gap-2 rounded-lg bg-[#101A33] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B2748]"
            >
              <IconRefresh />
              Refresh
            </button>

          </div>

        </div>
      </header>

      <div className="flex">

        {/* ================= SIDEBAR ================= */}
        <aside className="sticky top-[68px] h-[calc(100vh-68px)] w-60 shrink-0 border-r border-slate-200 bg-white px-3 py-6">
          <nav className="space-y-1.5">

            <button
              onClick={() => setActiveView("dashboard")}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                activeView === "dashboard"
                  ? "bg-[#101A33] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <IconGrid className="h-5 w-5" />
              Dashboard
            </button>

            <button
              onClick={() => setActiveView("events")}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                activeView === "events"
                  ? "bg-[#101A33] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <IconCalendar className="h-5 w-5" />
              Events
              {events.length > 0 && (
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                    activeView === "events"
                      ? "bg-white/15 text-white"
                      : "bg-[#101A33]/5 text-[#101A33]"
                  }`}
                >
                  {events.length}
                </span>
              )}
            </button>

          </nav>
        </aside>

        {/* ================= MAIN ================= */}
        <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-10">

          {/* Hero */}
          <div
            style={{ animation: "ccFadeUp 0.5s ease-out both" }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
            <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

            <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
              Dean Dashboard
            </p>
            <h2 className="font-display relative mt-2 text-3xl font-semibold text-white sm:text-4xl">
              {activeView === "dashboard"
                ? "Campus Event Overview"
                : "All Campus Events"}
            </h2>
            <p className="relative mt-2 max-w-md text-sm text-slate-300">
              {activeView === "dashboard"
                ? "Review, filter, and track every event submitted across campus."
                : "Browse, filter, and manage every submitted event."}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <p className="text-sm font-medium text-rose-700">
                {error}
              </p>
            </div>
          )}

          {/* ================= DASHBOARD VIEW ================= */}
          {activeView === "dashboard" && (
            <>
              {/* STATS */}
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md">
                  <div className="absolute inset-y-0 left-0 w-1 bg-[#101A33]"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Total Events</p>
                      <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-slate-900">
                        {loadingStats ? "…" : stats.total_events}
                      </h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101A33]/5 text-[#101A33]">
                      <IconLayers />
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md">
                  <div className="absolute inset-y-0 left-0 w-1 bg-amber-500"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Pending</p>
                      <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-amber-600">
                        {loadingStats ? "…" : stats.pending_events}
                      </h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <IconClock />
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md">
                  <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Approved</p>
                      <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-emerald-600">
                        {loadingStats ? "…" : stats.approved_events}
                      </h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <IconCheckCircle />
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md">
                  <div className="absolute inset-y-0 left-0 w-1 bg-rose-500"></div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Rejected</p>
                      <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-rose-600">
                        {loadingStats ? "…" : stats.rejected_events}
                      </h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <IconXCircle />
                    </div>
                  </div>
                </div>

              </div>

              {/* PIE CHART */}
              <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">

                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">

                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#101A33]/5 text-[#101A33]">
                      <IconPieChart />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-slate-900">
                        Programs by Type
                      </h3>
                      <p className="text-sm text-slate-500">
                        Click a slice to view events by that program
                      </p>
                    </div>
                  </div>

                  {selectedEventType && (
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-full bg-[#101A33]/5 px-3 py-1.5 text-sm font-semibold text-[#101A33]">
                        {selectedEventType}
                      </span>
                      <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                      >
                        <IconX className="h-3.5 w-3.5" />
                        Show All
                      </button>
                    </div>
                  )}

                </div>

                <div className="p-6">
                  {loadingEvents ? (
                    <div className="flex h-[430px] items-center justify-center">
                      <div className="text-center">
                        <div className="relative mx-auto mb-4 h-10 w-10">
                          <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
                          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#101A33]"></div>
                        </div>
                        <p className="text-sm text-slate-500">Loading programs...</p>
                      </div>
                    </div>
                  ) : eventTypeData.length === 0 ? (
                    <div className="flex h-[430px] flex-col items-center justify-center text-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <IconBarChart />
                      </div>
                      <p className="text-lg font-medium text-slate-700">
                        No program data available
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Create some events to see the chart.
                      </p>
                    </div>
                  ) : (
                    <div className="h-[430px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>

                          <Pie
                            data={eventTypeData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            outerRadius={145}
                            innerRadius={65}
                            paddingAngle={3}
                            onClick={handlePieClick}
                            cursor="pointer"
                            label={({ name, value }) => `${name} (${value})`}
                            labelLine={true}
                          >
                            {eventTypeData.map((entry, index) => (
                              <Cell
                                key={`cell-${entry.name}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                                stroke="#ffffff"
                                strokeWidth={3}
                                opacity={
                                  selectedEventType &&
                                  selectedEventType.toLowerCase() !== entry.name.toLowerCase()
                                    ? 0.35
                                    : 1
                                }
                              />
                            ))}
                          </Pie>

                          <text
                            x="50%"
                            y="43%"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-slate-800"
                          >
                            <tspan x="50%" dy="-5" fontSize="28" fontWeight="700">
                              {events.length}
                            </tspan>
                            <tspan x="50%" dy="28" fontSize="13" fill="#6B7280">
                              Events
                            </tspan>
                          </text>

                          <Tooltip
                            formatter={(value, name) => [
                              `${value} Event${value !== 1 ? "s" : ""}`,
                              name,
                            ]}
                          />

                          <Legend verticalAlign="bottom" height={50} />

                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

              </div>
            </>
          )}

          {/* ================= EVENTS VIEW ================= */}
          {activeView === "events" && (
            <>
              {/* FILTERS */}
              <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">

                <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#101A33]/5 text-[#101A33]">
                    <IconFilter />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Filters
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-3">

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Filter by Date
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={handleDateChange}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Program Type
                    </label>
                    <select
                      value={selectedEventType}
                      onChange={handleEventTypeChange}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:ring-2 focus:ring-[#101A33]/15"
                    >
                      <option value="">All Programs</option>
                      {eventTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={clearFilters}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <IconX className="h-3.5 w-3.5" />
                      Clear Filters
                    </button>
                  </div>

                </div>

              </div>

              {/* EVENTS LIST */}
              <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">

                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">

                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">
                      {selectedEventType ? `${selectedEventType} Programs` : "All Programs"}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {events.length} event{events.length !== 1 ? "s" : ""} found
                    </p>
                  </div>

                  {selectedEventType && (
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <IconX className="h-3.5 w-3.5" />
                      View All Events
                    </button>
                  )}

                </div>

                {loadingEvents ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Loading events...
                  </div>
                ) : events.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-16 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <IconInbox />
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      No events found
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try changing the selected filters.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">

                    <table className="w-full text-left">

                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Program
                          </th>
                          <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Type
                          </th>
                          <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Date
                          </th>
                          <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Location
                          </th>
                          <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Status
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">

                        {events.map((event) => (
                          <tr key={event.id} className="transition hover:bg-slate-50/80">

                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold text-slate-800">
                                {event.event_name || "Untitled Program"}
                              </p>
                              {event.description && (
                                <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">
                                  {event.description}
                                </p>
                              )}
                            </td>

                            <td className="px-6 py-4">
                              <span className="inline-flex rounded-full bg-[#101A33]/5 px-3 py-1 text-sm font-medium text-[#101A33]">
                                {event.event_type || "—"}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-sm text-slate-600">
                              {event.event_date || "—"}
                            </td>

                            <td className="px-6 py-4 text-sm text-slate-600">
                              {event.location || "—"}
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusStyle(
                                  event.status
                                )}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(event.status)}`}></span>
                                {event.status || "Unknown"}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => navigate(`/dean/events/${event.id}`)}
                                className="text-sm font-semibold text-[#101A33] transition hover:text-[#c79a54]"
                              >
                                View
                              </button>
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

        </main>
      </div>
    </div>
  );
}
