import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

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
      return "bg-green-100 text-green-700";
    }

    if (status === "rejected") {
      return "bg-red-100 text-red-700";
    }

    return "bg-yellow-100 text-yellow-700";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-900"></div>
          <p className="text-sm text-slate-500">
            Loading dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Navbar */}
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

        {/* Sidebar */}
        <aside className="hidden min-h-[calc(100vh-64px)] w-64 border-r bg-white p-5 md:block">

          <nav className="space-y-2">

            <Link
              to="/teacher/dashboard"
              className="block rounded-lg bg-blue-900 px-4 py-3 text-sm font-semibold text-white"
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

        {/* Main Content */}
        <main className="flex-1 p-6">

          {/* Welcome */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800">
              Welcome, {profile?.name || "Teacher"} 👋
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Manage your campus events and submissions.
            </p>
          </div>

          {/* Create Event Button */}
          <div className="mb-6 flex justify-end">
            <Link
              to="/teacher/create-event"
              className="rounded-lg bg-blue-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
            >
              + Create New Event
            </Link>
          </div>

          {/* Statistics */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Total Events
              </p>

              <h3 className="mt-2 text-3xl font-bold text-slate-800">
                {totalEvents}
              </h3>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Pending
              </p>

              <h3 className="mt-2 text-3xl font-bold text-yellow-600">
                {pendingEvents}
              </h3>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Approved
              </p>

              <h3 className="mt-2 text-3xl font-bold text-green-600">
                {approvedEvents}
              </h3>
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Rejected
              </p>

              <h3 className="mt-2 text-3xl font-bold text-red-600">
                {rejectedEvents}
              </h3>
            </div>

          </div>

          {/* Recent Events */}
          <div className="mt-8 rounded-xl bg-white shadow-sm">

            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Recent Events
                </h3>

                <p className="text-sm text-slate-500">
                  Your recently submitted events
                </p>
              </div>

              <Link
                to="/teacher/my-events"
                className="text-sm font-semibold text-blue-700 hover:underline"
              >
                View All
              </Link>
            </div>

            {events.length === 0 ? (

              <div className="p-10 text-center">
                <p className="text-slate-500">
                  No events submitted yet.
                </p>

                <Link
                  to="/teacher/create-event"
                  className="mt-4 inline-block rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Create Your First Event
                </Link>
              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full text-left">

                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-xs font-semibold uppercase text-slate-500">
                        Event Name
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase text-slate-500">
                        Date
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase text-slate-500">
                        Type
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">

                    {events.slice(0, 5).map((event) => (

                      <tr
                        key={event.id}
                        className="hover:bg-slate-50"
                      >

                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-700">
                            {event.event_name}
                          </p>

                          <p className="text-xs text-slate-400">
                            {event.location}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {event.event_date}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {event.event_type}
                        </td>

                        <td className="px-5 py-4">

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClass(
                              event.status
                            )}`}
                          >
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