import { Link } from "react-router-dom";
// White crest: the side panel is the SRHU-blue band, like the app header.
import srhuLogo from "../../assets/srhu-logo-dark.png";
import RidgeCanvas from "../landing/RidgeCanvas";
import useThemeToggle from "../theme/useThemeToggle";
import {
  IconArrowLeft,
  IconMoon,
  IconSun,
  RidgeDivider,
} from "../teacher/icons";

/**
 * The two-panel shell behind Sign in and Register.
 *
 * The left half is one of the theme's permanently-dark islands — the same
 * device the festival site uses for its registration band — carrying the
 * ridgeline, grid and contour motifs, so the institutional half stays dark
 * whichever theme the visitor is in. The right half is the form, on the
 * page's own surface.
 *
 * Below `md` the dark panel is dropped rather than stacked: on a phone it
 * would push the form a screen and a half down, and everything it says is
 * marketing.
 */
export default function AuthLayout({
  eyebrow,
  title,
  accent,
  blurb,
  bullets = [],
  formTitle,
  formSubtitle,
  children,
  footer,
}) {
  const [dark, toggleTheme] = useThemeToggle();

  return (
    <div className="hv-root flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <div className="glass relative w-full max-w-4xl overflow-hidden md:grid md:grid-cols-2">

        {/* ------------------------------------------------ the blue band
            The same hero as the landing page and every PageHero: drifting
            ridgelines under the grid, on the header's SRHU blue. */}
        <aside className="hv-band-dark relative hidden flex-col justify-between overflow-hidden p-8 md:flex lg:p-10">
          <RidgeCanvas />
          <div className="hero-grid" aria-hidden="true" />

          <div className="relative">
            <Link to="/" className="flex items-center gap-3">
              <img
                src={srhuLogo}
                alt="Swami Rama Himalayan University"
                className="h-11 w-auto shrink-0 object-contain"
              />
              <span className="min-w-0 leading-tight">
                <span className="wordmark block truncate text-ink">Campus Capture</span>
                <span className="block text-[11px] font-medium text-muted">
                  Swami Rama Himalayan University
                </span>
              </span>
            </Link>

            <div className="mt-10">
              {eyebrow && (
                <span className="chip chip-sm">
                  <span className="dot dot-sm" />
                  {eyebrow}
                </span>
              )}

              <h2 className="hero-title page-hero-title mt-4 uppercase text-ink">
                {title}
                {accent && (
                  <>
                    {" "}
                    <span className="hero-accent inline-block">{accent}</span>
                  </>
                )}
              </h2>

              {blurb && <p className="prose-muted mt-3 text-sm">{blurb}</p>}
            </div>
          </div>

          {bullets.length > 0 && (
            <ul className="relative mt-10 space-y-2.5 border-t hairline pt-6">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-xs text-muted">
                  <span className="dot dot-sm mt-1.5" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          <RidgeDivider className="divider pointer-events-none absolute inset-x-0 bottom-0 h-10 text-line/15" />
        </aside>

        {/* ------------------------------------------------------- the form */}
        <div className="relative flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-10">

          {/* Sits over the form half rather than the dark one, where it would
              read as part of the institutional panel. */}
          <button
            type="button"
            onClick={toggleTheme}
            className="icon-btn icon-btn-sm absolute right-4 top-4"
            aria-pressed={dark}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            title={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? <IconSun /> : <IconMoon />}
          </button>

          <div className="mx-auto w-full max-w-sm">

            {/* The way out. Both brand marks already link home, but a logo is
                not a control anyone reads as "go back", and someone who opened
                Sign in from the public page has no other route to it. Kept in
                flow, and short, so it clears the theme toggle opposite. */}
            <Link
              to="/"
              className="btn btn-ghost btn-sm mb-6 max-w-max pl-3 pr-3.5 text-muted"
            >
              <IconArrowLeft className="h-4 w-4" />
              Back to home
            </Link>

            {/* The dark panel is off-screen below md, so the brand mark and
                the one-line pitch come back here. */}
            <div className="mb-7 md:hidden">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src={srhuLogo}
                  alt="Swami Rama Himalayan University"
                  className="h-11 w-auto shrink-0 object-contain"
                />
                <span className="min-w-0 leading-tight">
                  <span className="wordmark block truncate">Campus Capture</span>
                  <span className="block text-[11px] font-medium text-muted">
                    Swami Rama Himalayan University
                  </span>
                </span>
              </Link>
            </div>

            <div className="mb-6">
              {eyebrow && <p className="eyebrow md:hidden">{eyebrow}</p>}
              <h1 className="h2 mt-1 text-3xl text-ink">{formTitle}</h1>
              {formSubtitle && (
                <p className="prose-muted mt-2 text-sm">{formSubtitle}</p>
              )}
            </div>

            {children}

            {footer && (
              <div className="mt-7 border-t hairline pt-5 text-center text-xs text-muted">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The banner both auth screens use for a failure or a confirmation. Tinted
 * from the theme's own error / success tokens rather than raw palette colours.
 */
export function AuthAlert({ tone = "error", icon, children }) {
  if (!children) return null;

  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={`mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
        tone === "success"
          ? "border-ok/35 bg-ok/8 text-ok"
          : "border-err/35 bg-err/8 text-err"
      }`}
    >
      {icon}
      <p className="min-w-0 flex-1 text-sm font-medium text-ink">{children}</p>
    </div>
  );
}
