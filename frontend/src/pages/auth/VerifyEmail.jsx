import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resendVerification, verifyEmail } from "../../services/auth";
import { postLoginPath } from "../../components/common/roles";
import { IconCheckCircle } from "../../components/teacher/icons";
import PasswordField from "../../components/common/PasswordField";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";

/**
 * Confirming an address, and only then signing in.
 *
 * The page deliberately does NOT verify on load. A verification link travels
 * through a mail system, stays in browser history, and often lands in a shared
 * or departmental inbox — so holding it proves someone can read the mailbox,
 * not that they are the person who registered. It used to be enough on its
 * own to return a full session, which meant anyone who saw the link was signed
 * in as that account. The password chosen at registration is what completes
 * the step; whoever cannot supply it uses Forgot password, which confirms the
 * address as well.
 */
function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  // form | verifying | success | already_verified | expired | invalid | missing | error
  const [status, setStatus] = useState(token ? "form" : "missing");
  const [message, setMessage] = useState("");
  const [destinationPath, setDestinationPath] = useState("");

  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!password || status === "verifying") return;

    setFormError("");
    setStatus("verifying");

    try {
      const result = await verifyEmail(token, password);

      if (result?.already_verified) {
        // Confirmed by an earlier visit, so no session comes back.
        setStatus("already_verified");
        setDestinationPath("/login");
        setMessage("Your email has already been verified. You can sign in.");
        return;
      }

      // Freshly verified, and verifyEmail has saved the session it returned.
      //
      // The confirmation stays on screen until the person clicks through.
      // It used to redirect itself after 1.2s, which meant the one moment
      // the flow exists to communicate went past faster than it could be
      // read -- and the timer fired even if they had already navigated away.
      setStatus("success");
      setMessage("Your email has been successfully verified.");
      setDestinationPath(postLoginPath(result?.user) || "/teacher/dashboard");
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();

      if (msg.includes("expired")) {
        setStatus("expired");
        setMessage("This verification link has expired. Please request a new one below.");
      } else if (msg.includes("invalid") || msg.includes("already been used")) {
        setStatus("invalid");
        setMessage(err?.message || "This verification link is invalid or has already been used.");
      } else if (msg.includes("password")) {
        // The link is untouched, so they can simply try again.
        setStatus("form");
        setFormError(err?.message || "That password does not match this account.");
      } else {
        setStatus("error");
        setMessage(err?.message || "Unable to verify your email right now. Please try again.");
      }
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

  const titles = {
    form: "Confirm your email",
    verifying: "Verifying your email",
    success: "Email verified",
    already_verified: "Already verified",
    expired: "Link expired",
    invalid: "Invalid link",
    missing: "Confirm your email",
    error: "Verification error",
  };

  const subtitles = {
    form: "Enter the password you chose when you registered to finish confirming this address.",
    verifying: "Please wait while we verify your address and sign you in…",
    success: "Your account is now active and you are signed in.",
    already_verified: "Nothing more to do — this address is already confirmed.",
    expired: "This verification link has expired. Enter your institutional email to receive a fresh link.",
    invalid: "This confirmation link is invalid or has already been consumed.",
    missing: "Open the confirmation link from your email, or request a new one below.",
    error: "Something went wrong while confirming your email address.",
  };

  return (
    <AuthCard
      eyebrow="Email verification"
      title={titles[status] || "Confirm your email"}
      subtitle={subtitles[status] || ""}
      footer={
        <p>
          Back to{" "}
          <Link to="/login" className="link font-semibold">
            Sign in
          </Link>
        </p>
      }
    >
      {/* 1. The password step. Holding the link is not on its own a sign-in. */}
      {status === "form" && (
        <form onSubmit={handleVerify} className="space-y-5">
          {formError && (
            <AuthAlert>
              {formError}{" "}
              <Link to="/forgot-password" className="link font-semibold">
                Forgot password?
              </Link>
            </AuthAlert>
          )}

          <PasswordField
            id="verify-password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="The password you chose at registration"
          />

          <button type="submit" disabled={!password} className={buttonClass}>
            Verify and sign in
          </button>

          <p className="text-sm text-muted">
            Didn&apos;t create this account, or don&apos;t know the password?{" "}
            <Link to="/forgot-password" className="link font-semibold">
              Use Forgot password
            </Link>{" "}
            — it confirms your address at the same time.
          </p>
        </form>
      )}

      {/* 2. Verifying spinner */}
      {status === "verifying" && (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
          <span className="spin h-10 w-10 text-accent" />
          <p className="text-sm font-medium text-ink">
            Verifying your email address and preparing your dashboard…
          </p>
        </div>
      )}

      {/* 2. Success (freshly verified) and 3. already verified.
          Both end the flow, so both say so plainly and wait for a click
          rather than redirecting out from under the person reading them. */}
      {(status === "success" || status === "already_verified") && (
        <div className="space-y-5">
          <div
            role="status"
            className="flex flex-col items-center gap-3 rounded-xl border border-ok/35 bg-ok/8 px-5 py-7 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">
              <IconCheckCircle className="h-7 w-7" />
            </span>

            <p className="text-base font-semibold text-ink">{message}</p>

            <p className="text-sm text-muted">
              {status === "success"
                ? "You can start submitting events for Dean approval right away."
                : "Continue to your account whenever you are ready."}
            </p>
          </div>

          <Link
            to={destinationPath || "/login"}
            className={`${buttonClass} block text-center`}
            replace
          >
            {(destinationPath || "/login") === "/login"
              ? "Go to Sign in"
              : "Go to Dashboard"}
          </Link>
        </div>
      )}

      {/* 4. Expired / Invalid / Missing / Error (with resend form) */}
      {(status === "expired" ||
        status === "invalid" ||
        status === "missing" ||
        status === "error") && (
        <form onSubmit={handleResend} className="space-y-5">
          {message && <AuthAlert>{message}</AuthAlert>}
          {resendMessage && <AuthAlert tone="success">{resendMessage}</AuthAlert>}
          {resendError && <AuthAlert>{resendError}</AuthAlert>}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Institutional email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@srhu.edu.in"
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
