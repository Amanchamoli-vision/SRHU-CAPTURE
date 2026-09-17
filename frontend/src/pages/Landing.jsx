import { Link } from "react-router-dom";
import srhuLogo from "../assets/logo-srhu.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-blue-600 selection:text-white scroll-smooth">
      {/* =========================================================
          1. STICKY HEADER (Attractive, Modern, Institutional)
          - Subtle top gradient accent line
          - Spacious, elegant h-20 height with backdrop-blur-xl
          - Enhanced logo badge with hover elevation
          - Center interactive section navigation links
          - High-contrast gradient "Portal Login" CTA with micro-interaction
      ========================================================== */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl shadow-xs">
        <div className="mx-auto flex h-18 sm:h-20 max-w-[1600px] items-center justify-between px-6 sm:px-8 lg:px-12">
          {/* Left Brand Mark */}
          <div className="flex items-center gap-4 sm:gap-4.5">
            <div className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-0 overflow-hidden shadow-sm ring-1 ring-slate-100/80 transition-all duration-200 hover:shadow-md hover:scale-105">
              <img
                src={srhuLogo}
                alt="SRHU Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="block text-xl sm:text-2xl font-black leading-tight tracking-tight text-slate-950">
                  Campus Capture
                </span>
                <span className="hidden sm:inline-flex items-center rounded-md bg-blue-50 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-blue-800 border border-blue-200/70">
                  SRHU
                </span>
              </div>
              <span className="block text-xs sm:text-sm font-semibold text-slate-500 tracking-normal mt-0.5">
                Swami Rama Himalayan University
              </span>
            </div>
          </div>

          {/* Middle Navigation & Status */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-3">
            <a
              href="#capabilities"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-blue-900 hover:bg-slate-100/80"
            >
              Capabilities
            </a>
            <a
              href="#workflow"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-blue-900 hover:bg-slate-100/80"
            >
              Workflow
            </a>
            <div className="h-4 w-px bg-slate-200 mx-1 hidden lg:block" />
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              System Online
            </span>
          </nav>

          {/* Right Action Button */}
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-900 via-blue-950 to-indigo-950 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-950/20 transition-all duration-200 hover:from-blue-800 hover:via-blue-900 hover:to-indigo-900 hover:shadow-lg hover:shadow-blue-950/30 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-700/20"
          >
            <span>Portal Login</span>
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
          </Link>
        </div>
      </header>

      {/* =========================================================
          2. HERO SECTION
          - Full-bleed mesh gradient background (#0a1226 -> #101e40 -> #1e1b4b)
          - Container: max-w-[1600px] mx-auto px-6 sm:px-8 lg:px-12
          - Main page heading is PERFECTLY CENTER-ALIGNED
          - Single primary CTA button linking to /login ("Access Portal")
      ========================================================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a1226] via-[#101e40] to-[#1e1b4b] text-white py-20 sm:py-28 lg:py-32">
        {/* Subtle dot-matrix background pattern */}
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
          className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl"
        />

        <div className="relative mx-auto max-w-[1600px] px-6 sm:px-8 lg:px-12 text-center">
          {/* Institutional Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-200 backdrop-blur-sm mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Swami Rama Himalayan University
          </div>

          {/* Main Page Heading - PERFECTLY CENTER-ALIGNED */}
          <h1 className="mx-auto max-w-5xl text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl sm:leading-tight text-center">
            Manage campus events{" "}
            <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-blue-100 font-extrabold tracking-tight">
              with clarity and control.
            </span>
          </h1>

          {/* Supporting Sentence - Center Aligned */}
          <p className="mx-auto mt-5 max-w-2xl text-base font-normal leading-relaxed text-blue-100/80 sm:text-lg text-center">
            A centralized university portal for faculty event proposals,
            administrative Dean reviews, and real-time status tracking across SRHU.
          </p>

          {/* Primary CTA - Center Aligned */}
          <div className="mt-8 flex justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 px-6 py-3 text-sm font-bold tracking-wide text-white border border-blue-400/30 shadow-lg shadow-black/30 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-700/30"
            >
              <span>Access Portal</span>
              <svg
                className="h-4 w-4"
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
        </div>
      </section>

      {/* =========================================================
          3. FEATURE HIGHLIGHTS ("System Capabilities")
          - Heading PERFECTLY CENTER-ALIGNED (text-center mx-auto)
          - Increased card titles (text-xl sm:text-2xl)
          - Increased card text size (text-base sm:text-lg)
          - Spacious padding (p-7 sm:p-8) for enhanced readability
      ========================================================== */}
      <section id="capabilities" className="py-16 sm:py-24 bg-white border-b border-slate-200 scroll-mt-28">
        <div className="mx-auto max-w-[1600px] px-6 sm:px-8 lg:px-12">
          {/* Section Heading - Centered */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-sm font-bold uppercase tracking-wider text-blue-700">
              System Capabilities
            </h2>
            <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Built for university administrative operations
            </p>
            <p className="mt-3 text-base sm:text-lg text-slate-500 leading-relaxed">
              Designed around institutional workflows across departments,
              colleges, and administrative offices.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Feature 1: Create Event */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-7 sm:p-8 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-900 text-white mb-6 shadow-sm shadow-blue-950/20">
                <svg
                  className="h-7 w-7"
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
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Create Event
              </h3>
              <p className="mt-3 text-base sm:text-lg leading-relaxed text-slate-600">
                Draft and submit comprehensive event proposals with schedules,
                venues, and official file attachments.
              </p>
            </div>

            {/* Feature 2: Approval Workflow */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-7 sm:p-8 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-900 text-white mb-6 shadow-sm shadow-blue-950/20">
                <svg
                  className="h-7 w-7"
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
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Approval Workflow
              </h3>
              <p className="mt-3 text-base sm:text-lg leading-relaxed text-slate-600">
                Inspect pending proposals and attached documents from an
                administrative queue to record formal decisions.
              </p>
            </div>

            {/* Feature 3: Status Tracking */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-7 sm:p-8 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-900 text-white mb-6 shadow-sm shadow-blue-950/20">
                <svg
                  className="h-7 w-7"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Status Tracking
              </h3>
              <p className="mt-3 text-base sm:text-lg leading-relaxed text-slate-600">
                Monitor live proposal review status across pending, approved, and
                rejected states directly from your dashboard.
              </p>
            </div>

            {/* Feature 4: Role-based Dashboards */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-7 sm:p-8 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-900 text-white mb-6 shadow-sm shadow-blue-950/20">
                <svg
                  className="h-7 w-7"
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
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Role-based Dashboards
              </h3>
              <p className="mt-3 text-base sm:text-lg leading-relaxed text-slate-600">
                Dedicated operational views and authorization boundaries tailored
                for Teachers, Deans, and Administrators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          4. HOW IT WORKS ("How event approval works")
          - Heading PERFECTLY CENTER-ALIGNED (text-center mx-auto)
          - Increased step titles (text-xl)
          - Increased step text size (text-base sm:text-lg)
          - 4-step horizontal process on desktop, vertical list on mobile
      ========================================================== */}
      <section id="workflow" className="py-16 sm:py-24 bg-slate-50 scroll-mt-28">
        <div className="mx-auto max-w-[1600px] px-6 sm:px-8 lg:px-12">
          {/* Section Heading - Centered */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-sm font-bold uppercase tracking-wider text-blue-700">
              Workflow
            </h2>
            <p className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              How event approval works
            </p>
            <p className="mt-3 text-base sm:text-lg text-slate-500 leading-relaxed">
              The four sequential stages of event proposal and administrative review.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="relative flex flex-col items-start text-left">
              <div
                aria-hidden="true"
                className="hidden lg:block absolute top-7 left-14 -right-8 h-0.5 bg-slate-200"
              />
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-xl font-extrabold text-blue-900 shadow-sm mb-6 leading-none select-none">
                1
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                Teacher Creates Event
              </h3>
              <p className="mt-2.5 text-base sm:text-lg leading-relaxed text-slate-600">
                Faculty member compiles event schedule, venue requirements, and
                necessary documentation.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative flex flex-col items-start text-left">
              <div
                aria-hidden="true"
                className="hidden lg:block absolute top-7 left-14 -right-8 h-0.5 bg-slate-200"
              />
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-xl font-extrabold text-blue-900 shadow-sm mb-6 leading-none select-none">
                2
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                Submits for Review
              </h3>
              <p className="mt-2.5 text-base sm:text-lg leading-relaxed text-slate-600">
                Proposal enters the system and appears immediately in the Dean
                review queue.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative flex flex-col items-start text-left">
              <div
                aria-hidden="true"
                className="hidden lg:block absolute top-7 left-14 -right-8 h-0.5 bg-slate-200"
              />
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-xl font-extrabold text-blue-900 shadow-sm mb-6 leading-none select-none">
                3
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                Dean Approves / Rejects
              </h3>
              <p className="mt-2.5 text-base sm:text-lg leading-relaxed text-slate-600">
                Dean evaluates proposal feasibility, reviews attachments, and
                records an official decision.
              </p>
            </div>

            {/* Step 4 */}
            <div className="relative flex flex-col items-start text-left">
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-xl font-extrabold text-blue-900 shadow-sm mb-6 leading-none select-none">
                4
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                Status Visible to Teacher
              </h3>
              <p className="mt-2.5 text-base sm:text-lg leading-relaxed text-slate-600">
                Final decision is instantly updated on faculty dashboards and
                university calendars.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          5. FOOTER
          - Container: max-w-[1600px] mx-auto px-6 sm:px-8 lg:px-12
          - Wordmark (sm, bold) -> Subtitle (xs, medium) -> Copyright (xs, slate-400)
      ========================================================== */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-auto">
        <div className="mx-auto max-w-[1600px] px-6 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white p-1">
              <img
                src={srhuLogo}
                alt="SRHU Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">
                Campus Capture
              </p>
              <p className="text-xs font-medium text-slate-500">
                Swami Rama Himalayan University
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Swami Rama Himalayan University. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
