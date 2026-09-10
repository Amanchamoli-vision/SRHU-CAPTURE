import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../services/supabase";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    // -----------------------------
    // Basic validation
    // -----------------------------
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      // -----------------------------
      // Sign in with Supabase
      // -----------------------------
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password,
        });

      if (loginError) {
        console.error("Supabase Login Error:", loginError);

        const message =
          loginError.message?.toLowerCase() || "";

        // Email not confirmed
        if (message.includes("email not confirmed")) {
          setError(
            "Your email is not confirmed. Please confirm your email before logging in."
          );
          return;
        }

        // Invalid credentials
        if (
          message.includes("invalid login credentials") ||
          message.includes("invalid login")
        ) {
          setError("Invalid email or password.");
          return;
        }

        // Other Supabase authentication errors
        setError(
          loginError.message ||
            "Unable to sign in. Please try again."
        );

        return;
      }

      // -----------------------------
      // Check authenticated user
      // -----------------------------
      const user = data?.user;

      if (!user) {
        setError("User account could not be found.");
        return;
      }

      // -----------------------------
      // Get user profile + role
      // -----------------------------
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error(
          "Profile Fetch Error:",
          profileError
        );

        // Sign out if profile cannot be loaded
        await supabase.auth.signOut();

        setError(
          "Unable to load your user profile. Please contact the administrator."
        );

        return;
      }

      if (!profile) {
        await supabase.auth.signOut();

        setError(
          "User profile not found. Please contact the administrator."
        );

        return;
      }

      // -----------------------------
      // Validate role
      // -----------------------------
      const role = profile.role?.toLowerCase();

      console.log("Logged-in user:", profile);

      // -----------------------------
      // Redirect according to role
      // -----------------------------
      if (role === "admin") {
        navigate("/admin/dashboard", {
          replace: true,
        });

        return;
      }

      if (role === "dean") {
        navigate("/dean/dashboard", {
          replace: true,
        });

        return;
      }

      if (role === "teacher") {
        navigate("/teacher/dashboard", {
          replace: true,
        });

        return;
      }

      // -----------------------------
      // Invalid role
      // -----------------------------
      await supabase.auth.signOut();

      setError(
        "Your account has an invalid role. Please contact the administrator."
      );
    } catch (err) {
      // -----------------------------
      // Unexpected error
      // -----------------------------
      console.error("Login Error:", err);

      const message =
        err?.message?.toLowerCase() || "";

      if (message.includes("email not confirmed")) {
        setError(
          "Your email is not confirmed. Please confirm your email before logging in."
        );
      } else if (
        message.includes("invalid login credentials") ||
        message.includes("invalid login")
      ) {
        setError("Invalid email or password.");
      } else {
        setError(
          err?.message ||
            "Something went wrong. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid overflow-hidden rounded-3xl shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/70 md:grid-cols-2">

        {/* =========================
            Left Branding Panel
        ========================== */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-10 text-white md:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2 8l10 5 10-5-10-5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold leading-tight">Campus Capture</p>
                <p className="text-xs text-blue-200">SRHU Event Management</p>
              </div>
            </div>

            <h2 className="mt-16 text-3xl font-bold leading-snug">
              Manage campus events with clarity and control.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-blue-100/90">
              A single, unified platform for teachers, deans, and admins to submit,
              review, and track campus events end to end.
            </p>
          </div>

          <div className="space-y-3 text-sm text-blue-100/80">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
              Streamlined event submission and approvals
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
              Real-time status tracking for every event
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
              Role-based dashboards for every stakeholder
            </div>
          </div>
        </div>

        {/* =========================
            Right Form Panel
        ========================== */}
        <div className="bg-white px-6 py-10 sm:px-10 md:py-12">
          <div className="mx-auto w-full max-w-sm">

            {/* Mobile-only brand mark */}
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2 8l10 5 10-5-10-5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
                </svg>
              </div>
              <p className="text-lg font-bold text-slate-900">Campus Capture</p>
            </div>

            {/* =========================
                Header
            ========================== */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Sign in to continue to your dashboard
              </p>
            </div>

            {/* =========================
                Error Message
            ========================== */}
            {error && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* =========================
                Login Form
            ========================== */}
            <form
              onSubmit={handleLogin}
              className="space-y-5"
            >

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M3 4a2 2 0 0 0-2 2v.35l9 5.4 9-5.4V6a2 2 0 0 0-2-2H3Z" />
                      <path d="M19 8.24 10.53 13.4a1 1 0 0 1-1.06 0L1 8.24V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.24Z" />
                    </svg>
                  </span>

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    placeholder="Enter your email"
                    autoComplete="email"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                    </svg>
                  </span>

                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Forgot Password */}
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Forgot password?
                </Link>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {loading
                  ? "Signing in..."
                  : "Sign In"}
              </button>
            </form>

            {/* =========================
                Register
            ========================== */}
            <div className="mt-8 text-center">
              <p className="text-sm text-slate-500">
                Don't have an account?{" "}
                <Link
                  to="/register"
                  className="font-semibold text-blue-700 hover:text-blue-800"
                >
                  Register
                </Link>
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export default Login;