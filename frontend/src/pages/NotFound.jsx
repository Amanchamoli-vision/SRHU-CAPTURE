import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { normalizeRole } from "../components/common/roles";
import { IconArrowLeft, IconSearch } from "../components/teacher/icons";

const HOME_BY_ROLE = {
  teacher: "/teacher/dashboard",
  dean: "/dean/dashboard",
  superadmin: "/superadmin/dashboard",
};

/**
 * Catch-all for URLs no route matches. Without it React Router renders nothing
 * and the visitor is left staring at a blank page.
 */
export default function NotFound() {
  const { pathname } = useLocation();
  const { role, loading } = useAuth();
  const home = HOME_BY_ROLE[normalizeRole(role)];

  return (
    <div className="hv-root flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md p-8 text-center">
        <span className="icon-tile mx-auto">
          <IconSearch />
        </span>

        <p className="eyebrow mt-5">Error 404</p>
        <h1 className="h3 mt-1 text-ink">Page not found</h1>
        <p className="prose-muted mt-3 wrap-break-word text-sm">
          There is no page at <code className="font-mono">{pathname}</code>. The link
          may be mistyped, or the page may have moved.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {!loading && home ? (
            <Link to={home} className="btn btn-primary btn-sm">
              Go to my dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
          <Link to="/" className="btn btn-ghost btn-sm">
            <IconArrowLeft />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
