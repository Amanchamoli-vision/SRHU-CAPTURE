import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { updateSessionUser } from "../../services/session";
import {
  IconAlertTriangle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
  IconShield,
} from "../teacher/icons";

export default function FirstLoginPasswordModal({ isOpen = true }) {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const getStrength = (pass) => {
    if (!pass) return { score: 0, label: "", color: "bg-line/20" };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: "Weak", color: "bg-err" };
    if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500" };
    if (score === 3) return { score: 3, label: "Good", color: "bg-accent" };
    return { score: 4, label: "Strong", color: "bg-ok" };
  };

  const strength = getStrength(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Please enter your current temporary password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password cannot be the same as the temporary password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const res = await apiJson("/users/me/change-password", {
        method: "POST",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });

      // Update session user to clear must_change_password flag
      const updatedUser = {
        ...(user || {}),
        ...(res.user || {}),
        must_change_password: false,
      };
      updateSessionUser(updatedUser);
      if (typeof setUser === "function") {
        setUser(updatedUser);
      }

      // Redirect directly to Teacher Dashboard
      navigate("/teacher/dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Failed to update password. Please check your temporary password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border hairline bg-surface p-6 shadow-2xl sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <IconShield className="h-7 w-7" />
        </div>

        <div className="text-center">
          <h2 id="first-login-title" className="font-display text-xl font-bold text-ink">
            Set Your New Password
          </h2>
          <p className="prose-muted mt-1.5 text-xs sm:text-sm">
            Welcome to Campus Capture! You are using a temporary password. Please set a personal
            password before accessing your dashboard.
          </p>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-err/20 bg-err/10 p-3 text-xs text-err">
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Current / Temporary Password *
            </label>
            <div className="relative mt-1.5">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter temporary password from email"
                required
                className="input w-full pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showCurrent ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              New Password *
            </label>
            <div className="relative mt-1.5">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                className="input w-full pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showNew ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>

            {newPassword && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>Strength: {strength.label}</span>
                  <span>{newPassword.length} characters</span>
                </div>
                <div className="mt-1 flex h-1.5 gap-1 overflow-hidden rounded-full bg-raised">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 transition-all duration-300 ${
                        step <= strength.score ? strength.color : "bg-transparent"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Confirm New Password *
            </label>
            <div className="relative mt-1.5">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
                className="input w-full pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showConfirm ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-brand w-full py-2.5 text-sm font-semibold shadow-lg shadow-accent/20"
            >
              {loading ? (
                <>
                  <span className="spin h-4 w-4 border-2 border-white/30 border-t-white" />
                  Updating Password…
                </>
              ) : (
                <>
                  <IconCheck className="h-4 w-4" />
                  Set Password & Access Dashboard
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
