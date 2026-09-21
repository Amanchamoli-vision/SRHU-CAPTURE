import { Navigate, useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { arrivedByHistory } from "../../utils/historyArrival";
import { postLoginPath } from "./roles";

function SessionSpinner({ label }) {
  return (
    <div className="hv-root flex min-h-screen items-center justify-center">
      <div className="text-center">
        <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
        <p className="prose-muted text-sm">{label}</p>
      </div>
    </div>
  );
}

/**
 * The mirror of ProtectedRoute: a route only a signed-out visitor should see.
 *
 * Someone who opens the sign-in or registration form while already signed in
 * (a link, a bookmark, the address bar) is sent to their dashboard. The
 * redirect is `replace`, so the form never becomes a Back target of the
 * dashboard it sends them to.
 *
 * Someone who comes back to it with Back/Forward is instead leaving the
 * signed-in area, and EndSessionOnHistoryReturn is ending their session;
 * they wait here for that and then get the form.
 *
 * `from` is the deep link ProtectedRoute stored when it bounced the visitor
 * here; postLoginPath honours it only inside the user's own role area.
 */
export default function PublicOnlyRoute({ children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const navigationType = useNavigationType();

  // Waiting on the stored session. Rendering the form first would flash it at
  // a signed-in user for as long as /auth/me takes to answer.
  if (loading) return <SessionSpinner label="Checking your session…" />;

  if (user && role) {
    if (arrivedByHistory(navigationType)) return <SessionSpinner label="Signing you out…" />;
    const target = postLoginPath(user, location.state?.from);
    if (target) return <Navigate to={target} replace />;
  }

  return children;
}
