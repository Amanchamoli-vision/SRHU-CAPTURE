import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../services/supabase";
import srhuLogo from "../../assets/logo.png";
import {
  getTeacherDrafts,
  deleteTeacherDraft,
  duplicateEventAsDraft,
  decodeEventMetadata,
} from "../../utils/draftStorage";
import NotificationBell from "../../components/NotificationBell";

/* ============ Inline icons (no external icon library needed) ============ */
const IconLogout = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
  </svg>
);
const IconGrid = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);
const IconPlus = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconList = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
    <path d="M9 12h6M9 16h6M9 8.5h2" />
  </svg>
);
const IconArrowRight = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
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
const IconSearch = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const IconCalendar = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);
const IconFilter = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const IconRotateCcw = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M1 4v6h6" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);
const IconEdit = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconCopy = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconTrash = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconRefresh = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const IconX = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "published", label: "Published" },
];

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

  // Section 7: Search & Date Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all_time"); // "all_time", "today", "this_week", "this_month", "custom"
  const [customFromDate, setCustomFromDate] = useState("");
  const [customToDate, setCustomToDate] = useState("");

  // Delete modal state
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/login");
        return;
      }

      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // Fetch teacher's events from Supabase
      const { data: teacherEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (eventsError) throw eventsError;

      // Fetch local teacher drafts
      const teacherDrafts = getTeacherDrafts(user.id);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleTabClick = (tabKey) => {
    setSearchParams({ filter: tabKey });
  };

  // Section 7: Clear All Filters
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
        const { error: delErr } = await supabase
          .from("events")
          .delete()
          .eq("id", deletingEvent.id)
          .eq("teacher_id", profile.id);

        if (delErr) throw delErr;
        setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id));
      }

      setSuccessMessage("Event deleted successfully.");
      setDeletingEvent(null);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete event: " + (err.message || "Unknown error"));
    } finally {
      setDeletingLoading(false);
    }
  };

  // Combined events and drafts
  const allCombinedItems = [
    ...drafts.map((d) => ({
      ...d,
      isDraft: true,
      status: "draft",
    })),
    ...events.map((e) => ({
      ...e,
      isDraft: false,
    })),
  ];

  // Calculate tab counts
  const tabCounts = {
    all: allCombinedItems.length,
    draft: drafts.length,
    pending: events.filter(
      (e) => e.status === "pending" || e.status === "submitted" || e.status === "under_review"
    ).length,
    approved: events.filter((e) => e.status === "approved").length,
    rejected: events.filter((e) => e.status === "rejected").length,
    published: events.filter((e) => e.status === "published").length,
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
      return item.status === "pending" || item.status === "submitted" || item.status === "under_review";
    }
    if (activeFilter === "approved") return item.status === "approved";
    if (activeFilter === "rejected") return item.status === "rejected";
    if (activeFilter === "published") return item.status === "published";
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

  const getStatusBadge = (status) => {
    switch (status) {
      case "draft":
        return {
          label: "Draft",
          badgeClass: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300",
          dotClass: "bg-slate-400",
        };
      case "approved":
        return {
          label: "Approved",
          badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
          dotClass: "bg-emerald-500",
        };
      case "rejected":
        return {
          label: "Rejected",
          badgeClass: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
          dotClass: "bg-rose-500",
        };
      case "published":
        return {
          label: "Published",
          badgeClass: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20",
          dotClass: "bg-purple-500",
        };
      case "under_review":
        return {
          label: "Under Review",
          badgeClass: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20",
          dotClass: "bg-sky-500",
        };
      case "submitted":
      case "pending":
      default:
        return {
          label: "Pending",
          badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
          dotClass: "bg-amber-500",
        };
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F5F9]">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-11 w-11">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#101A33]"></div>
          </div>
          <p className="text-sm text-slate-500">Loading your events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F5F9]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        @keyframes ccFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex h-[76px] items-center justify-between px-6">
          <Link to="/teacher/dashboard" className="flex items-center gap-3.5">
            <img
              src={srhuLogo}
              alt="Swami Rama Himalayan University"
              className="h-12 sm:h-14 w-auto object-contain shrink-0"
            />
            <div>
              <h1 className="font-display text-lg font-semibold leading-tight text-[#101A33]">
                Campus Capture
              </h1>
              <p className="text-xs font-medium text-slate-400">
                Swami Rama Himalayan University
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#101A33] text-sm font-semibold text-white">
                {(profile?.name || "T").charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-slate-800">
                  {profile?.name || "Teacher"}
                </p>
                <p className="text-xs leading-tight text-slate-400">Teacher</p>
              </div>
            </div>

            <div className="relative">
              <NotificationBell currentUser={profile} />
            </div>

            <div className="hidden h-8 w-px bg-slate-200 sm:block"></div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <IconLogout />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-[76px] hidden h-[calc(100vh-76px)] w-64 shrink-0 flex-col bg-gradient-to-b from-[#101A33] to-[#1B2748] px-4 py-6 md:flex">
          <nav className="space-y-1.5">
            <Link
              to="/teacher/dashboard"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconGrid />
              Dashboard
            </Link>

            <Link
              to="/teacher/create-event"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconPlus className="h-[18px] w-[18px]" />
              Create Event
            </Link>

            <Link
              to="/teacher/my-events"
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-[#D4AF6A] bg-white/10 px-4 py-3 text-sm font-semibold text-white"
            >
              <IconList />
              My Events
            </Link>
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs leading-relaxed text-slate-300">
              Filter by date, keyword, and approval status.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-5 py-8 lg:px-10">
          {/* Header Row */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-3xl font-semibold text-slate-900">
                My Events
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Manage, search, filter, and track all your event proposals.
              </p>
            </div>

            <Link
              to="/teacher/create-event"
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#101A33] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#1B2748]"
            >
              <IconPlus />
              Create New Event
            </Link>
          </div>

          {/* Success Notification */}
          {successMessage && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <p className="text-sm font-medium text-emerald-800">{successMessage}</p>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <p className="text-sm font-medium text-rose-700">{error}</p>
            </div>
          )}

          {/* Section 7: Search and Filter Bar */}
          <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
            {/* Top row: Search input + Clear Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <IconSearch />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by event name, venue, or department..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none transition focus:border-[#101A33] focus:bg-white focus:ring-2 focus:ring-[#101A33]/15"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </div>

              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <IconRotateCcw />
                  Clear Filters
                </button>
              )}
            </div>

            {/* Middle row: Status Filters */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <IconFilter className="h-3.5 w-3.5" /> Status:
              </span>
              {STATUS_TABS.map((tab) => {
                const isSelected = activeFilter === tab.key;
                const count = tabCounts[tab.key] || 0;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabClick(tab.key)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? "bg-[#101A33] text-white shadow-sm"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-200/80 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bottom row: Date Filter Options */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <IconCalendar className="h-3.5 w-3.5" /> Date:
              </span>

              {[
                { key: "all_time", label: "All Dates" },
                { key: "today", label: "Today" },
                { key: "this_week", label: "This Week" },
                { key: "this_month", label: "This Month" },
                { key: "custom", label: "Custom Range" },
              ].map((df) => (
                <button
                  key={df.key}
                  type="button"
                  onClick={() => setDateFilter(df.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    dateFilter === df.key
                      ? "bg-[#D4AF6A] text-[#101A33] font-semibold shadow-sm"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                  }`}
                >
                  {df.label}
                </button>
              ))}

              {/* Custom Date Range Pickers */}
              {dateFilter === "custom" && (
                <div className="flex flex-wrap items-center gap-2 pl-2">
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 outline-none"
                    placeholder="From Date"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 outline-none"
                    placeholder="To Date"
                  />
                </div>
              )}

              {/* Active Results Summary */}
              <span className="ml-auto text-xs font-medium text-slate-400">
                Showing {filteredItems.length} of {allCombinedItems.length} events
              </span>
            </div>
          </div>

          {/* Events List / Table */}
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-md">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <IconInbox />
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-900">
                No events found.
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {isFiltered
                  ? "No events match the selected search keywords or filter criteria."
                  : "You haven't created any events yet."}
              </p>
              {isFiltered ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#101A33] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B2748]"
                >
                  <IconRotateCcw />
                  Clear Filters
                </button>
              ) : (
                <Link
                  to="/teacher/create-event"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#101A33] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1B2748]"
                >
                  <IconPlus />
                  Create An Event
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">
              {/* Desktop Table View */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Event
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Date
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Type
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Venue
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item) => {
                      const badge = getStatusBadge(item.status);
                      const { description: cleanDesc, meta } = decodeEventMetadata(item.description);
                      const canDelete =
                        item.status === "draft" ||
                        item.status === "pending" ||
                        item.status === "submitted" ||
                        item.status === "rejected";

                      return (
                        <tr
                          key={item.id}
                          className={`transition hover:bg-slate-50/80 ${
                            item.status === "rejected" ? "bg-rose-50/20" : ""
                          }`}
                        >
                          {/* Event Name & Department */}
                          <td className="px-6 py-4">
                            <div className="max-w-xs">
                              <p className="font-semibold text-slate-900">
                                {item.event_name || item.eventName || "Untitled Draft"}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-slate-400">
                                {item.department || meta.department ? `${item.department || meta.department} • ` : ""}
                                {cleanDesc || "No description"}
                              </p>
                            </div>

                            {/* Inline rejection reason callout */}
                            {item.status === "rejected" && item.rejection_reason && (
                              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                <span className="font-semibold">Rejection Reason:</span>{" "}
                                {item.rejection_reason}
                              </div>
                            )}
                          </td>

                          {/* Date */}
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.event_date || item.eventDate || <span className="text-slate-400 italic">Not set</span>}
                          </td>

                          {/* Type */}
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.event_type || item.eventType || <span className="text-slate-400 italic">Not set</span>}
                          </td>

                          {/* Venue */}
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.location || <span className="text-slate-400 italic">Not set</span>}
                          </td>

                          {/* Status */}
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badge.badgeClass}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`}></span>
                              {badge.label}
                            </span>
                          </td>

                          {/* Actions Column */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Draft Actions */}
                              {item.isDraft && (
                                <Link
                                  to={`/teacher/create-event?draftId=${item.id}`}
                                  title="Continue Editing Draft"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#101A33] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1B2748]"
                                >
                                  <IconEdit className="h-3 w-3" />
                                  Edit
                                </Link>
                              )}

                              {/* Rejected Event Action */}
                              {!item.isDraft && item.status === "rejected" && (
                                <Link
                                  to={`/teacher/create-event?editEventId=${item.id}`}
                                  title="Edit & Resubmit Event"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 shadow-sm"
                                >
                                  <IconRefresh className="h-3 w-3" />
                                  Resubmit
                                </Link>
                              )}

                              {/* View Details */}
                              {!item.isDraft && (
                                <Link
                                  to={`/teacher/events/${item.id}`}
                                  title="View Event Details"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                                >
                                  View
                                  <IconArrowRight className="h-3 w-3" />
                                </Link>
                              )}

                              {/* Duplicate Action */}
                              <button
                                type="button"
                                onClick={() => handleDuplicate(item)}
                                title="Duplicate as new Draft"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-[#D4AF6A] hover:bg-[#D4AF6A]/10 hover:text-[#101A33]"
                              >
                                <IconCopy />
                              </button>

                              {/* Delete Action */}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingEvent(item)}
                                  title="Delete Event"
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="space-y-4 p-4 md:hidden">
                {filteredItems.map((item) => {
                  const badge = getStatusBadge(item.status);
                  const { description: cleanDesc, meta } = decodeEventMetadata(item.description);
                  const canDelete =
                    item.status === "draft" ||
                    item.status === "pending" ||
                    item.status === "submitted" ||
                    item.status === "rejected";

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 ${
                        item.status === "rejected"
                          ? "border-rose-200 bg-rose-50/20"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-800">
                            {item.event_name || item.eventName || "Untitled Draft"}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {item.department || meta.department ? `${item.department || meta.department} • ` : ""}
                            {item.event_type || item.eventType || "No type set"}
                          </p>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badge.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`}></span>
                          {badge.label}
                        </span>
                      </div>

                      {item.status === "rejected" && item.rejection_reason && (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                          <span className="font-semibold">Rejection Reason:</span>{" "}
                          {item.rejection_reason}
                        </div>
                      )}

                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        <p>
                          <span className="font-medium text-slate-400">Date:</span>{" "}
                          {item.event_date || item.eventDate || "Not set"}
                        </p>
                        <p>
                          <span className="font-medium text-slate-400">Venue:</span>{" "}
                          {item.location || "Not set"}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        {item.isDraft ? (
                          <Link
                            to={`/teacher/create-event?draftId=${item.id}`}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#101A33] px-3 py-2 text-xs font-semibold text-white"
                          >
                            <IconEdit className="h-3 w-3" />
                            Continue Editing
                          </Link>
                        ) : item.status === "rejected" ? (
                          <Link
                            to={`/teacher/create-event?editEventId=${item.id}`}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
                          >
                            <IconRefresh className="h-3 w-3" />
                            Edit & Resubmit
                          </Link>
                        ) : (
                          <Link
                            to={`/teacher/events/${item.id}`}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-[#101A33]"
                          >
                            View Details
                            <IconArrowRight className="h-3 w-3" />
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDuplicate(item)}
                          title="Duplicate as new Draft"
                          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        >
                          <IconCopy className="h-4 w-4" />
                        </button>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingEvent(item)}
                            title="Delete Event"
                            className="rounded-xl border border-slate-200 p-2 text-rose-600 hover:bg-rose-50"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <IconAlertTriangle />
              </div>
              <div>
                <h4 className="font-display text-lg font-semibold text-slate-900">
                  Delete Event
                </h4>
                <p className="text-xs text-slate-500">
                  {deletingEvent.isDraft ? "Draft Event Deletion" : "Submitted Event Deletion"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="text-sm font-semibold text-slate-800">
                {deletingEvent.event_name || deletingEvent.eventName || "Untitled Event"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Venue: {deletingEvent.location || "Not set"} • Date: {deletingEvent.event_date || deletingEvent.eventDate || "Not set"}
              </p>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Are you sure you want to delete this event? This action will permanently remove it from your records.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingEvent(null)}
                disabled={deletingLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-700"
              >
                {deletingLoading ? "Deleting..." : "Delete Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyEvents;