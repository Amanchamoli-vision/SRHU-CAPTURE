import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
const IconEye = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
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
const IconActivity = ({ className = "h-3.5 w-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconAlertTriangle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </svg>
);
const IconCheck = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconX = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function TeacherDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [trackingEvent, setTrackingEvent] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/");
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

      // Fetch teacher's Supabase events
      const { data: teacherEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (eventsError) throw eventsError;

      // Fetch teacher's local drafts
      const teacherDrafts = getTeacherDrafts(user.id);

      setEvents(teacherEvents || []);
      setDrafts(teacherDrafts || []);
    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // Actions
  const handleDuplicate = (targetEvent) => {
    if (!profile) return;
    try {
      const newDraft = duplicateEventAsDraft(profile.id, targetEvent);
      setActionNotice(`Event "${targetEvent.event_name || targetEvent.eventName}" duplicated as draft.`);
      setTimeout(() => {
        navigate(`/teacher/create-event?draftId=${newDraft.id}`);
      }, 700);
    } catch (err) {
      console.error("Duplicate error:", err);
      alert("Failed to duplicate event.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEvent || !profile) return;
    try {
      setDeletingLoading(true);
      if (deletingEvent.isDraft) {
        deleteTeacherDraft(profile.id, deletingEvent.id);
      } else {
        const { error: delErr } = await supabase
          .from("events")
          .delete()
          .eq("id", deletingEvent.id)
          .eq("teacher_id", profile.id);
        if (delErr) throw delErr;
      }

      setActionNotice("Event deleted successfully.");
      setDeletingEvent(null);
      await fetchDashboardData();
      setTimeout(() => setActionNotice(""), 3500);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete event: " + (err.message || "Unknown error"));
    } finally {
      setDeletingLoading(false);
    }
  };

  // Summary counts
  const totalEvents = events.length + drafts.length;

  const pendingEvents = events.filter(
    (event) =>
      event.status === "pending" ||
      event.status === "submitted" ||
      event.status === "under_review"
  ).length;

  const approvedEvents = events.filter(
    (event) => event.status === "approved" || event.status === "published"
  ).length;

  const rejectedEvents = events.filter(
    (event) => event.status === "rejected"
  ).length;

  // Combine and sort recent events
  const recentCombinedList = [
    ...drafts.map((d) => ({ ...d, isDraft: true, status: "draft" })),
    ...events.map((e) => ({ ...e, isDraft: false })),
  ].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  const getStatusClass = (status) => {
    switch (status) {
      case "draft":
        return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300";
      case "approved":
        return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
      case "published":
        return "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20";
      case "rejected":
        return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20";
      case "under_review":
        return "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20";
      default:
        return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
    }
  };

  const getStatusDot = (status) => {
    switch (status) {
      case "draft":
        return "bg-slate-400";
      case "approved":
        return "bg-emerald-500";
      case "published":
        return "bg-purple-500";
      case "rejected":
        return "bg-rose-500";
      case "under_review":
        return "bg-sky-500";
      default:
        return "bg-amber-500";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "draft":
        return "Draft";
      case "approved":
        return "Approved";
      case "published":
        return "Published";
      case "rejected":
        return "Rejected";
      case "under_review":
        return "Under Review";
      default:
        return "Pending";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F5F9]">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-11 w-11">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#101A33]"></div>
          </div>
          <p className="text-sm text-slate-500">Loading dashboard...</p>
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
          <div className="flex items-center gap-3.5">
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
          </div>

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
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-[#D4AF6A] bg-white/10 px-4 py-3 text-sm font-semibold text-white"
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
              className="flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconList />
              My Events
            </Link>
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs leading-relaxed text-slate-300">
              Review event status, duplicate previous proposals, or submit new ones.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-5 py-8 lg:px-10">
          {/* Action notification toast */}
          {actionNotice && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <p className="text-sm font-medium text-emerald-800">{actionNotice}</p>
            </div>
          )}

          {/* Hero Header */}
          <div
            style={{ animation: "ccFadeUp 0.5s ease-out both" }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
            <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
                  Overview
                </p>
                <h2 className="font-display mt-2 text-3xl font-semibold text-white sm:text-4xl">
                  Teacher Portal
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Welcome back, {profile?.name || "Teacher"}. Manage your campus events and proposals.
                </p>
              </div>

              <Link
                to="/teacher/create-event"
                className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#D4AF6A] px-5 py-3 text-sm font-semibold text-[#101A33] shadow-lg shadow-black/20 transition hover:bg-[#c79a54]"
              >
                <IconPlus />
                Create New Event
              </Link>
            </div>
          </div>

          {/* Statistics - Clickable Summary Cards */}
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Events */}
            <Link
              to="/teacher/my-events?filter=all"
              className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md transition-all hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-[#101A33] transition-all group-hover:w-1.5"></div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 group-hover:text-slate-700">Total Events</p>
                  <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-slate-900">
                    {totalEvents}
                  </h3>
                  <p className="mt-2 text-xs font-semibold text-slate-400 group-hover:text-[#101A33]">
                    View all events →
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101A33]/5 text-[#101A33] transition group-hover:bg-[#101A33] group-hover:text-white">
                  <IconLayers />
                </div>
              </div>
            </Link>

            {/* Pending */}
            <Link
              to="/teacher/my-events?filter=pending"
              className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-amber-500 transition-all group-hover:w-1.5"></div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 group-hover:text-amber-700">Pending</p>
                  <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-amber-600">
                    {pendingEvents}
                  </h3>
                  <p className="mt-2 text-xs font-semibold text-amber-500 group-hover:text-amber-700">
                    View pending events →
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-500 group-hover:text-white">
                  <IconClock />
                </div>
              </div>
            </Link>

            {/* Approved */}
            <Link
              to="/teacher/my-events?filter=approved"
              className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500 transition-all group-hover:w-1.5"></div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 group-hover:text-emerald-700">Approved</p>
                  <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-emerald-600">
                    {approvedEvents}
                  </h3>
                  <p className="mt-2 text-xs font-semibold text-emerald-500 group-hover:text-emerald-700">
                    View approved events →
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-500 group-hover:text-white">
                  <IconCheckCircle />
                </div>
              </div>
            </Link>

            {/* Rejected */}
            <Link
              to="/teacher/my-events?filter=rejected"
              className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md transition-all hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-lg"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-rose-500 transition-all group-hover:w-1.5"></div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 group-hover:text-rose-700">Rejected</p>
                  <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-rose-600">
                    {rejectedEvents}
                  </h3>
                  <p className="mt-2 text-xs font-semibold text-rose-500 group-hover:text-rose-700">
                    View rejected events →
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition group-hover:bg-rose-500 group-hover:text-white">
                  <IconXCircle />
                </div>
              </div>
            </Link>
          </div>

          {/* Section 6: Dynamic Recent Events Table */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Recent Events
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Your recently created, modified, or submitted events
                </p>
              </div>

              <Link
                to="/teacher/my-events"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#101A33] transition hover:text-[#c79a54]"
              >
                View All Events
                <IconArrowRight />
              </Link>
            </div>

            {recentCombinedList.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <IconInbox />
                </div>
                <p className="text-sm font-medium text-slate-500">No events submitted or saved yet.</p>
                <Link
                  to="/teacher/create-event"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#101A33] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B2748]"
                >
                  <IconPlus />
                  Create Your First Event
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                        Venue
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {recentCombinedList.slice(0, 6).map((item) => {
                      const { description: cleanDesc } = decodeEventMetadata(item.description || "");
                      const canEdit = item.status === "draft" || item.status === "rejected";
                      const canDelete = item.status === "draft" || item.status === "pending" || item.status === "submitted" || item.status === "rejected";

                      return (
                        <tr key={item.id} className="transition hover:bg-slate-50/80">
                          {/* 1. Event Column */}
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900">
                              {item.event_name || item.eventName || "Untitled Draft"}
                            </p>
                            <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">
                              {cleanDesc || item.event_type || "No description"}
                            </p>
                          </td>

                          {/* 2. Date Column */}
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.event_date || item.eventDate || <span className="italic text-slate-400">Not set</span>}
                          </td>

                          {/* 3. Venue Column */}
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.location || <span className="italic text-slate-400">Not set</span>}
                          </td>

                          {/* 4. Status Column */}
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                item.status
                              )}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(item.status)}`}></span>
                              {getStatusLabel(item.status)}
                            </span>
                          </td>

                          {/* 5. Action Column (View, Edit, Duplicate, Delete, Track Status) */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Action */}
                              {!item.isDraft ? (
                                <Link
                                  to={`/teacher/events/${item.id}`}
                                  title="View Event Details"
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:border-[#101A33] hover:bg-[#101A33] hover:text-white"
                                >
                                  <IconEye />
                                </Link>
                              ) : (
                                <Link
                                  to={`/teacher/create-event?draftId=${item.id}`}
                                  title="View & Edit Draft"
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:border-[#101A33] hover:bg-[#101A33] hover:text-white"
                                >
                                  <IconEye />
                                </Link>
                              )}

                              {/* Edit Action (permitted only for draft and rejected) */}
                              {canEdit ? (
                                <Link
                                  to={
                                    item.isDraft
                                      ? `/teacher/create-event?draftId=${item.id}`
                                      : `/teacher/create-event?editEventId=${item.id}`
                                  }
                                  title="Edit Event"
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:border-amber-500 hover:bg-amber-50 hover:text-amber-700"
                                >
                                  <IconEdit />
                                </Link>
                              ) : (
                                <span
                                  title="Editing is not permitted in this approval status"
                                  className="cursor-not-allowed rounded-lg border border-slate-100 p-1.5 text-slate-300"
                                >
                                  <IconEdit />
                                </span>
                              )}

                              {/* Duplicate Action */}
                              <button
                                type="button"
                                onClick={() => handleDuplicate(item)}
                                title="Duplicate as new Draft"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:border-[#D4AF6A] hover:bg-[#D4AF6A]/10 hover:text-[#101A33]"
                              >
                                <IconCopy />
                              </button>

                              {/* Delete Action (if permitted) */}
                              {canDelete ? (
                                <button
                                  type="button"
                                  onClick={() => setDeletingEvent(item)}
                                  title="Delete Event"
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <IconTrash />
                                </button>
                              ) : (
                                <span
                                  title="Approved/Published events cannot be deleted"
                                  className="cursor-not-allowed rounded-lg border border-slate-100 p-1.5 text-slate-300"
                                >
                                  <IconTrash />
                                </span>
                              )}

                              {/* Track Status Action */}
                              <button
                                type="button"
                                onClick={() => setTrackingEvent(item)}
                                title="Track Approval Status"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition hover:border-sky-500 hover:bg-sky-50 hover:text-sky-700"
                              >
                                <IconActivity />
                              </button>
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

      {/* Track Status Modal */}
      {trackingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#D4AF6A]">
                  Status Tracking
                </span>
                <h4 className="font-display mt-1 text-xl font-semibold text-slate-900">
                  {trackingEvent.event_name || trackingEvent.eventName || "Untitled Event"}
                </h4>
                <p className="text-xs text-slate-500">
                  Date: {trackingEvent.event_date || trackingEvent.eventDate || "Not set"} • Location: {trackingEvent.location || "Not set"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTrackingEvent(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {/* Rejection notice if rejected */}
            {trackingEvent.status === "rejected" && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <div>
                    <p className="text-xs font-semibold text-rose-900">Rejection Reason:</p>
                    <p className="mt-0.5 text-xs text-rose-700">
                      {trackingEvent.rejection_reason || "No explicit rejection reason provided."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Visual Lifecycle Stages */}
            <div className="mt-7">
              {(() => {
                const status = trackingEvent.status || "pending";
                const isRejected = status === "rejected";
                const steps = [
                  { id: "draft", label: "Draft" },
                  { id: "submitted", label: "Submitted" },
                  { id: "under_review", label: "Under Review" },
                  { id: isRejected ? "rejected" : "approved", label: isRejected ? "Rejected" : "Approved" },
                  { id: "published", label: "Published" },
                ];

                let currentIdx = 0;
                if (status === "submitted" || status === "pending") currentIdx = 1;
                if (status === "under_review") currentIdx = 2;
                if (status === "approved" || isRejected) currentIdx = 3;
                if (status === "published") currentIdx = 4;

                return (
                  <div className="relative flex items-center justify-between">
                    <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-slate-200"></div>

                    {steps.map((step, idx) => {
                      const isPast = idx < currentIdx;
                      const isCurrent = idx === currentIdx;

                      let stepBg = "bg-slate-100 border-slate-300 text-slate-400";
                      let icon = <span className="text-xs font-bold">{idx + 1}</span>;

                      if (isPast) {
                        stepBg = "bg-emerald-600 border-emerald-600 text-white";
                        icon = <IconCheck className="h-4 w-4" />;
                      } else if (isCurrent) {
                        if (step.id === "rejected") {
                          stepBg = "bg-rose-600 border-rose-600 text-white ring-4 ring-rose-100";
                          icon = <IconX className="h-4 w-4" />;
                        } else if (step.id === "approved" || step.id === "published") {
                          stepBg = "bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-100";
                          icon = <IconCheck className="h-4 w-4" />;
                        } else {
                          stepBg = "bg-[#101A33] border-[#101A33] text-white ring-4 ring-slate-200";
                        }
                      }

                      return (
                        <div key={step.id} className="relative z-10 flex flex-col items-center">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${stepBg}`}>
                            {icon}
                          </div>
                          <span
                            className={`mt-2 text-[11px] font-semibold ${
                              isCurrent
                                ? step.id === "rejected"
                                  ? "text-rose-600"
                                  : "text-[#101A33]"
                                : isPast
                                ? "text-slate-800"
                                : "text-slate-400"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Actions inside Modal */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={() => setTrackingEvent(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {trackingEvent.status === "rejected" && (
                  <Link
                    to={`/teacher/create-event?editEventId=${trackingEvent.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                    Edit & Resubmit
                  </Link>
                )}

                {!trackingEvent.isDraft && (
                  <Link
                    to={`/teacher/events/${trackingEvent.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#101A33] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1B2748]"
                  >
                    View Full Details
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherDashboard;