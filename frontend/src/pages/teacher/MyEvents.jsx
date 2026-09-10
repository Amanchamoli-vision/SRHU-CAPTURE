import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

function MyEvents() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEvents = async () => {
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

      // Get profile
      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      // Role check
      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // Get teacher events
      const { data: teacherEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (eventsError) {
        throw eventsError;
      }

      setEvents(teacherEvents || []);
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
    navigate("/");
  };

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-900"></div>

          <p className="text-sm text-slate-500">
            Loading your events...
          </p>
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
              className="block rounded-lg bg-blue-900 px-4 py-3 text-sm font-semibold text-white"
            >
              My Events
            </Link>

          </nav>

        </aside>

        {/* ================= MAIN CONTENT ================= */}
        <main className="flex-1 p-6">

          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h2 className="text-2xl font-bold text-slate-800">
                My Events
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                View and track all your submitted events.
              </p>
            </div>

            <Link
              to="/teacher/create-event"
              className="rounded-lg bg-blue-900 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-blue-800"
            >
              + Create New Event
            </Link>

          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                {error}
              </p>
            </div>
          )}

          {/* ================= EVENT COUNT ================= */}
          <div className="mb-6 rounded-xl bg-white p-5 shadow-sm">

            <p className="text-sm text-slate-500">
              Total Submitted Events
            </p>

            <p className="mt-1 text-3xl font-bold text-blue-900">
              {events.length}
            </p>

          </div>

          {/* ================= EVENTS ================= */}
          {events.length === 0 ? (

            <div className="rounded-xl bg-white p-12 text-center shadow-sm">

              <div className="mb-4 text-5xl">
                📅
              </div>

              <h3 className="text-lg font-bold text-slate-800">
                No Events Yet
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                You haven't submitted any events yet.
              </p>

              <Link
                to="/teacher/create-event"
                className="mt-5 inline-block rounded-lg bg-blue-900 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Create Your First Event
              </Link>

            </div>

          ) : (

            <div className="overflow-hidden rounded-xl bg-white shadow-sm">

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto md:block">

                <table className="w-full text-left">

                  <thead className="bg-slate-50">

                    <tr>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Event
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Date
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Type
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-200">

                    {events.map((event) => (

                      <tr
                        key={event.id}
                        className="transition hover:bg-slate-50"
                      >

                        {/* Event */}
                        <td className="px-5 py-4">

                          <p className="text-sm font-semibold text-slate-800">
                            {event.event_name}
                          </p>

                          <p className="mt-1 max-w-xs truncate text-xs text-slate-400">
                            {event.description || "No description"}
                          </p>

                        </td>

                        {/* Date */}
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {event.event_date}
                        </td>

                        {/* Type */}
                        <td className="px-5 py-4">

                          <span className="text-sm text-slate-600">
                            {event.event_type}
                          </span>

                        </td>

                        {/* Location */}
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {event.location}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                              event.status
                            )}`}
                          >
                            {getStatusLabel(event.status)}
                          </span>

                        </td>

                        {/* Action */}
                        <td className="px-5 py-4">

                          <Link
                            to={`/teacher/events/${event.id}`}
                            className="text-sm font-semibold text-blue-700 hover:underline"
                          >
                            View Details
                          </Link>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

              {/* ================= MOBILE CARDS ================= */}
              <div className="space-y-4 p-4 md:hidden">

                {events.map((event) => (

                  <div
                    key={event.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >

                    <div className="flex items-start justify-between gap-3">

                      <div>
                        <h3 className="font-semibold text-slate-800">
                          {event.event_name}
                        </h3>

                        <p className="mt-1 text-xs text-slate-500">
                          {event.event_type}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          event.status
                        )}`}
                      >
                        {getStatusLabel(event.status)}
                      </span>

                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">

                      <p>
                        <span className="font-medium">
                          Date:
                        </span>{" "}
                        {event.event_date}
                      </p>

                      <p>
                        <span className="font-medium">
                          Location:
                        </span>{" "}
                        {event.location}
                      </p>

                    </div>

                    <Link
                      to={`/teacher/events/${event.id}`}
                      className="mt-4 block rounded-lg bg-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-blue-700 hover:bg-slate-200"
                    >
                      View Details
                    </Link>

                  </div>

                ))}

              </div>

            </div>

          )}

        </main>

      </div>

    </div>
  );
}

export default MyEvents;