import { Link } from "react-router-dom";
import srhuLogo from "../assets/logo-srhu.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* =========================================================
          Top Navigation Bar
      ========================================================== */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <img
                src={srhuLogo}
                alt="SRHU Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <span className="block text-base font-bold leading-tight text-slate-900">
                Campus Capture
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                Swami Rama Himalayan University
              </span>
            </div>
          </div>

          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-xl bg-blue-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            Portal Login
          </Link>
        </div>
      </header>

      {/* =========================================================
          Hero Section
      ========================================================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a1226] via-[#101e40] to-[#1e1b4b] text-white py-16 sm:py-24 lg:py-28">
        {/* Subtle grid background pattern */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Ambient soft glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl"
        />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          {/* Institutional Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-medium text-blue-200 backdrop-blur-sm mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Official SRHU Event Management & Approval System
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl sm:leading-tight lg:text-6xl">
            Manage campus events with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-blue-100">
              clarity and control.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-blue-100/85 sm:text-lg sm:leading-relaxed">
            A centralized university portal for faculty event submissions,
            Dean-level administrative reviews, and institutional tracking across
            Swami Rama Himalayan University.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900"
            >
              <span>Access Faculty Portal</span>
              <svg
                className="h-4 w-4 text-slate-700"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-6 text-center text-xs sm:text-sm font-medium text-blue-200/90">
            <div>Faculty Submissions</div>
            <div>Dean Review Queue</div>
            <div>Institutional Records</div>
          </div>
        </div>
      </section>

      {/* =========================================================
          Feature Highlights
      ========================================================== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700">
              System Capabilities
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Engineered for university administrative workflows
            </p>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              Every feature aligns with the actual operational roles and
              protocols established across SRHU schools and departments.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Event Creation */}
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="12" y1="14" x2="12" y2="18" />
                  <line x1="10" y1="16" x2="14" y2="16" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Structured Event Proposal
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Submit comprehensive event proposals with event titles, dates,
                venues, descriptions, and expected participant volumes.
              </p>
            </div>

            {/* Card 2: Document & Media Management */}
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Secure File Attachments
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Attach official approval documents (PDF/DOC up to 25MB) and media
                banners directly into isolated, secure university storage buckets.
              </p>
            </div>

            {/* Card 3: Dean Review Workflow */}
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Dean Review Pipeline
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Deans review pending department submissions with full attachment
                inspection and record formal approve or reject decisions.
              </p>
            </div>

            {/* Card 4: Role-Based Dashboards */}
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Role-Guarded Access
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Strict authorization boundaries isolate Teacher, Dean, and Admin
                views with server-verified credentials and row-level security.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          "How It Works" Section
      ========================================================== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Lifecycle
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              How event approval works
            </p>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              A transparent, 4-step sequence from faculty drafting to administrative
              approval.
            </p>
          </div>

          <div className="relative">
            {/* Connecting line on desktop */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute top-7 left-12 right-12 h-0.5 bg-slate-200"
            />

            <div className="grid gap-8 md:grid-cols-4 relative">
              {/* Step 1 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  1
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Teacher Creates Event
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Faculty member fills event schedule, venue details, and uploads
                  required documents.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  2
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Submission Queued
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  The event enters the system under pending status and appears in
                  the Dean&apos;s review list.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  3
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Dean Review
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Dean evaluates documentation and formally records an approval
                  or rejection decision.
                </p>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  4
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Status Confirmed
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Decision is immediately reflected on teacher dashboards and
                  the university calendar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          Pre-Footer Access Banner
      ========================================================== */}
      <section className="bg-gradient-to-r from-blue-900 to-indigo-900 py-12 text-white text-center px-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Swami Rama Himalayan University Faculty Portal
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-blue-100/80">
            Sign in with your authorized institutional account to access your
            dashboard.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* =========================================================
          Footer
      ========================================================== */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white p-1">
              <img
                src={srhuLogo}
                alt="SRHU Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <p className="text-xs text-slate-600 font-medium">
              Campus Capture · Swami Rama Himalayan University
            </p>
          </div>

          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Swami Rama Himalayan University. All
            rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
