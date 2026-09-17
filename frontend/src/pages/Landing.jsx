import { Link } from "react-router-dom";
import srhuLogo from "../assets/logo-srhu.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* =========================================================
          1. STICKY HEADER
          - Logo badge + "Campus Capture" wordmark on left
          - Single "Portal Login" button on right (links to /login)
          - max-w-6xl container, h-16 height
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
              <span className="block text-base font-bold leading-tight tracking-tight text-slate-900">
                Campus Capture
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                Swami Rama Himalayan University
              </span>
            </div>
          </div>

          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-xl bg-blue-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm shadow-blue-950/20 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-700/20"
          >
            Portal Login
          </Link>
        </div>
      </header>

      {/* =========================================================
          2. HERO SECTION
          - Full-bleed mesh gradient background (#0a1226 -> #101e40 -> #1e1b4b)
          - Texture dot-matrix + dual soft radial glow
          - Centered content: SRHU badge, exact headline, supporting sentence
          - Single primary CTA button linking to /login ("Access Portal")
          - NO fabricated metrics/stats bar
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

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          {/* Institutional Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-medium text-blue-200 backdrop-blur-sm mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Swami Rama Himalayan University
          </div>

          {/* Headline - Reused verbatim from Login.jsx */}
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl sm:leading-tight">
            Manage campus events with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-blue-100">
              clarity and control.
            </span>
          </h1>

          {/* Supporting Sentence */}
          <p className="mx-auto mt-6 max-w-2xl text-base text-blue-100/80 font-normal sm:text-lg sm:leading-relaxed">
            A centralized university portal for faculty event proposals,
            administrative Dean reviews, and real-time status tracking across SRHU.
          </p>

          {/* Primary CTA */}
          <div className="mt-8 flex justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 px-6 py-3 text-sm font-semibold text-white border border-blue-400/30 shadow-lg shadow-black/30 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-700/30"
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
          3. FEATURE HIGHLIGHTS
          - Light/neutral background (bg-white / border-slate-200)
          - 4 cards describing real system capabilities:
            1. Create Event
            2. Approval Workflow
            3. Status Tracking
            4. Role-based Dashboards
          - Card style: rounded-2xl, border-slate-200/80, soft shadow
          - Inline SVGs only (no icon library)
      ========================================================== */}
      <section className="py-16 sm:py-24 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700">
              System Capabilities
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Built for university administrative operations
            </p>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              Designed around institutional workflows across departments,
              colleges, and administrative offices.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Feature 1: Create Event */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4 shadow-sm shadow-blue-950/20">
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
                Create Event
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Teachers submit new event proposals with titles, dates, venues,
                participant estimates, and supporting document attachments.
              </p>
            </div>

            {/* Feature 2: Approval Workflow */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4 shadow-sm shadow-blue-950/20">
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
                Approval Workflow
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Deans review incoming submissions in an administrative queue,
                inspect proposal details, and record formal approval or rejection.
              </p>
            </div>

            {/* Feature 3: Status Tracking */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4 shadow-sm shadow-blue-950/20">
                <svg
                  className="h-5 w-5"
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
              <h3 className="text-base font-bold text-slate-900">
                Status Tracking
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Teachers monitor real-time event status updates—pending, approved,
                or rejected—with immediate visual badges across their dashboard.
              </p>
            </div>

            {/* Feature 4: Role-based Dashboards */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white mb-4 shadow-sm shadow-blue-950/20">
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
                Role-based Dashboards
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Segmented views tailored for Teachers, Deans, and Administrators
                with strict row-level security and server-side verification.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          4. HOW IT WORKS
          - 4-step horizontal process on desktop
          - Connecting timeline track on desktop
          - Vertical stacked list on mobile
          - Exact real workflow:
            Teacher creates event -> Submits for review -> Dean approves/rejects -> Status visible to Teacher
      ========================================================== */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Workflow
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              How event approval works
            </p>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
              The four sequential stages of event proposal and administrative review.
            </p>
          </div>

          <div className="relative">
            {/* Connecting line on desktop */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute top-7 left-14 right-14 h-0.5 bg-slate-200"
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
                  Teacher drafts event details, specifies schedule and venue, and
                  attaches required documentation.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  2
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Submits for Review
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Proposal is submitted into the system and queued directly into
                  the Dean&apos;s pending review list.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  3
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Dean Approves / Rejects
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Dean evaluates event feasibility and attached files, then records
                  an approval or rejection decision.
                </p>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border-2 border-blue-900 text-base font-bold text-blue-900 shadow-sm mb-4">
                  4
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Status Visible to Teacher
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Decision is updated in real time on the teacher&apos;s dashboard
                  under approved or rejected status.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          5. FOOTER
          - SRHU name
          - "Campus Capture" wordmark
          - Copyright line
          - No fake social icons, no fake legal/privacy links
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
            <div>
              <p className="text-xs font-bold text-slate-900 leading-tight">
                Campus Capture
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
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
