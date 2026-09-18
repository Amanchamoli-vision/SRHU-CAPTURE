import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resendVerification, verifyEmail } from "../../services/auth";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";
import EyeIcon from "../../components/common/EyeIcon";

// The link alone no longer verifies an address: the backend also needs the
// password chosen at registration, so someone who registered an address they
// do not own cannot have the real owner confirm it for them by clicking.
// Nothing is sent on page load, which also means mail scanners that prefetch
// the link and React StrictMode's double effect cannot consume it.

/** A 400 about the link itself (invalid, used, expired) rather than the password. */
const isLinkProblem = (err) =>
  err?.status === 400 &&
  /invalid|already been used|expired/i.test(err?.message || "") &&
  !/password/i.test(err?.message || "");

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  // form -> success | error (bad link) ; missing when there is no token
  const [status, setStatus] = useState(token ? "form" : "missing");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState("");

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const handleVerify = async (e) => {
    e.preventDefault();
    if (verifying) return;
    setFormError("");

    if (!password) {
      setFormError("Enter the password you chose when registering.");
      return;
    }

    try {
      setVerifying(true);
      const result = await verifyEmail(token, password);
      setStatus("success");
      setMessage(result?.message || "Your email has been verified. You can now sign in.");
      if (result?.email) setEmail(result.email);
      setPassword("");
    } catch (err) {
      if (isLinkProblem(err)) {
        setStatus("error");
        setMessage(err.message);
      } else {
        // Wrong password (the link stays valid, so it can be retried), rate
        // limit (429), or the server being unreachable.
        setFormError(err?.message || "Unable to verify your email right now.");
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      setResending(true);
      setResendMessage("");
      setResendError("");
      const result = await resendVerification(email.trim());
      setResendMessage(result?.message || "If that account exists, a new email is on its way.");
    } catch (err) {
      setResendError(err?.message || "Unable to send a new verification email right now.");
    } finally {
      setResending(false);
    }
  };

  const mentionsForgotPassword = /forgot password/i.test(formError);

  return (
    <AuthCard
      eyebrow="Email verification"
      title={status === "success" ? "Email confirmed" : "Confirm your email"}
      subtitle={
        status === "success"
          ? "Your account is active. Sign in to continue to Campus Capture."
          : status === "form"
            ? "Enter the password you chose when registering to confirm this address."
            : "Open the confirmation link from your email, or request a new one below."
      }
      footer={
        <p>
          Back to{" "}
          <Link to="/login" className="link font-semibold">
            Sign in
          </Link>
        </p>
      }
    >
      {status === "form" && (
        <form onSubmit={handleVerify} className="space-y-5">
          {formError && (
            <AuthAlert>
              {formError}
              {mentionsForgotPassword && (
                <>
                  {" "}
                  <Link to="/forgot-password" className="link font-semibold">
                    Reset your password
                  </Link>
                </>
              )}
            </AuthAlert>
          )}

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-ink">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter the password you chose when registering"
                className={`${inputClass} pr-11`}
                disabled={verifying}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 pl-2 text-muted transition hover:text-ink"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <button type="submit" disabled={verifying} className={buttonClass}>
            {verifying ? "Verifying…" : "Verify email"}
          </button>

          <p className="text-xs text-muted">
            Did not register this account, or forgot the password?{" "}
            <Link to="/forgot-password" className="link font-semibold">
              Use Forgot password
            </Link>{" "}
            to set your own password and confirm the address.
          </p>
        </form>
      )}

      {status === "success" && (
        <div className="space-y-5">
          <AuthAlert tone="success">{message}</AuthAlert>
          <Link to="/login" className={`${buttonClass} block text-center`}>
            Go to sign in
          </Link>
        </div>
      )}

      {(status === "error" || status === "missing") && (
        <form onSubmit={handleResend} className="space-y-5">
          {status === "error" && <AuthAlert>{message}</AuthAlert>}
          {resendMessage && <AuthAlert tone="success">{resendMessage}</AuthAlert>}
          {resendError && <AuthAlert>{resendError}</AuthAlert>}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@srhu.edu.in"
              className={inputClass}
              required
            />
          </div>

          <button type="submit" disabled={resending} className={buttonClass}>
            {resending ? "Sending…" : "Send a new verification email"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export default VerifyEmail;
