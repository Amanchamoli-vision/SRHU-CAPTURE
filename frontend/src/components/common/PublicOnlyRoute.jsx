import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { postLoginPath } from "./roles";

/**
 * The mirror of ProtectedRoute: a route only a signed-out visitor should see.
 *
 * Without it the sign-in and registration forms stayed reachable to someone who
 * was already signed in, so Back (or a bookmark, or Forward after a bounce)
 * dropped an authenticated user back onto a login form. The redirect is
 * `replace`, so the auth screen never becomes a Back target of the dashboard
 * it sends the user to.
 *
 * `from` is the deep link ProtectedRoute stored when it bounced the visitor
 * here; postLoginPath honours it only inside the user's own role area.
 */
export default function PublicOnlyRoute({ children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Waiting on the stored session. Rendering the form first would flash it at
  // a signed-in user for as long as /auth/me takes to answer.
  if (loading) {
    return (
      <div className="hv-root flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
          <p className="prose-muted text-sm">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (user && role) {
    const target = postLoginPath(user, location.state?.from);
    if (target) return <Navigate to={target} replace />;
  }

  return children;
}
