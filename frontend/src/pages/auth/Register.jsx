import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { register, resendVerification } from "../../services/auth";
import AuthLayout, { AuthAlert } from "../../components/auth/AuthLayout";
import EyeIcon from "../../components/common/EyeIcon";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheckCircle,
  IconKey,
  IconMail,
  IconUser,
} from "../../components/teacher/icons";

const BULLETS = [
  "Create and submit event proposals in minutes",
  "Attach the documents and media a Dean needs to decide",
  "Follow every submission through to its decision",
];

/**
 * Password strength, expressed with the theme's own status hues so the meter
 * agrees with every other piece of state colour in the product.
 */
const RESEND_COOLDOWN_SECONDS = 30;

const STRENGTH = [
  { label: "Too weak", track: "#64748B" },
  { label: "Weak", track: "#EF4444" },
  { label: "Fair", track: "#F59E0B" },
  { label: "Good", track: "#0EA5E9" },
  { label: "Strong", track: "#10B981" },
];

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // After a successful sign-up: the address the link went to, and a short
  // cooldown before another link can be requested.
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleResend = async () => {
    if (!registeredEmail || resendIn > 0) return;
    try {
      setResending(true);
      setError("");
      await resendVerification(registeredEmail);
      setMessage(`A new verification link is on its way to ${registeredEmail}.`);
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.message || "Unable to send a new verification email right now.");
    } finally {
      setResending(false);
    }
  };

  const passwordScore = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const strength = STRENGTH[passwordScore];

  const mismatch = Boolean(confirmPassword) && confirmPassword !== password;

  const handleRegister = async (e) => {
    e.preventDefault();

    setMessage("");
    setError("");

    // Validation
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      // Creates the account in MongoDB through the API. Throws an ApiError
      // with the server's message, or a clear "cannot reach server" message.
      const result = await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      setMessage(
        result.message ||
          "Account created successfully! Please check your email for verification."
      );
      setRegisteredEmail(email.trim());
      setResendIn(RESEND_COOLDOWN_SECONDS);

      // Clear form
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Registration failed:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Faculty portal access"
      title="Campus events, organized"
      accent="end to end."
      blurb="A unified institutional platform to create, manage and track campus events across Swami Rama Himalayan University."
      bullets={BULLETS}
      formTitle="Create your account"
      formSubtitle="Register with your institutional email to submit events for Dean approval."
      footer={
        <>
          Already have an authorized account?{" "}
          <Link to="/login" className="link font-semibold">
            Sign in
          </Link>
        </>
      }
    >
      <AuthAlert icon={<IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}>
        {error}
      </AuthAlert>

      <AuthAlert
        tone="success"
        icon={<IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      >
        {message}
      </AuthAlert>

      {registeredEmail && (
        <p className="-mt-1 mb-4 text-sm text-muted">
          No email yet? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendIn > 0}
            className="link font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending
              ? "sending…"
              : resendIn > 0
                ? `resend in ${resendIn}s`
                : "send the link again"}
          </button>
          .
        </p>
      )}

      <form onSubmit={handleRegister} className="space-y-4" noValidate>

        <div className="field">
          <label htmlFor="name">
            Full name
            <span className="req">*</span>
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
              <IconUser className="h-4 w-4" />
            </span>

            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. / Prof. Full Name"
              disabled={loading}
              className="input pl-10"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="email">
            Institutional email
            <span className="req">*</span>
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
              <IconMail className="h-4 w-4" />
            </span>

            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@srhu.edu.in"
              disabled={loading}
              className="input pl-10"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">
            Password
            <span className="req">*</span>
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
              <IconKey className="h-4 w-4" />
            </span>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              disabled={loading}
              className="input pl-10 pr-11"
            />

            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={loading}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 pl-2 text-muted transition hover:text-ink disabled:cursor-not-allowed"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          {password && (
            <div className="mt-1">
              <div className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    style={
                      i < passwordScore ? { background: strength.track } : undefined
                    }
                    className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                      i < passwordScore ? "" : "bg-raised"
                    }`}
                  />
                ))}
              </div>

              <p className="mt-1.5 text-[11px] font-medium text-muted">
                Strength:{" "}
                <span className="font-semibold" style={{ color: strength.track }}>
                  {strength.label}
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">
            Confirm password
            <span className="req">*</span>
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
              <IconKey className="h-4 w-4" />
            </span>

            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              disabled={loading}
              aria-invalid={mismatch ? "true" : undefined}
              aria-describedby={mismatch ? "confirmPasswordError" : undefined}
              className="input pl-10 pr-11"
            />

            <button
              type="button"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              disabled={loading}
              aria-label={
                showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"
              }
              aria-pressed={showConfirmPassword}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 pl-2 text-muted transition hover:text-ink disabled:cursor-not-allowed"
            >
              <EyeIcon open={showConfirmPassword} />
            </button>
          </div>

          {mismatch && (
            <p id="confirmPasswordError" className="field-error">
              Passwords do not match.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-block group mt-2"
        >
          {loading && <span className="spin h-4 w-4" />}
          {loading ? "Creating account…" : "Create faculty account"}
          {!loading && (
            <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Register;
