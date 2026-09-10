import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

function DeanDashboard() {
  const navigate = useNavigate();

  const [deanName, setDeanName] = useState("");
  const [stats, setStats] = useState({
    total_events: 0,
    pending_events: 0,
    approved_events: 0,
    rejected_events: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    "http://127.0.0.1:8000";

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      // Get logged-in user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        navigate("/login");
        return;
      }

      // Get user profile
      const { data: profile, error: profileError } =
        await supabase
          .from("users")
          .select("name, email, role")
          .eq("id", user.id)
          .single();

      if (profileError) {
        throw profileError;
      }

      // Check Dean role
      if (profile.role !== "dean") {
        navigate("/login");
        return;
      }

      setDeanName(profile.name || "Dean");

      // Get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate("/login");
        return;
      }

      // Fetch dashboard statistics
      const response = await fetch(
        `${API_BASE_URL}/dean/dashboard/stats`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to load dashboard"
        );
      }

      setStats({
        total_events: data.total_events || 0,
        pending_events: data.pending_events || 0,
        approved_events: data.approved_events || 0,
        rejected_events: data.rejected_events || 0,
      });

    } catch (error) {
      console.error("Dean Dashboard Error:", error);

      setError(
        error.message || "Unable to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <header className="bg-white border-b">
        <div className="px-8 py-5 flex items-center justify-between">

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Dean Dashboard
            </h1>

            <p className="text-gray-500 mt-1">
              Welcome, {deanName || "Dean"}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Logout
          </button>

        </div>
      </header>


      {/* Main Content */}
      <main className="p-8">

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-lg">
            {error}
          </div>
        )}


        {/* Loading */}
        {loading ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <p className="text-gray-500">
              Loading dashboard...
            </p>
          </div>
        ) : (
          <>
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Total Events */}
              <div className="bg-white rounded-xl border shadow-sm p-6">
                <p className="text-sm text-gray-500">
                  Total Events
                </p>

                <h2 className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.total_events}
                </h2>
              </div>


              {/* Pending */}
              <div className="bg-white rounded-xl border shadow-sm p-6">
                <p className="text-sm text-gray-500">
                  Pending Events
                </p>

                <h2 className="text-3xl font-bold text-yellow-600 mt-2">
                  {stats.pending_events}
                </h2>
              </div>


              {/* Approved */}
              <div className="bg-white rounded-xl border shadow-sm p-6">
                <p className="text-sm text-gray-500">
                  Approved Events
                </p>

                <h2 className="text-3xl font-bold text-green-600 mt-2">
                  {stats.approved_events}
                </h2>
              </div>


              {/* Rejected */}
              <div className="bg-white rounded-xl border shadow-sm p-6">
                <p className="text-sm text-gray-500">
                  Rejected Events
                </p>

                <h2 className="text-3xl font-bold text-red-600 mt-2">
                  {stats.rejected_events}
                </h2>
              </div>

            </div>


            {/* Actions */}
            <div className="mt-8 bg-white rounded-xl border shadow-sm p-6">

              <h2 className="text-xl font-semibold text-gray-900">
                Event Management
              </h2>

              <p className="text-gray-500 mt-1">
                Review and manage events submitted by teachers.
              </p>


              <div className="mt-5 flex gap-4">

                <button
                  onClick={() => navigate("/dean/events")}
                  className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  View All Events
                </button>

                <button
                  onClick={loadDashboard}
                  className="px-5 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  Refresh
                </button>

              </div>

            </div>

          </>
        )}

      </main>

    </div>
  );
}

export default DeanDashboard;