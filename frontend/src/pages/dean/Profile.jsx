import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchCurrentUser,
  requestPasswordReset,
  resendVerification,
  signOut,
} from "../../services/auth";
import DeanShell from "../../components/dean/DeanShell";
import { initialsOf, labelOfRole, trackOfRole } from "../../components/common/roles";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconCopy,
  IconGrid,
  IconInfo,
  IconKey,
  IconLogout,
  IconRefresh,
  IconShield,
  IconX,
} from "../../components/teacher/icons";

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// One row style for every quick action, link or button alike, so the column
// reads as a single menu.
const ACTION_CLASS =
  "flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-1.5 text-left transition hover:border-accent/25 hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-transparent disabled:hover:bg-transparent";

/**
 * The Dean's own account, laid out to fit one laptop screen without
 * scrolling: identity once at the top, the facts as a compact tile grid, and
 * everything the Dean can actually do from here in a single column beside it.
 * Name and email are shown once — the old layout repeated them in the hero
 * and again in the list, and the role three times.
 */
function DeanProfile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Feedback for the account actions, shown as a toast so it never pushes the
  // layout past the fold.
  const [notice, setNotice] = useState(null); // { kind: "ok" | "err", text }
  const [busy, setBusy] = useState(""); // key of the action in flight
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);

  // Also the Retry and Refresh handler, so a failed first load, a retry and a
  // manual refresh all take exactly the same path.
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const user = await fetchCurrentUser();

      if (!user) {
        navigate("/login");
        return;
      }

      setProfile(user);
      setAccount({
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        emailConfirmedAt: user.email_verified_at,
      });
    } catch (err) {
      console.error("Load dean profile error:", err);

      setError(err.message || "Unable to load your profile.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const handleLogout = async () => {
    await signOut();

    navigate("/login");
  };

  const displayName = profile?.name?.trim() || "Dean";
  const displayEmail = profile?.email || account?.email || "—";
  const accountId = profile?.id || account?.id || "";
  const isVerified = Boolean(account?.emailConfirmedAt);
  const role = profile?.role || "dean";
  const hasEmail = displayEmail !== "—";

  // Password changes go through the same emailed-link flow as "Forgot
  // password", so the new password is never typed on a shared screen.
  const handlePasswordReset = async () => {
    if (!hasEmail || busy) return;

    try {
      setBusy("password");
      setNotice(null);

      const result = await requestPasswordReset(displayEmail);

      setNotice({
        kind: "ok",
        text:
          result?.message ||
          `A link to set a new password has been sent to ${displayEmail}.`,
      });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err?.message || "Unable to send the reset email right now.",
      });
    } finally {
      setBusy("");
    }
  };

  const handleResendVerification = async () => {
    if (!hasEmail || busy) return;

    try {
      setBusy("verify");
      setNotice(null);

      const result = await resendVerification(displayEmail);

      setNotice({
        kind: "ok",
        text: result?.message || `Verification email sent to ${displayEmail}.`,
      });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err?.message || "Unable to send the verification email right now.",
      });
    } finally {
      setBusy("");
    }
  };

  // The id exists for support conversations, so copying it is the one thing
  // anyone ever does with it.
  const handleCopyId = async () => {
    if (!accountId) return;

    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice({ kind: "err", text: "Copy failed — select the ID and copy it manually." });
    }
  };

  // The facts, in the order someone checking their own account reads them:
  // what they may do, whether the address is confirmed, then the audit trail.
  const facts = [
    {
      label: "Role",
      value: labelOfRole(role),
      Icon: IconShield,
      track: trackOfRole(role),
    },
    {
      label: "Email verified",
      value: isVerified ? formatDateTime(account?.emailConfirmedAt) : "Not verified",
      Icon: IconCheckCircle,
      track: trackOf(isVerified ? "approved" : "pending"),
      // Sits beside "Not verified" rather than in Quick actions: the fix is
      // next to the problem, and the page keeps its height.
      action: !isVerified && (
        <button
          type="button"
          onClick={handleResendVerification}
          disabled={!hasEmail || Boolean(busy)}
          className="link text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy === "verify" ? "Sending…" : "Resend email"}
        </button>
      ),
    },
    {
      label: "Member since",
      value: formatDateTime(profile?.created_at || account?.createdAt),
      Icon: IconCalendar,
    },
    {
      label: "Last sign in",
      value: formatDateTime(account?.lastSignInAt),
      Icon: IconClock,
    },
  ];

  const navActions = [
    {
      key: "dashboard",
      to: "/dean/dashboard",
      label: "Dashboard",
      hint: "Pending reviews and totals",
      Icon: IconGrid,
    },
    {
      key: "events",
      to: "/dean/events",
      label: "All events",
      hint: "Search, approve, reject",
      Icon: IconCalendar,
    },
  ];

  const accountActions = [
    {
      key: "password",
      label: busy === "password" ? "Sending link…" : "Change password",
      hint: "Emails you a reset link",
      Icon: IconKey,
      onClick: handlePasswordReset,
      disabled: !hasEmail || Boolean(busy),
    },
    {
      key: "refresh",
      label: "Refresh details",
      hint: "Reload your account",
      Icon: IconRefresh,
      onClick: loadProfile,
      disabled: loading,
    },
  ];

  return (
    <DeanShell
      active="profile"
      profile={profile}
      onLogout={handleLogout}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">

        {error && (
          <div
            className="mb-4 flex items-start gap-3 rounded-2xl border p-3.5"
            data-tint=""
            style={{ "--track": trackOf("rejected") }}
            role="alert"
          >
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Profile unavailable</p>
              <p className="prose-muted mt-0.5 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={loadProfile}
              className="btn btn-ghost btn-xs shrink-0"
            >
              <IconRefresh />
              Retry
            </button>
          </div>
        )}

        {loading && !profile ? (
          <div className="glass p-12 text-center">
            <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
            <p className="prose-muted text-sm">Loading your profile…</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18.5rem]">

            {/* ---------------------------------------------------- identity */}
            <section className="glass reveal relative overflow-hidden p-4 sm:p-5 lg:col-span-2">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                style={{ background: trackOfRole(role) }}
              />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/12 font-display text-lg font-bold text-accent ring-1 ring-accent/20">
                  {initialsOf(displayName, displayEmail)}
                </span>

                <div className="min-w-0 flex-1 basis-44">
                  <p className="eyebrow text-[11px]">My Profile</p>
                  <h1 className="truncate font-display text-xl font-bold leading-tight text-ink sm:text-2xl">
                    {displayName}
                  </h1>
                  <p className="mt-0.5 truncate text-sm text-muted" title={displayEmail}>
                    {displayEmail}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className="chip chip-sm chip-track"
                    style={{ "--track": trackOfRole(role) }}
                  >
                    <span className="dot dot-sm" />
                    {labelOfRole(role)}
                  </span>

                  <span
                    className="chip chip-sm chip-track"
                    style={{
                      "--track": trackOf(isVerified ? "approved" : "pending"),
                    }}
                  >
                    <span className="dot dot-sm" />
                    {isVerified ? "Email verified" : "Email not verified"}
                  </span>
                </div>
              </div>
            </section>

            {/* ----------------------------------------------- account details */}
            <section
              className="glass reveal flex flex-col p-4 sm:p-5"
              style={{ "--i": 1 }}
              aria-labelledby="profile-details-heading"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="profile-details-heading" className="text-sm font-semibold text-ink">
                  Account details
                </h2>
                {loading && (
                  <span className="text-xs text-muted" role="status">Refreshing…</span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2 sm:gap-2.5">
                {facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-center gap-3 rounded-xl border hairline bg-line/2 px-3 py-2.5"
                  >
                    <span
                      className={`icon-tile hidden h-9 w-9 rounded-lg min-[480px]:inline-flex ${fact.track ? "icon-tile-track" : ""}`}
                      style={fact.track ? { "--track": fact.track } : undefined}
                    >
                      <fact.Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">
                        {fact.label}
                      </dt>
                      <dd className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold leading-snug text-ink sm:text-sm">
                        <span className="min-w-0 min-[480px]:truncate" title={fact.value}>
                          {fact.value}
                        </span>
                        {fact.action}
                      </dd>
                    </div>
                  </div>
                ))}

                {/* Shown in full rather than truncated, in a face that makes
                    every character unambiguous, since it gets read aloud or
                    pasted into a support message. */}
                <div className="flex items-center gap-3 rounded-xl border hairline bg-line/2 px-3 py-2.5 col-span-2">
                  <span className="icon-tile hidden h-9 w-9 rounded-lg min-[480px]:inline-flex">
                    <IconKey className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">
                      Account ID
                    </dt>
                    <dd className="wrap-break-word font-mono text-xs text-ink">
                      {accountId || "—"}
                    </dd>
                  </div>
                  {accountId && (
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="btn btn-ghost btn-xs shrink-0"
                      aria-label={copied ? "Account ID copied" : "Copy account ID"}
                    >
                      {copied ? <IconCheck /> : <IconCopy />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </dl>

              {/* Kept here rather than in the rail note, next to the details
                  it is about and visible at every width. */}
              <p className="mt-3 flex items-start gap-2 text-xs text-muted lg:mt-auto lg:pt-3">
                <IconInfo className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  Name and email come from the record the super admin created.
                  Ask the super admin to change them.
                </span>
              </p>
            </section>

            {/* ------------------------------------------------------ actions */}
            <section
              className="glass reveal p-4 sm:p-5"
              style={{ "--i": 2 }}
              aria-labelledby="profile-actions-heading"
            >
              <h2 id="profile-actions-heading" className="mb-3 text-sm font-semibold text-ink">
                Quick actions
              </h2>

              <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                {navActions.map((action) => (
                  <Link key={action.key} to={action.to} className={`${ACTION_CLASS} group`}>
                    <span className="icon-tile h-9 w-9 rounded-lg">
                      <action.Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{action.label}</span>
                      <span className="hidden truncate text-xs text-muted sm:block">{action.hint}</span>
                    </span>
                    <IconArrowRight className="hidden h-4 w-4 shrink-0 text-muted transition sm:block group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                ))}

                {accountActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={ACTION_CLASS}
                  >
                    <span className="icon-tile h-9 w-9 rounded-lg">
                      <action.Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold text-ink">{action.label}</span>
                      <span className="hidden truncate text-xs text-muted sm:block">{action.hint}</span>
                    </span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleLogout}
                  className={`${ACTION_CLASS} hover:border-err/30 hover:bg-err/5 col-span-2 lg:col-span-1`}
                >
                  <span
                    className="icon-tile icon-tile-track h-9 w-9 rounded-lg"
                    style={{ "--track": trackOf("rejected") }}
                  >
                    <IconLogout className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-err">Logout</span>
                    <span className="hidden truncate text-xs text-muted sm:block">End this session</span>
                  </span>
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Bottom-right like All Events, so feedback never shifts the layout
          past the fold. */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-85 max-w-[calc(100vw-2.5rem)] flex-col gap-3">
        {notice && (
          <div
            className={`toast pointer-events-auto ${notice.kind === "ok" ? "toast-ok" : "toast-err"}`}
            role={notice.kind === "ok" ? "status" : "alert"}
          >
            {notice.kind === "ok" ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
                <IconCheck className="h-3 w-3" />
              </span>
            ) : (
              <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            )}
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{notice.text}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </DeanShell>
  );
}

export default DeanProfile;
