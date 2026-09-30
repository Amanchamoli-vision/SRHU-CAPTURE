import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import { ROLE_TRACK } from "../../components/common/roles";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheckCircle,
  IconMail,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "../../components/teacher/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TRACK = ROLE_TRACK.event_manager;

const STEPS = [
  {
    title: "Enter their details",
    body: "Use the address they will sign in with. No password is created here.",
  },
  {
    title: "A verification link is emailed",
    body: "It works once and expires after a few days. You can resend it from User Management if it is lost or expires.",
  },
  {
    title: "They verify and set a password",
    body: "Opening the link confirms their email and lets them choose a password. They then sign in on the normal login page.",
  },
];

function CreateEventManager() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // { message, name, email, sent }

  const validate = () => {
    const errors = {};
    if (!name.trim()) errors.name = "Enter the Event Manager's full name.";
    if (!email.trim()) errors.email = "Enter the Event Manager's email address.";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "That does not look like a valid email address.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setCreated(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const payload = { name: name.trim(), email: email.trim().toLowerCase() };
      const data = await apiJson("/superadmin/event-managers", { method: "POST", body: payload });

      setCreated({
        message: data.message || "Event Manager account created.",
        name: payload.name,
        email: payload.email,
        sent: data.invite?.status === "sent",
      });
      setName("");
      setEmail("");
      setFieldErrors({});
    } catch (err) {
      if (err?.status === 401) {
        setError("Super Admin session expired. Please login again.");
        navigate("/login", { replace: true });
        return;
      }
      setError(err?.message || "Something went wrong while creating the Event Manager account.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <SuperAdminShell
      active="create-event-manager"
      profile={profile}
      onLogout={handleLogout}
      railNote="An Event Manager records events and generates their reports directly, without Dean review."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
        <PageHero
          eyebrow="Super Admin"
          title="Create"
          accent="Event Manager"
          subtitle="Invite an Event Manager by email. They verify their address and choose their own password from the link we send."
          actions={
            <Link to="/superadmin/users?role=event_manager" className="btn btn-ghost">
              <IconUsers />
              View Event Managers
            </Link>
          }
        />

        <div className="mt-7 grid gap-4 lg:grid-cols-5">
          {/* ---------------------------------------------------- form */}
          <div className="lg:col-span-3">
            {created ? (
              <section className="glass reveal overflow-hidden" style={{ "--i": 1 }} aria-live="polite">
                <div
                  className="flex items-start gap-3 border-b p-5"
                  data-tint=""
                  style={{ "--track": created.sent ? "#10B981" : "#F59E0B" }}
                >
                  <span className="icon-tile icon-tile-track">
                    {created.sent ? <IconCheckCircle /> : <IconAlertTriangle />}
                  </span>
                  <div className="min-w-0">
                    <p className={`eyebrow ${created.sent ? "text-ok" : "text-emberink"}`}>
                      {created.sent ? "Invitation sent" : "Account created, invitation not sent"}
                    </p>
                    <h2 className="h3 mt-0.5 text-ink">{created.message}</h2>
                    <p className="prose-muted mt-1 text-sm">
                      <span className="font-semibold text-ink">{created.name}</span>
                      {" · "}
                      {created.email}
                    </p>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <p className="prose-muted text-sm">
                    {created.sent
                      ? "The account stays inactive until they open the link, verify their email and set a password. Until then it shows as “Invitation pending” in User Management."
                      : "Resend the invitation from User Management once email delivery is working."}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <button type="button" onClick={() => setCreated(null)} className="btn btn-primary">
                      <IconUserPlus />
                      Invite another Event Manager
                    </button>
                    <Link to="/superadmin/users?role=event_manager" className="btn btn-ghost">
                      View Event Managers
                      <IconArrowRight />
                    </Link>
                  </div>
                </div>
              </section>
            ) : (
              <section className="glass reveal p-5 sm:p-7" style={{ "--i": 1 }}>
                <div className="flex items-center gap-3">
                  <span className="icon-tile icon-tile-track" style={{ "--track": TRACK }}>
                    <IconCalendar />
                  </span>
                  <div>
                    <p className="eyebrow">New account</p>
                    <h2 className="h3 text-ink">Event Manager details</h2>
                  </div>
                </div>

                {error && (
                  <div
                    className="mt-5 flex items-start gap-3 rounded-2xl border p-3.5"
                    data-tint=""
                    style={{ "--track": "#EF4444" }}
                    role="alert"
                  >
                    <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
                    <p className="text-sm text-ink">{error}</p>
                  </div>
                )}

                <form onSubmit={handleCreate} noValidate className="mt-6 space-y-5">
                  <div className="field">
                    <label htmlFor="em-name">
                      Full name<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <IconUser className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        id="em-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Priya Sharma"
                        autoComplete="off"
                        disabled={loading}
                        aria-invalid={fieldErrors.name ? "true" : undefined}
                        aria-describedby={fieldErrors.name ? "em-name-error" : undefined}
                        className="input pl-10"
                      />
                    </div>
                    {fieldErrors.name && (
                      <p id="em-name-error" className="field-error">{fieldErrors.name}</p>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="em-email">
                      Email address<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <IconMail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        id="em-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="events@srhu.edu.in"
                        autoComplete="off"
                        disabled={loading}
                        aria-invalid={fieldErrors.email ? "true" : undefined}
                        aria-describedby={fieldErrors.email ? "em-email-error" : undefined}
                        className="input pl-10"
                      />
                    </div>
                    {fieldErrors.email ? (
                      <p id="em-email-error" className="field-error">{fieldErrors.email}</p>
                    ) : (
                      <p className="text-xs text-muted">The verification link is sent here, and they sign in with it.</p>
                    )}
                  </div>

                  <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-end">
                    <Link to="/superadmin/dashboard" className="btn btn-ghost">
                      Cancel
                    </Link>
                    <button type="submit" disabled={loading} className="btn btn-primary">
                      {loading ? (
                        <>
                          <span className="spin h-4 w-4" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <IconMail />
                          Send verification link
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </div>

          {/* ------------------------------------------------- guidance */}
          <aside className="space-y-4 lg:col-span-2">
            <section className="glass reveal p-5 sm:p-6" style={{ "--i": 2 }}>
              <p className="eyebrow">How it works</p>
              <ol className="mt-4 space-y-4">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="step">
                    <i>{i + 1}</i>
                    <div>
                      <p className="font-display text-sm font-semibold text-ink">{step.title}</p>
                      <p className="prose-muted mt-0.5 text-xs">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section
              className="reveal rounded-2xl border p-5"
              data-tint=""
              style={{ "--track": TRACK, "--i": 3 }}
            >
              <div className="flex items-center gap-2.5">
                <span className="dot" style={{ "--track": TRACK }} />
                <p className="font-display text-sm font-semibold text-ink">What an Event Manager can do</p>
              </div>
              <ul className="prose-muted mt-3 space-y-1.5 text-xs">
                <li>Record events using the same form teachers use.</li>
                <li>Save events directly, without waiting for Dean approval.</li>
                <li>Generate event reports.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </SuperAdminShell>
  );
}

export default CreateEventManager;
