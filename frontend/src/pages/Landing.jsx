import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
// White crest for the blue header and hero; the colour crest for the footer.
import srhuLogoWhite from "../assets/srhu-logo-dark.png";
import srhuLogo from "../assets/logo.png";
import RidgeCanvas from "../components/landing/RidgeCanvas";
import { trackOf } from "../components/teacher/status";
import { ROLE_TRACK } from "../components/common/roles";
import useThemeToggle from "../components/theme/useThemeToggle";
import {
  IconActivity,
  IconArrowRight,
  IconBell,
  IconCalendar,
  IconCheckCircle,
  IconFileText,
  IconFilm,
  IconImagePlus,
  IconMoon,
  IconShield,
  IconSun,
  IconUser,
  IconUserPlus,
  IconUsers,
  RidgeDivider,
} from "../components/teacher/icons";

/*
 * The public front door. Built from the same design system as the Teacher,
 * Dean and Super Admin screens -- the SRHU-blue header, amber actions, Sora
 * and Inter, the shared cards, chips and buttons, light and dark themes -- so
 * the page before sign-in and the portal after it read as one product.
 *
 * Everything described here is something the portal actually does.
 */

const NAV_LINKS = [
  { href: "#workflow", label: "How it works" },
  { href: "#roles", label: "Roles" },
  { href: "#features", label: "Features" },
];

// The five states the backend actually moves an event through, in order.
const STAGES = [
  {
    status: "draft",
    label: "Created",
    who: "Teacher",
    body: "The teacher fills in the event details and attaches photos, videos and documents. A draft can be saved and finished later.",
  },
  {
    status: "pending",
    label: "Pending review",
    who: "Teacher",
    body: "Submitting sends the proposal straight to the Dean's review queue, with everything attached.",
  },
  {
    status: "approved",
    label: "Approved",
    who: "Dean",
    body: "The Dean reads the proposal and approves it — or rejects it with feedback the teacher can act on and resubmit.",
  },
  {
    status: "in_progress",
    label: "In progress",
    who: "Dean",
    body: "Once the event is under way, the Dean marks it in progress. The teacher is emailed and notified.",
  },
  {
    status: "completed",
    label: "Completed",
    who: "Dean",
    body: "The Dean closes the event. Its full history stays on record, and a report can be generated.",
  },
];

const ROLES = [
  {
    key: "teacher",
    Icon: IconCalendar,
    role: "Teachers",
    summary: "Propose events once, with everything the Dean needs to decide.",
    points: [
      "Date, time, venue, department and coordinator",
      "Up to 4 photos, 2 videos and supporting documents",
      "Save drafts, duplicate past events, resubmit after feedback",
      "Track every event's status and get notified of decisions",
    ],
  },
  {
    key: "dean",
    Icon: IconCheckCircle,
    role: "Deans",
    summary: "Work one review queue instead of chasing email threads.",
    points: [
      "Every pending proposal in one list",
      "Full details, photos, videos and documents per event",
      "Approve, or reject with feedback the teacher sees",
      "Mark events in progress and completed; generate reports",
    ],
  },
  {
    key: "superadmin",
    Icon: IconUsers,
    role: "Super Admins",
    summary: "Keep the accounts the rest of the portal depends on.",
    points: [
      "Create Dean accounts; the temporary password is emailed",
      "Promote a teacher to Dean, or step a Dean back",
      "Review and remove accounts",
      "See accounts by role and events awaiting a decision",
    ],
  },
];

const FEATURES = [
  {
    Icon: IconFilm,
    title: "Photos and videos",
    body: "Images open full size and videos play right in the portal — for the teacher and the Dean.",
  },
  {
    Icon: IconFileText,
    title: "Supporting documents",
    body: "Agendas, budgets and letters travel with the proposal: PDF, Word, Excel or slides.",
  },
  {
    Icon: IconActivity,
    title: "Complete history",
    body: "Every submission, decision and remark is recorded with who made it and when.",
  },
  {
    Icon: IconBell,
    title: "Email and in-app alerts",
    body: "Teachers hear about approvals, rejections and progress without having to ask.",
  },
  {
    Icon: IconShield,
    title: "Role-based access",
    body: "Teacher, Dean and Super Admin views stay separate, on verified university email.",
  },
  {
    Icon: IconImagePlus,
    title: "Uploads that stay put",
    body: "Files save the moment they're picked, so a draft keeps them until it is ready.",
  },
];

