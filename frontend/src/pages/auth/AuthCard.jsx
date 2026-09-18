import { Link } from "react-router-dom";
import srhuLogo from "../../assets/logo.png";
import useThemeToggle from "../../components/theme/useThemeToggle";
import {
  ContourWash,
  IconMoon,
  IconSun,
  RidgeDivider,
} from "../../components/teacher/icons";

/**
 * Shared shell for the small email-flow screens (verify email, forgot and
 * reset password). A single column, where Sign in and Register get the
 * two-panel `components/auth/AuthLayout` — these three are one short task
 * each, and a marketing panel beside them would be noise.
 */
export default function AuthCard({ eyebrow, title, subtitle, children, footer }) {
  const [dark, toggleTheme] = useThemeToggle();

  return (
    <div className="hv-root flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <div className="glass w-full max-w-md overflow-hidden">

        {/* The masthead is a permanently-dark island, the same device the
            Sign in screen uses for its institutional panel. */}
        <div className="theme-dark relative overflow-hidden px-7 py-6">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-vignette" aria-hidden="true" />
          <ContourWash className="contour-bg opacity-40" />

          <div className="relative flex items-center justify-between gap-3">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <img
                src={srhuLogo}
                alt="Swami Rama Himalayan University"
                className="h-11 w-auto shrink-0 rounded-lg bg-white/90 object-contain p-1"
              />
              <span className="min-w-0 leading-tight">
                <span className="wordmark block truncate text-ink">Campus Capture</span>
                <span className="block text-[11px] font-medium text-muted">
                  Swami Rama Himalayan University
                </span>
              </span>
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              className="icon-btn icon-btn-sm shrink-0"
              aria-pressed={dark}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              title={dark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>
          </div>

          <RidgeDivider className="divider pointer-events-none absolute inset-x-0 bottom-0 h-6 text-line/15" />
        </div>

        <div className="px-7 py-8 sm:px-9">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="h3 mt-1.5 text-2xl text-ink">{title}</h1>
          {subtitle && <p className="prose-muted mt-2 text-sm">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && (
            <div className="prose-muted mt-7 border-t hairline pt-5 text-sm">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthAlert({ tone = "error", children }) {
  if (!children) return null;

  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={`rounded-xl border px-4 py-3 text-sm font-medium text-ink ${
        tone === "success" ? "border-ok/35 bg-ok/8" : "border-err/35 bg-err/8"
      }`}
    >
      {children}
    </div>
  );
}

/* The two screens still passing raw class strings get the themed control
   classes through these, so their markup needs no change. */
export const inputClass = "input";

export const buttonClass = "btn btn-primary btn-block";
