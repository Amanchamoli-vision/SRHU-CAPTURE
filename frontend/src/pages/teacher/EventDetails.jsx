import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../services/supabase";

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
        return "bg-green-100 text-green-700";

      case "rejected":
        return "bg-red-100 text-red-700";

      default:
        return "bg-yellow-100 text-yellow-700";
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
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">

          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-900"></div>

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
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">

        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">

          <div className="mb-4 text-5xl">
            ⚠️
          </div>

          <h2 className="text-xl font-bold text-slate-800">
            Event Not Found
          </h2>

          <p className="mt-2 text-sm text-red-600">
            {error || "This event could not be found."}
          </p>

          <Link
            to="/teacher/my-events"
            className="mt-6 inline-block rounded-lg bg-blue-900 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
          >
            ← Back to My Events
          </Link>

        </div>

      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ================= NAVBAR ================= */}
      <header className="border-b bg-white shadow-sm">

        <div className="flex h-16 items-center justify-between px-6">

          <div>
            <h1 className="text-xl font-bold text-blue-900">
              Campus Capture
            </h1>

            <p className="text-xs text-slate-500">
              Swami Rama Himalayan University
            </p>
          </div>

          <div className="flex items-center gap-4">

            <div className="hidden text-right sm:block">

              <p className="text-sm font-semibold text-slate-700">
                {profile?.name || "Teacher"}
              </p>

              <p className="text-xs text-slate-500">
                Teacher
              </p>

            </div>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>

          </div>

        </div>

      </header>

      <div className="flex">

        {/* ================= SIDEBAR ================= */}
        <aside className="hidden min-h-[calc(100vh-64px)] w-64 border-r bg-white p-5 md:block">

          <nav className="space-y-2">

            <Link
              to="/teacher/dashboard"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Dashboard
            </Link>

            <Link
              to="/teacher/create-event"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              + Create Event
            </Link>

            <Link
              to="/teacher/my-events"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              My Events
            </Link>

          </nav>

        </aside>

        {/* ================= MAIN ================= */}
        <main className="flex-1 p-6">

          <div className="mx-auto max-w-5xl">

            {/* Back */}
            <Link
              to="/teacher/my-events"
              className="mb-5 inline-flex items-center text-sm font-semibold text-blue-700 hover:underline"
            >
              ← Back to My Events
            </Link>

            {/* ================= EVENT HEADER ================= */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

                <div>

                  <p className="mb-2 text-sm font-medium text-blue-700">
                    {event.event_type}
                  </p>

                  <h2 className="text-3xl font-bold text-slate-800">
                    {event.event_name}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    Submitted by {profile?.name}
                  </p>

                </div>

                <span
                  className={`inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold ${getStatusClass(
                    event.status
                  )}`}
                >
                  {getStatusLabel(event.status)}
                </span>

              </div>

              {/* ================= EVENT INFO ================= */}
              <div className="mt-8 grid gap-5 border-t pt-6 sm:grid-cols-2 lg:grid-cols-3">

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Event Date
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {event.event_date}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Event Type
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {event.event_type}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Location
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {event.location}
                  </p>
                </div>

              </div>

            </div>

            {/* ================= DESCRIPTION ================= */}
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

              <h3 className="text-lg font-bold text-slate-800">
                Event Description
              </h3>

              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
                {event.description || "No description provided."}
              </p>

            </div>

            {/* ================= REJECTION ================= */}
            {event.status === "rejected" && event.rejection_reason && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">

                <h3 className="text-lg font-bold text-red-800">
                  Rejection Reason
                </h3>

                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-red-700">
                  {event.rejection_reason}
                </p>

              </div>
            )}

            {/* ================= MEDIA ================= */}
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    Event Media
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Photos and videos uploaded for this event.
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {media.length} file{media.length !== 1 ? "s" : ""}
                </span>

              </div>

              {/* No Media */}
              {media.length === 0 && (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center">

                  <div className="text-4xl">
                    📷
                  </div>

                  <p className="mt-3 text-sm text-slate-500">
                    No photos or videos uploaded for this event.
                  </p>

                </div>
              )}

              {/* Media Grid */}
              {media.length > 0 && (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

                  {media.map((item) => {

                    const isVideo =
                      item.media_type === "video";

                    return (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                      >

                        {/* Video */}
                        {isVideo ? (
                          <video
                            src={item.media_url}
                            controls
                            preload="metadata"
                            className="h-56 w-full bg-black object-cover"
                          >
                            Your browser does not support video playback.
                          </video>
                        ) : (

                          /* Image */
                          <a
                            href={item.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={item.media_url}
                              alt={event.event_name}
                              className="h-56 w-full object-cover transition hover:scale-105"
                            />
                          </a>

                        )}

                        <div className="p-3">

                          <p className="text-xs font-semibold uppercase text-slate-400">
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

        </main>

      </div>

    </div>
  );
}

export default EventDetails;