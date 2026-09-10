import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { API_BASE_URL } from "../../services/api";

function CreateDean() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  // =========================================================
  // Create Dean
  // =========================================================

  const handleCreateDean = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");
    setTemporaryPassword("");

    // Basic validation
    if (!name.trim() || !email.trim()) {
      setError("Please enter name and email.");
      return;
    }

    setLoading(true);

    try {
      // -----------------------------------------------------
      // Get currently logged-in user
      // -----------------------------------------------------

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


      // -----------------------------------------------------
      // Check Admin Profile
      // -----------------------------------------------------

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (profile?.role !== "admin") {
        setError("Only admin can create a Dean.");
        return;
      }


      // -----------------------------------------------------
      // Get Current Session
      // -----------------------------------------------------

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        navigate("/login");
        return;
      }


      // -----------------------------------------------------
      // Call FastAPI Backend
      // -----------------------------------------------------

      const response = await fetch(
        `${API_BASE_URL}/admin/create-dean`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },

          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
          }),
        }
      );


      // -----------------------------------------------------
      // Read Backend Response
      // -----------------------------------------------------

      const data = await response.json();


      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to create Dean account."
        );
      }


      // -----------------------------------------------------
      // Success
      // -----------------------------------------------------

      setSuccess(
        data.message || "Dean account created successfully."
      );

      setTemporaryPassword(
        data.temporary_password || ""
      );

      // Clear form
      setName("");
      setEmail("");


    } catch (err) {
      console.error("Create Dean Error:", err);

      setError(
        err?.message ||
          "Something went wrong while creating Dean account."
      );

    } finally {
      setLoading(false);
    }
  };


  // =========================================================
  // Logout
  // =========================================================

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };


  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="min-h-screen bg-gray-100 flex">

      {/* ================= SIDEBAR ================= */}

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
            onClick={() => navigate("/admin/dashboard")}
            className="w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition"
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
            className="w-full text-left px-4 py-3 rounded-lg bg-purple-50 text-purple-700 font-medium"
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


      {/* ================= MAIN CONTENT ================= */}

      <main className="flex-1 p-8">

        <div className="max-w-2xl mx-auto">


          {/* Header */}

          <div className="mb-8">

            <button
              onClick={() => navigate("/admin/dashboard")}
              className="text-sm text-blue-600 hover:text-blue-700 mb-4"
            >
              ← Back to Dashboard
            </button>

            <h2 className="text-3xl font-bold text-gray-900">
              Create Dean
            </h2>

            <p className="text-gray-500 mt-2">
              Create a new Dean account for Campus Capture.
            </p>

          </div>


          {/* Success */}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">

              <p className="text-green-700 font-medium">
                {success}
              </p>

              {temporaryPassword && (
                <div className="mt-3">

                  <p className="text-sm text-green-700">
                    Temporary Password:
                  </p>

                  <div className="mt-1 bg-white border border-green-300 rounded-lg px-4 py-3 font-mono text-gray-900">
                    {temporaryPassword}
                  </div>

                  <p className="text-xs text-green-600 mt-2">
                    Please save this password and share it securely with the Dean.
                  </p>

                </div>
              )}

            </div>
          )}


          {/* Error */}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">

              <p className="text-red-600">
                {error}
              </p>

            </div>
          )}


          {/* Form */}

          <div className="bg-white rounded-xl shadow-sm border p-8">

            <form
              onSubmit={handleCreateDean}
              className="space-y-6"
            >

              {/* Name */}

              <div>

                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Dean Name
                </label>

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter Dean name"
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />

              </div>


              {/* Email */}

              <div>

                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Dean Email
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter Dean email"
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />

              </div>


              {/* Submit */}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed transition"
              >
                {loading ? "Creating..." : "Create Dean"}
              </button>

            </form>

          </div>

        </div>

      </main>

    </div>
  );
}

export default CreateDean;
