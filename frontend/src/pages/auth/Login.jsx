import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signIn } from "../../services/auth";
import { useAuth } from "../../context/AuthContext";
import AuthLayout, { AuthAlert } from "../../components/auth/AuthLayout";
import EyeIcon from "../../components/common/EyeIcon";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconKey,
  IconMail,
} from "../../components/teacher/icons";

const BULLETS = [
  "Role-segregated faculty and Dean authorization",
  "Structured event proposal and document approval pipeline",
  "Real-time status tracking across departments",
];

function Login() {
  const navigate = useNavigate();
  const { user: currentUser, role: currentRole, loading: authLoading, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if user already has an active authenticated session
  useEffect(() => {
    if (!authLoading && currentUser && currentRole) {
      if (currentRole === "superadmin") {
        navigate("/superadmin/dashboard", { replace: true });
      } else if (currentRole === "dean") {
        navigate("/dean/dashboard", { replace: true });
      } else if (currentRole === "teacher") {
        navigate("/teacher/dashboard", { replace: true });
      }
    }
  }, [currentUser, currentRole, authLoading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    // -----------------------------
    // Basic validation
    // -----------------------------
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      // -----------------------------
      // Sign in against the API (users live in MongoDB)
      // -----------------------------
      let profile = null;

      try {
        const result = await signIn(cleanEmail, password);
        profile = result.user;
      } catch (loginError) {
        console.error("Login Error:", loginError);

        const message = loginError.message?.toLowerCase() || "";

        // Email not confirmed
        if (loginError.status === 403 && message.includes("not confirmed")) {
          setError(
            "Your email is not confirmed. Please confirm your email before logging in."
          );
          return;
        }

        // Invalid credentials
        if (loginError.status === 401) {
          setError("Invalid email or password.");
          return;
        }

        // Other authentication errors
        setError(loginError.message || "Unable to sign in. Please try again.");

        return;
      }

      // -----------------------------
      // Check user profile + role
      // -----------------------------
      if (!profile) {
        // Sign out and clear local storage if profile cannot be loaded
        await signOut();

        setError(
          "Unable to load your user profile. Please contact the administrator."
        );

        return;
      }

      // -----------------------------
      // Validate role
      // -----------------------------
      const role = profile.role?.toLowerCase();

      // -----------------------------
      // Redirect according to role
      // -----------------------------
      if (role === "superadmin") {
        navigate("/superadmin/dashboard", { replace: true });

        return;
      }

      if (role === "dean") {
        navigate("/dean/dashboard", { replace: true });

        return;
      }

      if (role === "teacher") {
        navigate("/teacher/dashboard", { replace: true });

        return;
      }

      // -----------------------------
      // Invalid role
      // -----------------------------
      await signOut();

      setError(
        "Your account has an invalid role. Please contact the administrator."
      );
    } catch (err) {
      // -----------------------------
      // Unexpected error
      // -----------------------------
      console.error("Login Error:", err);

      const message = err?.message?.toLowerCase() || "";

      if (message.includes("email not confirmed")) {
        setError(
          "Your email is not confirmed. Please confirm your email before logging in."
        );
      } else if (
        message.includes("invalid login credentials") ||
        message.includes("invalid login")
      ) {
        setError("Invalid email or password.");
      } else {
        setError(err?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // While the stored session is being confirmed. A spinner rather than a
  // skeleton of the form: the form may never be shown at all, because a
  // signed-in visitor is redirected straight to their dashboard.
  if (authLoading) {
    return (
      <div className="hv-root flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
          <p className="prose-muted text-sm">Checking your session…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthLayout
      eyebrow="Administrative portal"
      title="Manage campus events with"
      accent="clarity."
      blurb="A unified institutional platform for faculty event submissions, Dean review workflows, and status tracking across Swami Rama Himalayan University."
      bullets={BULLETS}
      formTitle="Welcome back"
      formSubtitle="Sign in with your authorized institutional credentials."
      footer={
        <>
          Need faculty account access?{" "}
          <Link to="/register" className="link font-semibold">
            Register here
          </Link>
        </>
      }
    >
      <AuthAlert icon={<IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}>
        {error}
      </AuthAlert>

      <form onSubmit={handleLogin} className="space-y-4">

        <div className="field">
          <label htmlFor="email">Institutional email</label>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
              <IconMail className="h-4 w-4" />
            </span>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@srhu.edu.in"
              autoComplete="email"
              disabled={loading}
              className="input pl-10"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
              <IconKey className="h-4 w-4" />
            </span>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
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
        </div>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="link text-xs font-medium">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-block group mt-2"
        >
          {loading && <span className="spin h-4 w-4" />}
          {loading ? "Signing in…" : "Sign in to portal"}
          {!loading && (
            <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Login;
