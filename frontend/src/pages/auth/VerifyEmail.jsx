import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resendVerification, verifyEmail } from "../../services/auth";
import { readSession } from "../../services/session";
import { postLoginPath } from "../../components/common/roles";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";

function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  // verifying | success | already_verified | expired | invalid | missing | error
  const [status, setStatus] = useState(token ? "verifying" : "missing");
  const [message, setMessage] = useState("");
  const [destinationPath, setDestinationPath] = useState("");

  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const requestedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      return;
    }

    if (requestedRef.current) return;
    requestedRef.current = true;

    async function performVerification() {
      try {
        setStatus("verifying");
        const result = await verifyEmail(token);

        if (result?.already_verified) {
          setStatus("already_verified");
          const existingSession = readSession();
          if (existingSession?.user) {
            const target = postLoginPath(existingSession.user) || "/teacher/dashboard";
            setDestinationPath(target);
            setMessage("Your email is already verified. Redirecting to your dashboard…");
            setTimeout(() => {
              navigate(target, { replace: true });
            }, 1500);
          } else {
            setMessage("Your email is already verified. Redirecting to sign in…");
            setDestinationPath("/login");
            setTimeout(() => {
              navigate("/login", { replace: true });
            }, 2000);
          }
          return;
        }

        // Freshly verified: session is automatically saved by verifyEmail
        setStatus("success");
        setMessage("Email verified successfully! Taking you to your dashboard…");
        const target = postLoginPath(result?.user) || "/teacher/dashboard";
        setDestinationPath(target);

        setTimeout(() => {
          navigate(target, { replace: true });
        }, 1200);
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();

        if (msg.includes("expired")) {
          setStatus("expired");
          setMessage("This verification link has expired. Please request a new one below.");
        } else if (msg.includes("invalid") || msg.includes("already been used")) {
          setStatus("invalid");
          setMessage(err?.message || "This verification link is invalid or has already been used.");
        } else {
          setStatus("error");
          setMessage(err?.message || "Unable to verify your email right now. Please try again.");
        }
      }
    }

    performVerification();
  }, [token, navigate]);

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
    verifying: "Verifying your email",
    success: "Email confirmed!",
    already_verified: "Already verified",
    expired: "Link expired",
    invalid: "Invalid link",
    missing: "Confirm your email",
    error: "Verification error",
  };

  const subtitles = {
    verifying: "Please wait while we verify your address and sign you in…",
    success: "Your account is activated and you are signed in. Redirecting to your dashboard…",
    already_verified: "Your email address is already verified.",
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
      {/* 1. Verifying spinner */}
      {status === "verifying" && (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
          <span className="spin h-10 w-10 text-accent" />
          <p className="text-sm font-medium text-ink">
            Verifying your email address and preparing your dashboard…
          </p>
        </div>
      )}

      {/* 2. Success (Freshly verified) */}
      {status === "success" && (
        <div className="space-y-5">
          <AuthAlert tone="success">{message}</AuthAlert>
          <div className="flex flex-col items-center gap-2 pt-2">
            <span className="spin h-5 w-5 text-accent" />
            <p className="text-xs text-muted">Redirecting automatically…</p>
          </div>
          {destinationPath && (
            <Link
              to={destinationPath}
              className={`${buttonClass} block text-center`}
              replace
            >
              Go to Dashboard now
            </Link>
          )}
        </div>
      )}

      {/* 3. Already verified */}
      {status === "already_verified" && (
        <div className="space-y-5">
          <AuthAlert tone="success">{message}</AuthAlert>
          {destinationPath ? (
            <Link
              to={destinationPath}
              className={`${buttonClass} block text-center`}
              replace
            >
              {destinationPath === "/login" ? "Go to Sign in" : "Go to Dashboard"}
            </Link>
          ) : (
            <Link to="/login" className={`${buttonClass} block text-center`}>
              Go to Sign in
            </Link>
          )}
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
