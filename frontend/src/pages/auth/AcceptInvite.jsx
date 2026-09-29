import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvite } from "../../services/auth";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";
import EyeIcon from "../../components/common/EyeIcon";

/**
 * Where an invited user lands from their invitation email -- a teacher invited
 * by a Dean, or an Event Manager invited by a Super Admin: choose a password
 * and the account is active (following the link also verifies the email). The same shape as ResetPassword, which this mirrors;
 * the server side is POST /auth/accept-invite.
 */
function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

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
      const result = await acceptInvite(token, password);
      setMessage(result?.message || "Your password is set and your account is active. You can now sign in.");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err?.message || "This invitation link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Welcome to Campus Capture"
      title="Set your password"
      subtitle="You have been invited. Choose a password with at least 6 characters to verify your email and activate your account."
      footer={
        <p>
          Link expired? Ask whoever invited you to send a new invitation, or{" "}
          <Link to="/forgot-password" className="link font-semibold">
            reset your password
          </Link>
          .
        </p>
      }
    >
      {!token ? (
        <AuthAlert>
          This page needs the link from your invitation email. Open the email and click the button there.
        </AuthAlert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthAlert>{error}</AuthAlert>
          {message && <AuthAlert tone="success">{message}</AuthAlert>}

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-ink">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={loading}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center pl-2 pr-3.5 text-muted transition hover:text-ink disabled:cursor-not-allowed"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="text-sm font-medium text-ink">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirm"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                disabled={loading}
                aria-label={
                  showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"
                }
                aria-pressed={showConfirmPassword}
                className="absolute inset-y-0 right-0 flex items-center pl-2 pr-3.5 text-muted transition hover:text-ink disabled:cursor-not-allowed"
              >
                <EyeIcon open={showConfirmPassword} />
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Activating…" : "Set password and activate"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export default AcceptInvite;
