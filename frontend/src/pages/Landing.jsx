import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import srhuLogo from "../assets/logo.png";

/* ============ Inline icons (no external icon library needed) ============ */
const IconArrowRight = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconMenu = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const IconX = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const IconCalendarPlus = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
  </svg>
);
const IconCheckSquare = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);
const IconUsers = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7" r="3.25" />
    <path d="M17 4.3a3.25 3.25 0 0 1 0 5.4M22 20v-1.5a4 4 0 0 0-3-3.87" />
  </svg>
);
const IconPaperclip = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.35 3.35 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  </svg>
);
const IconClock = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconShield = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9.5 12l2 2 3.5-4" />
  </svg>
);
const IconMail = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

const NAV_LINKS = [
  { href: "#roles", label: "Roles" },
  { href: "#workflow", label: "Workflow" },
  { href: "#platform", label: "Platform" },
];

/* The three vantage points the portal is actually built around. Each card
   lists what that role does once signed in — no marketing claims beyond it. */
const ROLES = [
  {
    icon: IconCalendarPlus,
    role: "Teachers",
    summary:
      "Compile a proposal once, with every detail the Dean needs to decide on it.",
    points: [
      "Date, time, venue, and department",
      "Organizer, contact, and expected participants",
      "Supporting documents and files",
    ],
  },
  {
    icon: IconCheckSquare,
    role: "Deans",
    summary:
      "Work a single queue of submissions instead of chasing email threads.",
    points: [
      "All pending proposals in one list",
      "Full details and attachments per event",
      "Approve or reject with a recorded decision",
    ],
  },
  {
    icon: IconUsers,
    role: "Super Admins",
    summary:
      "Hold the account structure the rest of the portal depends on.",
    points: [
      "Create and manage Dean accounts",
      "Review and maintain portal users",
      "Keep role boundaries enforced",
    ],
  },
];

const WORKFLOW = [
  {
    title: "Teacher creates event",
    body: "Faculty compile the schedule, venue requirements, and supporting documentation.",
  },
  {
    title: "Submits for review",
    body: "The proposal enters the system and appears in the Dean's review queue at once.",
  },
  {
    title: "Dean approves or rejects",
    body: "The Dean weighs feasibility, reads the attachments, and records an official decision.",
  },
  {
    title: "Status reaches the teacher",
    body: "The decision updates the faculty dashboard, so nobody has to ask.",
  },
];

