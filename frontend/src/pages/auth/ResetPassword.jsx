import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../services/auth";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";
import EyeIcon from "../../components/common/EyeIcon";

function ResetPassword() {
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
      const result = await resetPassword(token, password);
      setMessage(result?.message || "Your password has been updated. You can now sign in.");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err?.message || "This reset link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Choose a new password"
      subtitle="Pick a password with at least 6 characters."
      footer={
        <p>
          Need a new link?{" "}
          <Link to="/forgot-password" className="link font-semibold">
            Request one
          </Link>
        </p>
      }
    >
      {!token ? (
        <AuthAlert>
          This page needs the link from your password reset email. Open the email and click the button there.
        </AuthAlert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthAlert>{error}</AuthAlert>
          {message && <AuthAlert tone="success">{message}</AuthAlert>}

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-ink">
              New password
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
              Confirm new password
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
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export default ResetPassword;
