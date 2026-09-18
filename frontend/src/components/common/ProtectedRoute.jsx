import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { DEAN_PASSWORD_PATH, mustChangePassword } from "./roles";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
          <p className="text-sm font-medium text-slate-500">
            Checking authorization...
          </p>
        </div>
      </div>
    );
  }

  // Default-deny: If unauthenticated, or user profile/role is missing, redirect to /login
  if (!user || !role) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Default-deny: If allowedRoles is specified and the user's role is not included, redirect to /login
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  // A Dean still on a temporary password is kept on the change-password
  // screen until they set a new one.
  if (mustChangePassword(user) && location.pathname !== DEAN_PASSWORD_PATH) {
    return <Navigate to={DEAN_PASSWORD_PATH} state={{ mustChangePassword: true }} replace />;
  }

  return children;
}
