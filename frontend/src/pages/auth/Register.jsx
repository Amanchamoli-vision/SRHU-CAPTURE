import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../services/api";
import srhuLogo from "../../assets/logo.png";

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const passwordScore = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const strengthLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"][passwordScore];
  const strengthColor = [
    "bg-slate-200",
    "bg-red-400",
    "bg-amber-400",
    "bg-blue-500",
    "bg-emerald-500",
  ][passwordScore];

  const handleRegister = async (e) => {
    e.preventDefault();

    setMessage("");
    setError("");

    // Validation
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.detail || "Something went wrong. Please try again."
        );
      }

      setMessage(
        result.message ||
          "Account created successfully! Please check your email for verification."
      );

      // Clear form
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

    } catch (err) {
      console.error("Registration failed:", err);
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 md:py-12 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-4xl grid overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/60 md:grid-cols-2">

        {/* =========================
            Left Institutional Panel
        ========================== */}
        <div className="relative hidden md:flex flex-col justify-between bg-gradient-to-br from-[#0a1226] via-[#101e40] to-[#1e1b4b] p-8 lg:p-10 text-white overflow-hidden">
          {/* Subtle grid pattern matching Landing page */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* Ambient soft glow layers */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl"
          />

          <div className="relative z-10">
            {/* Top Brand & Institutional Badge */}
            <div className="flex items-center gap-3">
              <img
                src={srhuLogo}
                alt="SRHU Logo"
                className="h-12 w-auto object-contain"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="block text-base font-black leading-tight tracking-tight text-white">
                    Campus Capture
                  </span>
                  <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-200 border border-white/15">
                    SRHU
                  </span>
                </div>
                <span className="block text-xs font-medium text-blue-200/80">
                  Swami Rama Himalayan University
                </span>
              </div>
            </div>

            {/* Headline matching Landing typography */}
            <div className="mt-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-200 backdrop-blur-sm mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Faculty Portal Access
              </div>
              <h2 className="text-2xl lg:text-3xl font-extrabold leading-snug tracking-tight text-white">
                Campus events, organized end-to-end.
              </h2>
              <p className="mt-3 text-xs lg:text-sm leading-relaxed text-blue-100/80 font-normal">
                A unified institutional platform to create, manage, and track campus
                events across Swami Rama Himalayan University.
              </p>
            </div>
          </div>

          {/* Feature List matching Landing System Capabilities */}
          <div className="relative z-10 space-y-2.5 pt-8 text-xs text-blue-100/85 border-t border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <span>Create and submit event proposals in minutes</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <span>Structured Dean review & approval workflow</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <span>Tailored exclusively for SRHU academic workflows</span>
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
              <img
                src={srhuLogo}
                alt="SRHU Logo"
                className="h-12 w-auto object-contain"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="block text-base font-black text-slate-950 leading-tight">
                    Campus Capture
                  </span>
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-800 border border-blue-200/70">
                    SRHU
                  </span>
                </div>
                <span className="block text-xs font-medium text-slate-500">
                  Swami Rama Himalayan University
                </span>
              </div>
            </div>

            {/* Form Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-snug">
                Create your account
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 font-normal">
                Sign up with your faculty details to get started
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 shadow-sm"
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

            {/* Success Message */}
            {message && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 shadow-sm"
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-xs sm:text-sm font-medium text-emerald-800 leading-tight">
                  {message}
                </p>
              </div>
            )}

            {/* Register Form */}
            <form onSubmit={handleRegister} className="space-y-3.5" noValidate>

              {/* Full Name */}
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Full Name
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                    </svg>
                  </span>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. / Prof. Full Name"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700"
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
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@srhu.edu.in"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700"
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
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password (min. 6 characters)"
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {password && (
                  <div className="mt-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                            i < passwordScore ? strengthColor : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      Strength: <span className="font-semibold text-slate-700">{strengthLabel}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Confirm Password
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
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    disabled={loading}
                    className={`w-full rounded-xl border bg-white py-2 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:ring-4 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
                      confirmPassword && confirmPassword !== password
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                        : "border-slate-300 focus:border-blue-600 focus:ring-blue-600/10"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition"
                  >
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-[11px] font-medium text-red-500">
                    Passwords do not match
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-900 via-blue-950 to-indigo-950 py-3 px-4 text-sm font-bold text-white shadow-md shadow-blue-950/20 transition-all duration-200 hover:from-blue-800 hover:via-blue-900 hover:to-indigo-900 hover:shadow-lg hover:shadow-blue-950/30 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-700/20 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:from-blue-900 disabled:hover:shadow-md"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                <span>{loading ? "Creating account..." : "Create Faculty Account"}</span>
                {!loading && (
                  <svg
                    className="h-4 w-4 text-blue-200 transition-transform duration-200 group-hover:translate-x-1"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>

            </form>

            {/* Login Link */}
            <div className="mt-5 text-center border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                Already have an authorized account?{" "}
                <Link
                  to="/login"
                  className="font-bold text-blue-700 hover:text-blue-800 transition"
                >
                  Sign In
                </Link>
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export default Register;
