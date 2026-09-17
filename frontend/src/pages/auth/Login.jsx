import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { useAuth } from "../../context/AuthContext";
import srhuLogo from "../../assets/logo-srhu.png";

function Login() {
  const navigate = useNavigate();
  const { user: currentUser, role: currentRole, loading: authLoading, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if user already has an active authenticated session
  useEffect(() => {
    if (!authLoading && currentUser && currentRole) {
      if (currentRole === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (currentRole === "dean") {
        navigate("/dean/dashboard", { replace: true });
      } else if (currentRole === "teacher") {
        navigate("/teacher/dashboard", { replace: true });
      }
    }
  }, [currentUser, currentRole, authLoading, navigate]);

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

      if (profileError || !profile) {
        console.error(
          "Profile Fetch Error:",
          profileError
        );

        // Sign out and clear local storage if profile cannot be loaded
        await signOut();

        setError(
          "Unable to load your user profile. Please contact the administrator."
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
      await signOut();

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

  // Initial mount: subtle loading skeleton to prevent flash of content while AuthContext resolves
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 md:py-12">
        <div className="w-full max-w-4xl grid overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50 md:grid-cols-2 animate-pulse">
          <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-[#0a1226] via-[#101e40] to-[#1e1b4b] p-10">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-white/20" />
                <div className="space-y-1.5">
                  <div className="h-4 w-28 rounded bg-white/20" />
                  <div className="h-3 w-40 rounded bg-white/10" />
                </div>
              </div>
              <div className="mt-14 space-y-3">
                <div className="h-7 w-3/4 rounded bg-white/20" />
                <div className="h-7 w-1/2 rounded bg-white/20" />
                <div className="mt-4 h-4 w-5/6 rounded bg-white/10" />
              </div>
            </div>
            <div className="space-y-3 pt-6 border-t border-white/10">
              <div className="h-3.5 w-2/3 rounded bg-white/10" />
              <div className="h-3.5 w-1/2 rounded bg-white/10" />
            </div>
          </div>
          <div className="p-8 sm:p-10">
            <div className="h-6 w-36 rounded bg-slate-200 mb-2" />
            <div className="h-4 w-52 rounded bg-slate-100 mb-8" />
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="h-3.5 w-24 rounded bg-slate-200" />
                <div className="h-11 w-full rounded-xl bg-slate-100" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-20 rounded bg-slate-200" />
                <div className="h-11 w-full rounded-xl bg-slate-100" />
              </div>
              <div className="h-11 w-full rounded-xl bg-slate-200 mt-6" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 md:py-12 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-4xl grid overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/60 md:grid-cols-2">

        {/* =========================
            Left Institutional Panel
        ========================== */}
        <div className="relative hidden md:flex flex-col justify-between bg-gradient-to-br from-[#0a1226] via-[#101e40] to-[#1e1b4b] p-8 lg:p-10 text-white overflow-hidden">
          {/* Subtle grid pattern */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* Ambient soft glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl"
          />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-md shadow-black/20">
                <img
                  src={srhuLogo}
                  alt="SRHU Logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <span className="block text-base font-bold leading-tight tracking-tight text-white">
                  Campus Capture
                </span>
                <span className="block text-[11px] font-medium text-blue-200">
                  Swami Rama Himalayan University
                </span>
              </div>
            </div>

            <h2 className="mt-12 text-2xl lg:text-3xl font-extrabold leading-snug tracking-tight text-white">
              Manage campus events with clarity and control.
            </h2>
            <p className="mt-3 text-xs lg:text-sm leading-relaxed text-blue-100/80 font-normal">
              A unified institutional platform for faculty event submissions,
              Dean review workflows, and campus-wide event coordination.
            </p>
          </div>

          <div className="relative z-10 space-y-2.5 pt-8 text-xs text-blue-100/85 border-t border-white/10">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span>Role-segregated faculty and Dean access</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span>Structured proposal and attachment workflow</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span>Real-time status tracking across departments</span>
            </div>
          </div>
        </div>

        {/* =========================
            Right Form Panel
        ========================== */}
        <div className="bg-white px-6 py-8 sm:px-10 md:py-10 flex flex-col justify-center">
          <div className="mx-auto w-full max-w-sm">

            {/* Mobile-only brand mark */}
            <div className="mb-6 flex items-center gap-3 md:hidden">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 border border-slate-200 shadow-sm">
                <img
                  src={srhuLogo}
                  alt="SRHU Logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <span className="block text-base font-bold text-slate-900 leading-tight">
                  Campus Capture
                </span>
                <span className="block text-[11px] font-medium text-slate-500">
                  Swami Rama Himalayan University
                </span>
              </div>
            </div>

            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-snug">
                Welcome back
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 font-normal">
                Sign in with your authorized institutional credentials
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 shadow-sm"
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-xs sm:text-sm font-medium text-red-800 leading-tight">
                  {error}
                </p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Institutional Email
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M3 4a2 2 0 0 0-2 2v.35l9 5.4 9-5.4V6a2 2 0 0 0-2-2H3Z" />
                      <path d="M19 8.24 10.53 13.4a1 1 0 0 1-1.06 0L1 8.24V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.24Z" />
                    </svg>
                  </span>

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@srhu.edu.in"
                    autoComplete="email"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-700/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Password
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>

                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-700/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Forgot Password */}
              <div className="flex items-center justify-end pt-1">
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-blue-700 hover:text-blue-800 transition"
                >
                  Forgot password?
                </Link>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 py-2.5 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-950/20 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-700/20 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {loading ? "Signing in..." : "Sign In to Portal"}
              </button>
            </form>

            {/* Registration Link */}
            <div className="mt-6 text-center border-t border-slate-100 pt-5">
              <p className="text-xs text-slate-500">
                Need faculty account access?{" "}
                <Link
                  to="/register"
                  className="font-semibold text-blue-700 hover:text-blue-800"
                >
                  Register here
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