const PLATFORM = [
  {
    icon: IconPaperclip,
    title: "Documents attached",
    body: "Proposal files travel with the event, not in a separate inbox.",
  },
  {
    icon: IconClock,
    title: "Status tracking",
    body: "Pending, approved, and rejected states, visible from the dashboard.",
  },
  {
    icon: IconShield,
    title: "Role-based access",
    body: "Teacher, Dean, and Super Admin views stay separated and enforced.",
  },
  {
    icon: IconMail,
    title: "Verified accounts",
    body: "Email confirmation and password recovery on university addresses.",
  },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  /* The panel is `md:hidden`, so widening past the breakpoint hides it while
     `menuOpen` — and the toggle's aria-expanded — stay stuck on true. Escape
     is the other way out people expect from an open menu. */
  useEffect(() => {
    if (!menuOpen) return undefined;

    const desktop = window.matchMedia("(min-width: 768px)");
    const close = () => setMenuOpen(false);
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    desktop.addEventListener("change", close);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      desktop.removeEventListener("change", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F5F9] text-slate-900 antialiased selection:bg-[#101A33] selection:text-white">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif; }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* =========================================================
          1. HEADER
          Matches the in-app header so the public page and the
          portal behind it read as one system.
      ========================================================== */}

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between gap-3 px-5 sm:gap-4 sm:px-8">

          {/* `min-w-0` + `truncate` together: without them the wordmark's
              nowrap ran straight under the Login button below ~360px. The
              smaller crest and tighter type below `sm` buy back the width
              that keeps "Campus Capture" whole on a 360px phone. */}
          <Link to="/" className="flex min-w-0 shrink items-center gap-2.5 sm:gap-3.5">
            <img
              src={srhuLogo}
              alt="Swami Rama Himalayan University"
              className="h-10 w-auto shrink-0 object-contain sm:h-14"
            />
            <div className="min-w-0">
              <span className="font-display block truncate text-[15px] font-semibold leading-tight text-[#101A33] sm:text-xl">
                Campus Capture
              </span>
              <span className="hidden truncate text-xs font-medium text-slate-500 sm:block">
                Swami Rama Himalayan University
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#101A33] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#101A33]/15"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">

            {/* Faculty without an account need a way in too, so the header
                carries both destinations. Below `sm` only Login stays, and
                Register moves into the menu, or the two crowd the logo. */}
            <Link
              to="/register"
              className="hidden shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-[#101A33] transition hover:border-[#101A33]/40 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-[#101A33]/10 sm:inline-flex"
            >
              Register
            </Link>

            <Link
              to="/login"
              className="group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#101A33] px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1B2748] focus:outline-none focus:ring-4 focus:ring-[#101A33]/15 sm:gap-2 sm:px-5"
            >
              <span className="sm:hidden">Login</span>
              <span className="hidden sm:inline">Portal Login</span>
              <IconArrowRight className="h-4 w-4 text-[#D4AF6A] transition-transform group-hover:translate-x-0.5" />
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#101A33]/15 md:hidden"
            >
              {menuOpen ? <IconX /> : <IconMenu />}
            </button>

          </div>

        </div>

        {/* The section anchors are desktop-only otherwise; this keeps them
            reachable on a phone, along with the Register button the narrow
            header drops. */}
        {menuOpen && (
          <nav
            id="landing-mobile-menu"
            className="border-t border-slate-200 bg-white px-5 py-2 md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {link.label}
              </a>
            ))}

            <Link
              to="/register"
              onClick={() => setMenuOpen(false)}
              className="mt-1 block border-t border-slate-200 px-3 pb-2 pt-3 text-sm font-semibold text-[#101A33]"
            >
              Create an account
            </Link>
          </nav>
        )}
      </header>

      {/* =========================================================
          2. HERO
          A single centred column: one headline, one real action.
          Nothing here stands in for the product — the portal is
          behind the login, so the page states what it does rather
          than mocking up a screen.
      ========================================================== */}

      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B1223] via-[#101A33] to-[#1B2748] text-white">

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[#D4AF6A]/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 left-1/2 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl"
        />

        <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1400px] flex-col px-5 py-14 sm:px-8">

          <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center py-8 text-center">

            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#D4AF6A] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF6A]" />
              Swami Rama Himalayan University
            </span>

            <h1 className="font-display mt-7 text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.75rem]">
              Manage campus events with{" "}
              <span className="text-[#D4AF6A]">clarity and control</span>.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              One university portal for faculty event proposals, Dean reviews,
              and status tracking across every department at SRHU.
            </p>

            {/* The two real destinations: sign in, or create the account
                first. "See how it works" drops to a quiet link below so it
                cannot compete with them. */}
            <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">

              <Link
                to="/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF6A] px-7 py-3.5 text-sm font-bold text-[#101A33] shadow-lg shadow-black/25 transition hover:bg-[#e0bf80] focus:outline-none focus:ring-4 focus:ring-[#D4AF6A]/30"
              >
                Sign in to the portal
                <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>

              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/15"
              >
                Create an account
              </Link>

            </div>

            <a
              href="#workflow"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 underline-offset-4 transition hover:text-[#D4AF6A] hover:underline"
            >
              See how it works
              <IconArrowRight className="h-3.5 w-3.5" />
            </a>

          </div>

          {/* A plain statement of the three-step spine of the portal. It sits
              under the headline so the hero closes on substance rather than
              empty space. */}
          <div className="mx-auto w-full max-w-5xl border-t border-white/10 pt-8">
            <dl className="grid grid-cols-1 gap-8 text-center sm:grid-cols-3 sm:gap-10 sm:text-left">
              {[
                ["Submit", "Faculty raise an event proposal with its documents."],
                ["Review", "The Dean decides from a single queue of submissions."],
                ["Track", "The outcome lands on the dashboard, on the record."],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-display text-lg font-semibold text-[#D4AF6A]">
                    {term}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-slate-300">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

        </div>
      </section>

      {/* =========================================================
          3. ROLES
      ========================================================== */}

      <section
        id="roles"
        className="scroll-mt-24 border-b border-slate-200 bg-white py-16 sm:py-24"
      >
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">

          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4AF6A]">
              Roles
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#101A33] sm:text-4xl">
              One portal, three vantage points
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500">
              Designed around how departments, colleges, and administrative
              offices already work.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {ROLES.map(({ icon: Icon, role, summary, points }) => (
              <article
                key={role}
                className="group flex flex-col rounded-2xl border border-slate-200/80 bg-[#F3F5F9]/60 p-7 transition hover:border-[#D4AF6A]/50 hover:bg-white hover:shadow-lg hover:shadow-slate-200/70"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#101A33] text-[#D4AF6A]">
                  <Icon />
                </div>

                <h3 className="font-display text-xl font-semibold text-[#101A33]">
                  {role}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {summary}
                </p>

                <ul className="mt-6 space-y-3 border-t border-slate-200/80 pt-5">
                  {points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm text-slate-700">
                      <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF6A]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

        </div>
      </section>

      {/* =========================================================
          4. WORKFLOW
      ========================================================== */}

      <section id="workflow" className="scroll-mt-24 bg-[#F3F5F9] py-16 sm:py-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">

          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4AF6A]">
              Workflow
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#101A33] sm:text-4xl">
              How event approval works
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500">
              Four sequential stages, from proposal to published decision.
            </p>
          </div>

          <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map((step, index) => (
              <li key={step.title} className="relative flex flex-col items-start">

                {index < WORKFLOW.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute -right-8 left-12 top-6 hidden h-px bg-slate-300 lg:block"
                  />
                )}

                <div className="font-display relative z-10 mb-5 flex h-12 w-12 select-none items-center justify-center rounded-xl border border-[#101A33]/15 bg-white text-lg font-semibold leading-none text-[#101A33] shadow-sm">
                  {index + 1}
                </div>

                <h3 className="font-display text-lg font-semibold text-[#101A33]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {step.body}
                </p>

              </li>
            ))}
          </ol>

        </div>
      </section>

      {/* =========================================================
          5. PLATFORM + CLOSING CTA
          One dark band so the page ends the way it opened.
      ========================================================== */}

      <section
        id="platform"
        className="scroll-mt-24 relative overflow-hidden bg-[#101A33]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20">

          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4AF6A]">
              Platform
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              What the portal takes care of
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-[#D4AF6A]/40 hover:bg-white/[0.07]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D4AF6A]/15 text-[#D4AF6A]">
                  <Icon />
                </div>
                <h3 className="font-display mt-4 text-base font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                  {body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-center gap-6 border-t border-white/10 pt-12 text-center md:flex-row md:justify-between md:text-left">

            <div>
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Ready to submit or review an event?
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Sign in with your university account, or register if this is
                your first visit.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">

              <Link
                to="/login"
                className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D4AF6A] px-7 py-3.5 text-sm font-bold text-[#101A33] shadow-lg shadow-black/20 transition hover:bg-[#e0bf80] focus:outline-none focus:ring-4 focus:ring-[#D4AF6A]/30"
              >
                Portal Login
                <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>

              <Link
                to="/register"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/15"
              >
                Register
              </Link>

            </div>

          </div>

        </div>
      </section>

      {/* =========================================================
          6. FOOTER
      ========================================================== */}

      <footer className="mt-auto border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 px-5 text-center sm:flex-row sm:px-8 sm:text-left">

          <div className="flex items-center gap-3">
            <img
              src={srhuLogo}
              alt="Swami Rama Himalayan University"
              className="h-10 w-auto object-contain"
            />
            <div>
              <p className="font-display text-sm font-semibold leading-tight text-[#101A33]">
                Campus Capture
              </p>
              <p className="text-xs font-medium text-slate-500">
                Swami Rama Himalayan University
              </p>
            </div>
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
