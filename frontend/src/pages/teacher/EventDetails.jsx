import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
const IconArrowLeft = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const IconCalendar = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);
const IconTag = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.5 12.5 12.5 20.5a1.5 1.5 0 0 1-2.12 0l-6.88-6.88a1.5 1.5 0 0 1 0-2.12l8-8H18a2.5 2.5 0 0 1 2.5 2.5v6Z" />
    <circle cx="15.5" cy="8.5" r="1.25" />
  </svg>
);
const IconMapPin = ({ className = "h-[18px] w-[18px]" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 21.5s-7-6.4-7-11.6a7 7 0 0 1 14 0c0 5.2-7 11.6-7 11.6Z" />
    <circle cx="12" cy="9.8" r="2.4" />
  </svg>
);
const IconAlertTriangle = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </svg>
);
const IconImage = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 15.5 15.5 11l-9 8" />
  </svg>
);
const IconFilm = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M8 4.5v15M16 4.5v15M3.5 9h4.5M16 9h4.5M3.5 15h4.5M16 15h4.5" />
  </svg>
);
const IconPhoto = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 15.5 15.5 11l-9 8" />
  </svg>
);

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [media, setMedia] = useState([]);
  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==============================
  // Fetch Event Details
  // ==============================
  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      setError("");

      // Get logged-in user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/");
        return;
      }

      // Get user profile
      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // ==============================
      // Get Event
      // ==============================
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .eq("teacher_id", user.id)
        .single();

      if (eventError) {
        throw eventError;
      }

      setEvent(eventData);

      // ==============================
      // Get Event Media
      // ==============================
      const { data: mediaData, error: mediaError } = await supabase
        .from("event_media")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (mediaError) {
        throw mediaError;
      }

      setMedia(mediaData || []);
    } catch (err) {
      console.error("Event details error:", err);

      setError(
        err.message || "Unable to load event details."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventDetails();
  }, [eventId]);

  // ==============================
  // Logout
  // ==============================
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // ==============================
  // Status
  // ==============================
  const getStatusClass = (status) => {
    switch (status) {
      case "approved":
        return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";

      case "rejected":
        return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20";

      default:
        return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
    }
  };

  const getStatusDot = (status) => {
    switch (status) {
      case "approved":
        return "bg-emerald-500";

      case "rejected":
        return "bg-rose-500";

      default:
        return "bg-amber-500";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "approved":
        return "Approved";

      case "rejected":
        return "Rejected";

      default:
        return "Pending";
    }
  };

  // ==============================
  // Loading
  // ==============================
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F5F9]">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-11 w-11">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#101A33]"></div>
          </div>
          <p className="text-sm text-slate-500">
            Loading event details...
          </p>
        </div>
      </div>
    );
  }

  // ==============================
  // Error
  // ==============================
  if (error || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F5F9] px-4">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
          .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        `}</style>

        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-9 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <IconAlertTriangle className="h-6 w-6" />
          </div>

          <h2 className="font-display text-xl font-semibold text-slate-900">
            Event Not Found
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {error || "This event could not be found."}
          </p>

          <Link
            to="/teacher/my-events"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#101A33] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1B2748]"
          >
            <IconArrowLeft />
            Back to My Events
          </Link>
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
              Events you submit are reviewed by the Dean before they're published.
            </p>
          </div>

        </aside>

        {/* Main Content */}
        <main className="flex-1 px-5 py-8 lg:px-10">

          <div className="mx-auto max-w-5xl">

            {/* Back link */}
            <Link
              to="/teacher/my-events"
              className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#101A33] transition hover:text-[#c79a54]"
            >
              <IconArrowLeft />
              Back to My Events
            </Link>

            {/* ================= EVENT HERO HEADER ================= */}
            <div
              style={{ animation: "ccFadeUp 0.5s ease-out both" }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101A33] via-[#182449] to-[#1B2748] p-7 sm:p-9"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10"></div>
              <div className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full border border-[#D4AF6A]/20"></div>

              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D4AF6A]">
                    {event.event_type}
                  </p>

                  <h2 className="font-display mt-2 text-3xl font-semibold text-white sm:text-4xl">
                    {event.event_name}
                  </h2>

                  <p className="mt-2 text-sm text-slate-300">
                    Submitted by {profile?.name}
                  </p>
                </div>

                <span
                  className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold capitalize ${getStatusClass(
                    event.status
                  )}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(event.status)}`}></span>
                  {getStatusLabel(event.status)}
                </span>
              </div>

              {/* Info chips */}
              <div className="relative mt-7 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#D4AF6A]">
                    <IconCalendar />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Event Date
                    </p>
                    <p className="text-sm font-medium text-white">
                      {event.event_date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#D4AF6A]">
                    <IconTag />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Event Type
                    </p>
                    <p className="text-sm font-medium text-white">
                      {event.event_type}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#D4AF6A]">
                    <IconMapPin />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Location
                    </p>
                    <p className="text-sm font-medium text-white">
                      {event.location}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* ================= DESCRIPTION ================= */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Event Description
                </h3>
              </div>

              <div className="px-6 py-5">
                <p className="whitespace-pre-line text-sm leading-7 text-slate-600">
                  {event.description || "No description provided."}
                </p>
              </div>
            </div>

            {/* ================= REJECTION ================= */}
            {event.status === "rejected" && event.rejection_reason && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50">
                <div className="flex items-center gap-2.5 border-b border-rose-200/80 px-6 py-4">
                  <IconAlertTriangle className="h-5 w-5 text-rose-500" />
                  <h3 className="text-sm font-semibold text-rose-800">
                    Rejection Reason
                  </h3>
                </div>

                <div className="px-6 py-5">
                  <p className="whitespace-pre-line text-sm leading-6 text-rose-700">
                    {event.rejection_reason}
                  </p>
                </div>
              </div>
            )}

            {/* ================= MEDIA ================= */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md">

              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Event Media
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Photos and videos uploaded for this event.
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#101A33]/5 px-3 py-1.5 text-xs font-semibold text-[#101A33]">
                  {media.length} file{media.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-6">

                {/* No Media */}
                {media.length === 0 && (
                  <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 py-14 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <IconImage />
                    </div>
                    <p className="text-sm font-medium text-slate-500">
                      No photos or videos uploaded for this event.
                    </p>
                  </div>
                )}

                {/* Media Grid */}
                {media.length > 0 && (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

                    {media.map((item) => {
                      const isVideo = item.media_type === "video";

                      return (
                        <div
                          key={item.id}
                          className="group overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 shadow-sm transition hover:shadow-md"
                        >
                          {isVideo ? (
                            <video
                              src={item.media_url}
                              controls
                              preload="metadata"
                              className="h-52 w-full bg-black object-cover"
                            >
                              Your browser does not support video playback.
                            </video>
                          ) : (
                            <a
                              href={item.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden"
                            >
                              <img
                                src={item.media_url}
                                alt={event.event_name}
                                className="h-52 w-full object-cover transition duration-300 group-hover:scale-105"
                              />
                            </a>
                          )}

                          <div className="flex items-center gap-1.5 px-3.5 py-2.5">
                            {isVideo ? (
                              <IconFilm className="h-3.5 w-3.5 text-slate-400" />
                            ) : (
                              <IconPhoto className="h-3.5 w-3.5 text-slate-400" />
                            )}
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {isVideo ? "Video" : "Photo"}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                  </div>
                )}

              </div>
            </div>

          </div>

        </main>

      </div>
    </div>
  );
}

export default EventDetails;