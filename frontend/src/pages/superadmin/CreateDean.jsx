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
  IconAward,
  IconCheck,
  IconCheckCircle,
  IconCopy,
  IconKey,
  IconMail,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "../../components/teacher/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = [
  {
    title: "Enter their details",
    body: "The name appears on every approval they issue. Use the address they will sign in with.",
  },
  {
    title: "A temporary password is generated",
    body: "It is shown once on this screen, and emailed to the Dean when mail delivery is configured. Copy it before you leave the page.",
  },
  {
    title: "Hand it over securely",
    body: "Share it in person or over a trusted channel. The Dean should change it after first sign-in.",
  },
];

function CreateDean() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // { message, email, name, temporaryPassword }
  const [copied, setCopied] = useState(false);

  const validate = () => {
    const errors = {};
    if (!name.trim()) errors.name = "Enter the Dean's full name.";
    if (!email.trim()) errors.email = "Enter the Dean's email address.";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "That does not look like a valid email address.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateDean = async (e) => {
    e.preventDefault();
    setError("");
    setCreated(null);
    setCopied(false);

    if (!validate()) return;

    setLoading(true);

    try {
      const payload = { name: name.trim(), email: email.trim().toLowerCase() };

      const data = await apiJson("/superadmin/create-dean", { method: "POST", body: payload });

      setCreated({
        message: data.message || "Dean account created successfully.",
        name: payload.name,
        email: payload.email,
        temporaryPassword: data.temporary_password || "",
        emailSent: Boolean(data.email_sent),
      });
      setName("");
      setEmail("");
      setFieldErrors({});
    } catch (err) {
      // 401 means the token is gone or rejected even after a refresh; apiJson
      // has already cleared the stored session by then.
      if (err?.status === 401) {
        setError("Super Admin session expired. Please login again.");
        navigate("/login");
        return;
      }
      console.error("Create Dean Error:", err);
      setError(err?.message || "Something went wrong while creating the Dean account.");
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = async () => {
    if (!created?.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <SuperAdminShell
      active="create-dean"
      profile={profile}
      onLogout={handleLogout}
      railNote="A Dean reviews and approves event proposals. Only a super admin can create one."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        <PageHero
          eyebrow="Super Admin"
          title="Create"
          accent="Dean"
          subtitle="Open a new Dean account for the university. The Dean will receive a temporary password to sign in with."
          actions={
            <Link to="/superadmin/users" className="btn btn-ghost">
              <IconUsers />
              View all users
            </Link>
          }
        />

        <div className="mt-7 grid gap-4 lg:grid-cols-5">

          {/* ---------------------------------------------------- form */}
          <div className="lg:col-span-3">
            {created ? (
              <section
                className="glass reveal overflow-hidden"
                style={{ "--i": 1 }}
                aria-live="polite"
              >
                <div
                  className="flex items-start gap-3 border-b p-5"
                  data-tint=""
                  style={{ "--track": "#10B981" }}
                >
                  <span className="icon-tile icon-tile-track">
                    <IconCheckCircle />
                  </span>
                  <div className="min-w-0">
                    <p className="eyebrow" style={{ color: "#10B981" }}>Account created</p>
                    <h2 className="h3 mt-0.5 text-ink">{created.message}</h2>
                    <p className="prose-muted mt-1 text-sm">
                      <span className="font-semibold text-ink">{created.name}</span>
                      {" · "}
                      {created.email}
                    </p>
                    <span className={`chip chip-sm mt-2.5 ${created.emailSent ? "chip-track" : ""}`} style={{ "--track": "#10B981" }}>
                      <IconMail />
                      {created.emailSent ? "Login details emailed to the Dean" : "Not emailed — share the password manually"}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  {created.temporaryPassword ? (
                    <>
                      <div className="flex items-center gap-2">
                        <IconKey className="h-4 w-4 text-accent" />
                        <p className="text-sm font-semibold text-ink">Temporary password</p>
                      </div>

                      <div className="mt-2.5 flex items-stretch gap-2">
                        <code className="num flex min-h-12 flex-1 items-center overflow-x-auto rounded-xl border hairline bg-raised/60 px-4 font-mono text-base tracking-wide text-ink select-all">
                          {created.temporaryPassword}
                        </code>
                        <button
                          type="button"
                          onClick={copyPassword}
                          className={`btn btn-sm shrink-0 ${copied ? "btn-brand" : "btn-ghost"}`}
                          aria-live="polite"
                        >
                          {copied ? <IconCheck /> : <IconCopy />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>

                      <div
                        className="mt-4 flex items-start gap-3 rounded-2xl border p-3.5"
                        data-tint=""
                        style={{ "--track": ROLE_TRACK.superadmin }}
                      >
                        <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-emberink" />
                        <p className="text-sm text-ink">
                          This password is shown once. Save it now and share it with the Dean securely.
                          It will not be visible again after you leave this page.
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="prose-muted text-sm">
                      No temporary password was returned. The Dean can use the password reset
                      flow on the login page to set one.
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => { setCreated(null); setCopied(false); }}
                      className="btn btn-primary"
                    >
                      <IconUserPlus />
                      Create another Dean
                    </button>
                    <Link to="/superadmin/users?role=dean" className="btn btn-ghost">
                      View Deans
                      <IconArrowRight />
                    </Link>
                  </div>
                </div>
              </section>
            ) : (
              <section className="glass reveal p-5 sm:p-7" style={{ "--i": 1 }}>
                <div className="flex items-center gap-3">
                  <span className="icon-tile icon-tile-track" style={{ "--track": ROLE_TRACK.dean }}>
                    <IconAward />
                  </span>
                  <div>
                    <p className="eyebrow">New account</p>
                    <h2 className="h3 text-ink">Dean details</h2>
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

                <form onSubmit={handleCreateDean} noValidate className="mt-6 space-y-5">
                  <div className="field">
                    <label htmlFor="dean-name">
                      Full name<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <IconUser className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        id="dean-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Dr. Meera Joshi"
                        autoComplete="off"
                        disabled={loading}
                        aria-invalid={fieldErrors.name ? "true" : undefined}
                        aria-describedby={fieldErrors.name ? "dean-name-error" : undefined}
                        className="input pl-10"
                      />
                    </div>
                    {fieldErrors.name && (
                      <p id="dean-name-error" className="field-error">{fieldErrors.name}</p>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="dean-email">
                      Email address<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <IconMail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        id="dean-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="dean@srhu.edu.in"
                        autoComplete="off"
                        disabled={loading}
                        aria-invalid={fieldErrors.email ? "true" : undefined}
                        aria-describedby={fieldErrors.email ? "dean-email-error" : undefined}
                        className="input pl-10"
                      />
                    </div>
                    {fieldErrors.email ? (
                      <p id="dean-email-error" className="field-error">{fieldErrors.email}</p>
                    ) : (
                      <p className="text-xs text-muted">They will sign in with this address.</p>
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
                          Creating…
                        </>
                      ) : (
                        <>
                          <IconUserPlus />
                          Create Dean account
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
              style={{ "--track": ROLE_TRACK.dean, "--i": 3 }}
            >
              <div className="flex items-center gap-2.5">
                <span className="dot" style={{ "--track": ROLE_TRACK.dean }} />
                <p className="font-display text-sm font-semibold text-ink">What a Dean can do</p>
              </div>
              <ul className="prose-muted mt-3 space-y-1.5 text-xs">
                <li>Review every event proposal submitted by teachers.</li>
                <li>Approve, reject, and record remarks on a proposal.</li>
                <li>Track approved events through to completion.</li>
              </ul>
              <p className="prose-muted mt-3 text-xs">
                Already have a teacher who should be a Dean?{" "}
                <Link to="/superadmin/users?role=teacher" className="link">
                  Promote them from User Management
                </Link>{" "}
                instead of creating a second account.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </SuperAdminShell>
  );
}

export default CreateDean;
