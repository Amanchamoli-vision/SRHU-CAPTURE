import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

function AdminDashboard() {
  const navigate = useNavigate();

  const [adminName, setAdminName] = useState("Admin");
  const [stats, setStats] = useState({
    total_users: 0,
    teachers: 0,
    deans: 0,
    pending_events: 0,
  });

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    loadAdminDashboard();
  }, []);

  const loadAdminDashboard = async () => {
    try {
      // Get logged-in user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      // Get admin profile
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      // Only admin can access dashboard
      if (profile.role !== "admin") {
        navigate("/login");
        return;
      }

      setAdminName(profile.name || "Admin");

      // Get current Supabase session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate("/login");
        return;
      }

      // Call FastAPI
      const response = await fetch(
        `${API_BASE_URL}/admin/dashboard/stats`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || "Failed to fetch dashboard stats"
        );
      }

      const data = await response.json();

      setStats(data);
    } catch (error) {
      console.error("Admin Dashboard Error:", error);
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600 text-lg">
          Loading Admin Dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r min-h-screen p-5 flex flex-col">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Campus Capture
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Admin Panel
          </p>
        </div>

        <nav className="space-y-2">

          <button
            className="w-full text-left px-4 py-3 rounded-lg bg-blue-50 text-blue-700 font-medium"
          >
            Dashboard
          </button>

          <button
            onClick={() => navigate("/admin/users")}
            className="w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition"
          >
            User Management
          </button>

          <button
            onClick={() => navigate("/admin/create-dean")}
            className="w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition"
          >
            Create Dean
          </button>

        </nav>

        <div className="mt-auto pt-10">

          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition"
          >
            Logout
          </button>

        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">

        {/* Header */}
        <div className="mb-8">

          <h2 className="text-3xl font-bold text-gray-900">
            Welcome, {adminName}
          </h2>

          <p className="text-gray-500 mt-2">
            Manage Campus Capture users and administration.
          </p>

        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Total Users */}
          <div className="bg-white rounded-xl shadow-sm p-6 border">

            <p className="text-sm text-gray-500">
              Total Users
            </p>

            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {statsLoading ? "..." : stats.total_users}
            </h3>

          </div>

          {/* Teachers */}
          <div className="bg-white rounded-xl shadow-sm p-6 border">

            <p className="text-sm text-gray-500">
              Teachers
            </p>

            <h3 className="text-3xl font-bold text-blue-600 mt-2">
              {statsLoading ? "..." : stats.teachers}
            </h3>

          </div>

          {/* Deans */}
          <div className="bg-white rounded-xl shadow-sm p-6 border">

            <p className="text-sm text-gray-500">
              Deans
            </p>

            <h3 className="text-3xl font-bold text-purple-600 mt-2">
              {statsLoading ? "..." : stats.deans}
            </h3>

          </div>

          {/* Pending Events */}
          <div className="bg-white rounded-xl shadow-sm p-6 border">

            <p className="text-sm text-gray-500">
              Pending Events
            </p>

            <h3 className="text-3xl font-bold text-orange-500 mt-2">
              {statsLoading ? "..." : stats.pending_events}
            </h3>

          </div>

        </div>

        {/* Management Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* User Management */}
          <div className="bg-white rounded-xl shadow-sm border p-6">

            <h3 className="text-xl font-semibold text-gray-900">
              User Management
            </h3>

            <p className="text-gray-500 mt-2">
              View registered users and manage their roles.
            </p>

            <button
              onClick={() => navigate("/admin/users")}
              className="mt-5 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Manage Users
            </button>

          </div>

          {/* Create Dean */}
          <div className="bg-white rounded-xl shadow-sm border p-6">

            <h3 className="text-xl font-semibold text-gray-900">
              Create Dean
            </h3>

            <p className="text-gray-500 mt-2">
              Create a new Dean account for the university.
            </p>

            <button
              onClick={() => navigate("/admin/create-dean")}
              className="mt-5 px-5 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              Create Dean
            </button>

          </div>

        </div>

      </main>

    </div>
  );
}

export default AdminDashboard;