/** Section heading, identical in every section. */
function SectionHead({ eyebrow, title, body }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {body && <p className="prose-muted mt-3 text-base">{body}</p>}
    </div>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, toggleTheme] = useThemeToggle();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  /* The header sits transparent over the hero and only gains its blur once
     the page moves; the 2px bar above it tracks how far down the visitor is. */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(y > 24);
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* The menu is a full-screen overlay below `lg`: lock the page behind it,
     close it on Escape, and close it if the window widens past the point
     where it is hidden -- otherwise `menuOpen` and aria-expanded stay stuck
     on true. */
  useEffect(() => {
    if (!menuOpen) return undefined;

    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => setMenuOpen(false);
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    desktop.addEventListener("change", close);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      desktop.removeEventListener("change", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const year = new Date().getFullYear();

  return (
    <div className="hv-root flex min-h-screen flex-col">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* ============================================================ header
          The festival site's header: transparent over the hero, gaining its
          translucent blur and hairline only once the page scrolls, with the
          accent-to-amber progress bar above it. */}
      <div id="hv-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />

      <header className={`landing-header ${scrolled || menuOpen ? "is-scrolled" : ""}`}>
        <nav
          className="mx-auto flex h-full w-full max-w-wrap items-center justify-between gap-3 px-5 sm:px-8"
          aria-label="Primary"
        >
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Campus Capture home">
            {/* The colour crest on the light page, the white one in the dark theme. */}
            <img
              src={dark ? srhuLogoWhite : srhuLogo}
              alt="Swami Rama Himalayan University"
              className="h-11 w-auto shrink-0 object-contain sm:h-13"
            />
            <div className="hidden min-w-0 leading-tight md:block">
              <p className="wordmark truncate text-ink">Campus Capture</p>
              <p className="truncate text-[11px] font-medium text-muted">
                Swami Rama Himalayan University
              </p>
            </div>
          </Link>

          <ul className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="nav-link">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-2">
            <Link to="/register" className="btn btn-ghost btn-sm hidden md:inline-flex">
              Register
            </Link>

            <Link to="/login" className="btn btn-primary btn-sm hidden sm:inline-flex">
              Sign in
              <IconArrowRight />
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              className="icon-btn"
              aria-pressed={dark}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              title={dark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={`hamburger lg:hidden ${menuOpen ? "is-open" : ""}`}
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <span /><span /><span />
            </button>
          </div>
        </nav>
      </header>

      {/* ------------------------------------------------------ mobile menu */}
      <div id="landing-menu" className={`hv-menu lg:hidden ${menuOpen ? "is-open" : ""}`}>
        <div className="mx-auto w-full max-w-wrap px-5 py-6 sm:px-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="menu-link"
            >
              {link.label}
            </a>
          ))}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link to="/login" onClick={() => setMenuOpen(false)} className="btn btn-primary btn-block">
              Sign in to the portal
              <IconArrowRight />
            </Link>
            <Link to="/register" onClick={() => setMenuOpen(false)} className="btn btn-ghost btn-block">
              Create a teacher account
            </Link>
          </div>
        </div>
      </div>

      <main id="main" tabIndex={-1} className="flex-1">
        {/* ============================================================= hero
            The festival front page: ridgelines drifting behind a faint grid,
            a centred institutional block, then the giant Sora title with one
            gradient-clipped word. The steps stand where the countdown stood;
            the three roles where the event tracks were listed. */}
        <section
          id="hero"
          className="relative overflow-hidden border-b hairline bg-ground"
          aria-label="Campus Capture"
        >
          <RidgeCanvas />
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-vignette-page" aria-hidden="true" />

          {/* Same hero as the festival site, sized to its content rather than the
              whole screen: title and actions beside the details, so the page
              below still shows. */}
          <div className="relative z-10 mx-auto w-full max-w-wrap px-5 pb-20 pt-24 sm:px-8 md:pb-20 md:pt-24">

            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
            <div className="min-w-0">
              <h1
                className="hero-title hero-title-xl reveal uppercase text-ink"
                style={{ "--i": 1 }}
              >
                Campus
                <br />
                {/* inline-block, not block: the gradient then spans the word
                    itself, so it reaches amber on the last letter. */}
                <span className="hero-accent inline-block">Capture</span>
              </h1>

              <p
                className="reveal mt-5 max-w-2xl font-display text-lg font-medium text-ink/90 sm:text-xl md:text-2xl"
                style={{ "--i": 2 }}
              >
                Campus events, proposed, approved and tracked in one place.
              </p>

              <div className="reveal mt-7 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ "--i": 3 }}>
                <Link to="/login" className="btn btn-primary">
                  Sign in to the portal
                  <IconArrowRight />
                </Link>
                <Link to="/register" className="btn btn-ghost">
                  Create a teacher account
                  <IconUserPlus />
                </Link>
              </div>
            </div>

            {/* The details column: what it does, the three steps, who uses it. */}
            <div className="min-w-0">

              <ul className="reveal flex flex-wrap gap-2" style={{ "--i": 4 }} aria-label="Key details">
                <li className="chip max-w-full whitespace-normal">
                  <IconCalendar />
                  Proposals with photos, videos and documents
                </li>
                <li className="chip max-w-full whitespace-normal">
                  <IconUsers />
                  One review queue for Deans
                </li>
                <li className="chip chip-ember max-w-full whitespace-normal">
                  <IconShield />
                  Every decision on the record
                </li>
              </ul>

              <div className="reveal mt-6" style={{ "--i": 5 }}>
                <p className="mb-3 text-xs uppercase tracking-[.18em] text-muted">How it works</p>
                <ol className="grid max-w-md grid-cols-3 gap-2">
                  {[
                    ["01", "Submit"],
                    ["02", "Review"],
                    ["03", "Track"],
                  ].map(([number, label]) => (
                    <li key={label} className="cd-tile">
                      <span className="cd-num text-ink">{number}</span>
                      <span className="cd-label">{label}</span>
                    </li>
                  ))}
                </ol>
              </div>


              <ul
                className="reveal mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted"
                style={{ "--i": 6 }}
                aria-label="Who uses it"
              >
                {[
                  ["Teachers", ROLE_TRACK.teacher],
                  ["Deans", ROLE_TRACK.dean],
                  ["Super Admins", ROLE_TRACK.superadmin],
                ].map(([label, track]) => (
                  <li key={label} className="badge" style={{ "--track": track }}>
                    <i />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            </div>

            <a
              href="#workflow"
              className="absolute bottom-20 right-5 hidden items-center gap-3 text-xs uppercase tracking-[.18em] text-muted md:flex"
              aria-label="Scroll to how it works"
            >
              Scroll <span className="scroll-cue" aria-hidden="true" />
            </a>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10" aria-hidden="true">
            <RidgeDivider className="divider text-accent/25" style={{ height: "4rem" }} />
          </div>
        </section>

        {/* ===================================================== how it works */}
        {/* A small, quiet gap after the hero's hairline edge, so the first
            section starts clearly on its own. */}
        <section id="workflow" className="mt-6 py-16 sm:mt-10 sm:py-24">
          <div className="mx-auto w-full max-w-wrap px-4 sm:px-6">
            <SectionHead
              eyebrow="How it works"
              title="From proposal to completed event"
              body="Five stages, the same ones you'll see on every event's tracker inside the portal."
            />

            <ol className="relative grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
              {/* The spine joining the five nodes on a wide screen. */}
              <span
                aria-hidden="true"
                className="absolute left-[10%] right-[10%] top-6 hidden h-0.5 bg-line/12 lg:block"
              />
              {STAGES.map((stage, index) => {
                const track = trackOf(stage.status);
                return (
                  <li
                    key={stage.status}
                    className="reveal relative flex flex-col lg:items-center lg:text-center"
                    style={{ "--i": index + 1 }}
                  >
                    <span
                      className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 bg-surface font-display text-base font-bold"
                      style={{
                        borderColor: track,
                        color: track,
                        boxShadow: `0 0 0 5px color-mix(in srgb, ${track} 14%, transparent)`,
                      }}
                    >
                      {index + 1}
                    </span>
                    <h3 className="mt-4 font-display text-base font-semibold text-ink">
                      {stage.label}
                    </h3>
                    <span
                      className="chip chip-sm chip-track mt-2 w-fit"
                      style={{ "--track": ROLE_TRACK[stage.who === "Teacher" ? "teacher" : "dean"] }}
                    >
                      <IconUser className="h-3 w-3" />
                      {stage.who}
                    </span>
                    <p className="prose-muted mt-3 text-sm">{stage.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ============================================================ roles */}
        <section id="roles" className="border-y hairline bg-surface py-16 sm:py-24">
          <div className="mx-auto w-full max-w-wrap px-4 sm:px-6">
            <SectionHead
              eyebrow="Roles"
              title="One portal, three roles"
              body="Each person sees the screens their job needs — nothing more."
            />

            <div className="grid gap-5 md:grid-cols-3">
              {ROLES.map(({ key, Icon, role, summary, points }, index) => (
                <article
                  key={key}
                  className="stat-card is-static reveal p-6"
                  style={{ "--track": ROLE_TRACK[key], "--i": index + 1 }}
                >
                  <span className="icon-tile icon-tile-track relative">
                    <Icon />
                  </span>
                  <h3 className="relative mt-5 font-display text-xl font-bold text-ink">{role}</h3>
                  <p className="prose-muted relative mt-1.5 text-sm">{summary}</p>

                  <ul className="relative mt-5 list-none space-y-2.5 border-t hairline p-0 pt-5">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-ink">
                        <span className="dot dot-sm mt-[0.45rem]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= features */}
        <section id="features" className="py-16 sm:py-24">
          <div className="mx-auto w-full max-w-wrap px-4 sm:px-6">
            <SectionHead
              eyebrow="Features"
              title="Everything an event proposal needs"
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, body }, index) => (
                <div
                  key={title}
                  className="glass reveal flex items-start gap-4 p-5"
                  style={{ "--i": index + 1 }}
                >
                  <span className="icon-tile shrink-0">
                    <Icon />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
                    <p className="prose-muted mt-1 text-sm">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================== cta */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="hv-band-dark relative mx-auto w-full max-w-wrap overflow-hidden rounded-3xl px-6 py-10 sm:px-10 sm:py-12">
            <div className="hero-grid opacity-30" aria-hidden="true" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ember/20 blur-3xl"
            />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  Ready to submit or review an event?
                </h2>
                <p className="mt-2 text-sm text-muted sm:text-base">
                  Sign in with your university account to reach your dashboard.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link to="/login" className="btn btn-primary">
                  Sign in to the portal
                  <IconArrowRight />
                </Link>
                <Link to="/register" className="btn btn-ghost">
                  Create a teacher account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* =========================================================== footer */}
      <footer className="border-t hairline bg-surface">
        <div className="mx-auto flex w-full max-w-wrap flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={dark ? srhuLogoWhite : srhuLogo}
              alt="Swami Rama Himalayan University"
              className="h-10 w-auto object-contain"
            />
            <div className="leading-tight">
              <p className="wordmark text-sm text-ink">Campus Capture</p>
              <p className="text-xs text-muted">Swami Rama Himalayan University</p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Footer">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-muted transition hover:text-ink">
                {link.label}
              </a>
            ))}
            <Link to="/login" className="font-semibold text-accent transition hover:underline">
              Sign in
            </Link>
          </nav>

          <p className="text-xs text-muted">© {year} Swami Rama Himalayan University</p>
        </div>
      </footer>
    </div>
  );
}
