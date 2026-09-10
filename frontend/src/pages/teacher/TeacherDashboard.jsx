import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

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

function TeacherDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Get logged-in user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/");
        return;
      }

      // Get teacher profile
      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      // Role protection
      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // Get teacher's events
      const { data: teacherEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (eventsError) {
        throw eventsError;
      }

      setEvents(teacherEvents || []);
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

  const totalEvents = events.length;

  const pendingEvents = events.filter(
    (event) => event.status === "pending"
  ).length;

  const approvedEvents = events.filter(
    (event) => event.status === "approved"
  ).length;

  const rejectedEvents = events.filter(
    (event) => event.status === "rejected"
  ).length;

  const getStatusClass = (status) => {
    if (status === "approved") {
      return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
    }

    if (status === "rejected") {
      return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20";
    }

    return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
  };

  const getStatusDot = (status) => {
    if (status === "approved") {
      return "bg-emerald-500";
    }

    if (status === "rejected") {
      return "bg-rose-500";
    }

    return "bg-amber-500";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F5F9]">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-11 w-11">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#101A33]"></div>
          </div>
          <p className="text-sm text-slate-500">
            Loading dashboard...
          </p>
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

          <div className="flex items-center gap-4">

            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#101A33] text-sm font-semibold text-white">
                {(profile?.name || "T").charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-slate-800">
                  {profile?.name || "Teacher"}
                </p>
                <p className="text-xs leading-tight text-slate-400">
                  Teacher
                </p>
              </div>
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
        <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-64 shrink-0 flex-col bg-gradient-to-b from-[#101A33] to-[#1B2748] px-4 py-6 md:flex">

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
              Events you submit are reviewed by the Dean before they're published.
            </p>
          </div>

        </aside>

        {/* Main Content */}
        <main className="flex-1 px-5 py-8 lg:px-10">

          {/* Hero / Welcome */}
          <div
            style={{ animation: "ccFadeUp 0.5s ease-out both" }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
            <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
                  Teacher Dashboard
                </p>
                <h2 className="font-display mt-2 text-3xl font-semibold text-white sm:text-4xl">
                  Welcome, {profile?.name || "Teacher"}
                </h2>
                <p className="mt-2 max-w-md text-sm text-slate-300">
                  Manage your campus events and submissions.
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

          {/* Statistics */}
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-md">
              <div className="absolute inset-y-0 left-0 w-1 bg-[#101A33]"></div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Events</p>
                  <h3 className="font-display mt-1.5 text-[32px] font-semibold leading-none text-slate-900">
                    {totalEvents}
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
                    {pendingEvents}
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
                    {approvedEvents}
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
                    {rejectedEvents}
                  </h3>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <IconXCircle />
                </div>
              </div>
            </div>

          </div>

          {/* Recent Events */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">

            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Recent Events
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Your recently submitted events
                </p>
              </div>

              <Link
                to="/teacher/my-events"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#101A33] transition hover:text-[#c79a54]"
              >
                View All
                <IconArrowRight />
              </Link>
            </div>

            {events.length === 0 ? (

              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <IconInbox />
                </div>
                <p className="text-sm font-medium text-slate-500">
                  No events submitted yet.
                </p>
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
                    <tr className="border-b border-slate-100">
                      <th className="px-6 py-3 text-xs font-semibold text-slate-500">
                        Event Name
                      </th>

                      <th className="px-6 py-3 text-xs font-semibold text-slate-500">
                        Date
                      </th>

                      <th className="px-6 py-3 text-xs font-semibold text-slate-500">
                        Type
                      </th>

                      <th className="px-6 py-3 text-xs font-semibold text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {events.slice(0, 5).map((event) => (

                      <tr
                        key={event.id}
                        className="transition hover:bg-slate-50/80"
                      >

                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {event.event_name}
                          </p>

                          <p className="mt-0.5 text-xs text-slate-400">
                            {event.location}
                          </p>
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {event.event_date}
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {event.event_type}
                        </td>

                        <td className="px-6 py-4">

                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClass(
                              event.status
                            )}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(event.status)}`}></span>
                            {event.status}
                          </span>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}

          </div>

        </main>

      </div>
    </div>
  );
}

export default TeacherDashboard;