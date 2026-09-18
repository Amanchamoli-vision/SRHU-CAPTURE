import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../../services/auth";
import AuthCard, { AuthAlert, buttonClass, inputClass } from "./AuthCard";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      const result = await requestPasswordReset(cleanEmail);
      setMessage(
        result?.message ||
          "If an account with that email exists, a password reset email has been sent."
      );
    } catch (err) {
      setError(err?.message || "Unable to send the reset email right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Forgot your password?"
      subtitle="Enter the email you registered with and we will send you a link to choose a new password."
      footer={
        <p>
          Remembered it?{" "}
          <Link to="/login" className="link font-semibold">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthAlert>{error}</AuthAlert>
        {message && <AuthAlert tone="success">{message}</AuthAlert>}

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

        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthCard>
  );
}

export default ForgotPassword;
