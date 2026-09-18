import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resendVerification, verifyEmail } from "../../services/auth";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";

// One request per token for the life of the page. React StrictMode mounts this
// component twice in development; without this, the first request would
// verify the account and the second would report the (now used) link as
// invalid, which is the error people saw after clicking a fresh link.
const verifyRequests = new Map();

function verifyOnce(token) {
  if (!verifyRequests.has(token)) {
    verifyRequests.set(token, verifyEmail(token));
  }
  return verifyRequests.get(token);
}

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState(token ? "verifying" : "missing");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    verifyOnce(token)
      .then((result) => {
        if (cancelled) return;
        setStatus("success");
        setMessage(result?.message || "Your email has been verified. You can now sign in.");
        if (result?.email) setEmail(result.email);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(err?.message || "This verification link is invalid or has expired.");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      setResending(true);
      setResendMessage("");
      const result = await resendVerification(email.trim());
      setResendMessage(result?.message || "If that account exists, a new email is on its way.");
    } catch (err) {
      setResendMessage(err?.message || "Unable to send a new verification email right now.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Email verification"
      title={
        status === "success"
          ? "Email confirmed"
          : status === "verifying"
            ? "Confirming your email…"
            : "Confirm your email"
      }
      subtitle={
        status === "success"
          ? "Your account is active. Sign in to continue to Campus Capture."
          : status === "verifying"
            ? "Please wait a moment."
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
      {status === "verifying" && (
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="spin h-5 w-5 text-accent" />
          Verifying your link…
        </div>
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
