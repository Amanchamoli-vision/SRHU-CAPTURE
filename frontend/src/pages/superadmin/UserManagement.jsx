import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import Modal from "../../components/teacher/Modal";
import RoleChip from "../../components/common/RoleChip";
import Pagination from "../../components/common/Pagination";
import { ROLE_TRACK, initialsOf, trackOfRole } from "../../components/common/roles";
import {
  IconAlertTriangle,
  IconAward,
  IconCheckCircle,
  IconInbox,
  IconRefresh,
  IconSearch,
  IconShield,
  IconTrash,
  IconUser,
  IconUserPlus,
  IconX,
} from "../../components/teacher/icons";

const ROLE_TABS = [
  { key: "all", label: "All" },
  { key: "teacher", label: "Teachers" },
  { key: "dean", label: "Deans" },
  { key: "superadmin", label: "Super Admins" },
];

const TABLE_COLUMNS = ["User", "Role", "Joined", "Actions"];

const formatJoined = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * What each confirmation dialog says and does. Kept in one table so the
 * phone cards and the desktop table can never offer different actions.
 */
const ACTIONS = {
  dean: {
    eyebrow: "Change role",
    title: "Promote to Dean?",
    body: (name) => `${name} will be able to review, approve and reject event proposals from every teacher.`,
    confirm: "Make Dean",
    busy: "Updating…",
    tone: "btn-brand",
    method: "PATCH",
    path: (id) => `/superadmin/users/${id}/make-dean`,
    success: (name) => `${name} is now a Dean.`,
    failure: "Failed to make user Dean.",
  },
  teacher: {
    eyebrow: "Change role",
    title: "Change back to Teacher?",
    body: (name) => `${name} will lose Dean access and return to submitting their own events for review.`,
    confirm: "Make Teacher",
    busy: "Updating…",
    tone: "btn-brand",
    method: "PATCH",
    path: (id) => `/superadmin/users/${id}/make-teacher`,
    success: (name) => `${name} is now a Teacher.`,
    failure: "Failed to make user Teacher.",
  },
  delete: {
    eyebrow: "Permanent",
    title: "Delete this account?",
    body: (name) => `${name} will be removed from Campus Capture along with their sign-in. This cannot be undone.`,
    confirm: "Delete account",
    busy: "Deleting…",
    tone: "btn-danger",
    method: "DELETE",
    path: (id) => `/superadmin/users/${id}`,
    success: () => "User deleted successfully.",
    failure: "Failed to delete user.",
  },
};

function UserManagement() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, teacher: 0, dean: 0, superadmin: 0 });
  const [loading, setLoading] = useState(true);
  const [processingUserId, setProcessingUserId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rawPer = Number(searchParams.get("per")) || 25;
  const per = [25, 50, 100].includes(rawPer) ? rawPer : 25;
  const skip = (page - 1) * per;

  const urlQ = searchParams.get("q") || "";
  const [searchDraft, setSearchDraft] = useState(urlQ);

  // Sync draft when URL q changes (e.g. back button, clear filters)
  useEffect(() => {
    setSearchDraft(urlQ);
  }, [urlQ]);

  // Debounce searchDraft -> URL query string, resetting to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchDraft.trim();
      if (trimmed !== urlQ) {
        const next = new URLSearchParams(searchParams);
        if (trimmed) next.set("q", trimmed);
        else next.delete("q");
        next.delete("page");
        setSearchParams(next, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft, urlQ, searchParams, setSearchParams]);

  // { kind: "dean" | "teacher" | "delete", user }
  const [pending, setPending] = useState(null);

  const roleFilter = ROLE_TABS.some((t) => t.key === searchParams.get("role"))
    ? searchParams.get("role")
    : "all";

  const setRoleFilter = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === "all") next.delete("role");
    else next.set("role", key);
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const setPage = (nextPage) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const setPerPage = (nextPer) => {
    const next = new URLSearchParams(searchParams);
    if (nextPer !== 25) next.set("per", String(nextPer));
    else next.delete("per");
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  // A 401 means the login token is gone or rejected even after a refresh;
  // apiJson has already cleared the stored session by then.
  const handleUnauthorized = useCallback(() => {
    setError("Your session has expired. Please login again.");
    navigate("/login");
  }, [navigate]);

  // ------------------------------------------------------------ load
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(per),
      });
      if (roleFilter !== "all") {
        params.set("role", roleFilter);
      }
      if (urlQ) {
        params.set("q", urlQ);
      }

      const data = await apiJson(`/superadmin/users?${params}`);
      setUsers(data?.users || []);
      setTotal(data?.total || 0);
      if (data?.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized();
        return;
      }
      console.error("Load users error:", err);
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [skip, per, roleFilter, urlQ, handleUnauthorized]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // A success line should not sit there forever; an error stays until read.
  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(""), 4500);
    return () => clearTimeout(t);
  }, [success]);

  // ------------------------------------------------------------ actions
  const runPendingAction = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    const action = ACTIONS[kind];
    const displayName = user.name || user.email || "this user";

    try {
      setProcessingUserId(user.id);
      setError("");
      setSuccess("");

      const data = await apiJson(action.path(user.id), { method: action.method });

      setSuccess(data?.message || action.success(displayName));
      setPending(null);
      if (kind === "delete" && users.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await loadUsers();
      }
    } catch (err) {
      if (err?.status === 401) {
        setPending(null);
        handleUnauthorized();
        return;
      }
      console.error(`${kind} action error:`, err);
      setError(err.message || action.failure);
      setPending(null);
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const visibleUsers = users;

  const isSelf = (user) => profile?.id && user.id === profile.id;

  const pendingAction = pending ? ACTIONS[pending.kind] : null;
  const pendingName = pending ? pending.user.name || pending.user.email || "this user" : "";
  const pendingBusy = pending ? processingUserId === pending.user.id : false;

  // ------------------------------------------------------------ UI
  return (
    <SuperAdminShell
      active="users"
      profile={profile}
      onLogout={handleLogout}
      railBadge={loading ? undefined : (counts.all ?? total)}
      railNote="Promoting a teacher to Dean takes effect immediately. Deleting an account cannot be undone."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        <PageHero
          eyebrow="Super Admin"
          title="User"
          accent="Management"
          subtitle="Every registered account across Swami Rama Himalayan University. Promote teachers to Deans, step Deans back to teachers, or remove accounts."
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={loadUsers}
                disabled={loading}
                className="btn btn-ghost"
              >
                {loading ? <span className="spin h-4 w-4" /> : <IconRefresh />}
                Refresh
              </button>
              <Link to="/superadmin/create-dean" className="btn btn-primary">
                <IconUserPlus />
                Create Dean
              </Link>
            </div>
          }
        />

        {error && (
          <div
            className="mt-6 flex items-start gap-3 rounded-2xl border p-4"
            data-tint=""
            style={{ "--track": "#EF4444" }}
            role="alert"
          >
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Action failed</p>
              <p className="prose-muted mt-0.5 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="btn btn-ghost btn-xs shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {success && (
          <div
            className="mt-6 flex items-start gap-3 rounded-2xl border p-4"
            data-tint=""
            style={{ "--track": "#10B981" }}
            role="status"
          >
            <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Success</p>
              <p className="prose-muted mt-0.5 text-sm">{success}</p>
            </div>
            <button
              type="button"
              onClick={() => setSuccess("")}
              className="btn btn-ghost btn-xs shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ----------------------------------------------------- toolbar */}
        <div className="reveal mt-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between" style={{ "--i": 1 }}>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by role">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={roleFilter === tab.key}
                onClick={() => setRoleFilter(tab.key)}
                className="tab"
              >
                {tab.key !== "all" && (
                  <span className="dot dot-sm" style={{ "--track": ROLE_TRACK[tab.key] }} />
                )}
                {tab.label}
                <span className="tab-count">{counts[tab.key] ?? 0}</span>
              </button>
            ))}
          </div>

          <label className="relative block w-full md:w-72">
            <span className="sr-only">Search users</span>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search by name or email"
              className="input pl-10"
            />
          </label>
        </div>

        {/* ----------------------------------------------------- results */}
        <section className="glass reveal mt-4 overflow-hidden" style={{ "--i": 2 }}>
          <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-4">
            <div>
              <p className="eyebrow">Directory</p>
              <h2 className="h3 text-ink">
                {roleFilter === "all" ? "All users" : ROLE_TABS.find((t) => t.key === roleFilter).label}
              </h2>
            </div>
            {!loading && (
              <p className="num text-sm text-muted">
                <span className="font-semibold text-ink">
                  {total === 0 ? 0 : `${skip + 1}–${Math.min(skip + visibleUsers.length, total)}`}
                </span>
                {" of "}
                {total}
              </p>
            )}
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center">
              <span className="spin mx-auto mb-4 block h-9 w-9 text-accent" />
              <p className="prose-muted text-sm">Loading users…</p>
            </div>
          ) : visibleUsers.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="icon-tile mx-auto">
                <IconInbox />
              </span>
              <p className="h3 mt-4 text-ink">
                {total === 0 && !urlQ && roleFilter === "all" ? "No users yet" : "No matches"}
              </p>
              <p className="prose-muted mt-1 text-sm">
                {total === 0 && !urlQ && roleFilter === "all"
                  ? "There are no registered accounts in the system."
                  : "Try a different search or clear the role filter."}
              </p>
              {(urlQ || roleFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    const next = new URLSearchParams(searchParams);
                    next.delete("q");
                    next.delete("role");
                    next.delete("page");
                    setSearchParams(next, { replace: true });
                  }}
                  className="btn btn-ghost btn-sm mt-5"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Phone: one card per account. */}
              <ul className="divide-y divide-line/8 md:hidden">
                {visibleUsers.map((user) => (
                  <li key={user.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Avatar user={user} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-semibold text-ink">
                            {user.name || "Unnamed user"}
                          </span>
                          {isSelf(user) && (
                            <span className="badge badge-accent text-[10px]">You</span>
                          )}
                          <RoleChip role={user.role} />
                        </div>
                        <p className="prose-muted mt-0.5 truncate text-xs">{user.email}</p>
                        <p className="prose-muted mt-1 text-[11px]">
                          Joined {formatJoined(user.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1.5 border-t hairline pt-3">
                      <RowActions
                        user={user}
                        self={isSelf(user)}
                        busy={processingUserId === user.id}
                        onAct={(kind) => setPending({ kind, user })}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: standard table with sticky header. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b hairline bg-raised/40">
                      {TABLE_COLUMNS.map((col, idx) => (
                        <th
                          key={col}
                          scope="col"
                          className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted ${
                            idx === TABLE_COLUMNS.length - 1 ? "text-right" : ""
                          }`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/8">
                    {visibleUsers.map((user) => (
                      <tr key={user.id} className="transition hover:bg-raised/40">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar user={user} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-display text-sm font-semibold text-ink">
                                  {user.name || "Unnamed user"}
                                </span>
                                {isSelf(user) && (
                                  <span className="badge badge-accent text-[10px]">You</span>
                                )}
                              </div>
                              <p className="prose-muted truncate text-xs">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <RoleChip role={user.role} />
                        </td>
                        <td className="num whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                          {formatJoined(user.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <RowActions
                              user={user}
                              self={isSelf(user)}
                              busy={processingUserId === user.id}
                              onAct={(kind) => setPending({ kind, user })}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {total > 0 && (
            <Pagination
              page={page}
              perPage={per}
              total={total}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              disabled={loading}
            />
          )}
        </section>
      </div>

      {/* --------------------------------------------- confirm dialog */}
      <Modal
        open={Boolean(pending)}
        onClose={() => { if (!pendingBusy) setPending(null); }}
        eyebrow={pendingAction?.eyebrow}
        title={pendingAction?.title}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={pendingBusy}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runPendingAction}
              disabled={pendingBusy}
              className={`btn btn-sm ${pendingAction?.tone || "btn-brand"}`}
            >
              {pendingBusy ? (
                <>
                  <span className="spin h-4 w-4" />
                  {pendingAction?.busy}
                </>
              ) : (
                <>
                  {pending?.kind === "delete" ? <IconTrash /> : pending?.kind === "dean" ? <IconAward /> : <IconUser />}
                  {pendingAction?.confirm}
                </>
              )}
            </button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border hairline bg-raised/40 p-3.5">
              <Avatar user={pending.user} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-ink">
                  {pending.user.name || "Unnamed user"}
                </p>
                <p className="truncate text-xs text-muted">{pending.user.email}</p>
              </div>
              <RoleChip role={pending.user.role} />
            </div>

            <p className="prose-muted text-sm">{pendingAction.body(pendingName)}</p>

            {pending.kind === "delete" && (
              <div
                className="flex items-start gap-3 rounded-2xl border p-3.5"
                data-tint=""
                style={{ "--track": "#EF4444" }}
              >
                <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
                <p className="text-sm text-ink">
                  Their events and uploads stay in the record, but they will no longer be able to sign in.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </SuperAdminShell>
  );
}

/* ----------------------------------------------------------- small parts */

function Avatar({ user }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold ring-1"
      style={{
        "--track": trackOfRole(user.role),
        background: "color-mix(in srgb, var(--track) 14%, transparent)",
        color: "color-mix(in srgb, var(--track) 80%, rgb(var(--c-ink)))",
        "--tw-ring-color": "color-mix(in srgb, var(--track) 30%, transparent)",
      }}
      aria-hidden="true"
    >
      {initialsOf(user.name, user.email)}
    </span>
  );
}

/**
 * The actions an account allows. Super admins are protected: the platform has no
 * flow for demoting or removing one from here, and the signed-in super admin can
 * never act on themselves.
 */
function RowActions({ user, self, busy, onAct }) {
  const role = normalizeRole(user.role);

  if (role === "superadmin" || self) {
    return (
      <span className="chip chip-sm">
        <IconShield />
        Protected
      </span>
    );
  }

  return (
    <>
      {role === "teacher" && (
        <button
          type="button"
          onClick={() => onAct("dean")}
          disabled={busy}
          className="btn btn-brand btn-xs"
        >
          <IconAward />
          Make Dean
        </button>
      )}
      {role === "dean" && (
        <button
          type="button"
          onClick={() => onAct("teacher")}
          disabled={busy}
          className="btn btn-ghost btn-xs"
        >
          <IconUser />
          Make Teacher
        </button>
      )}
      <button
        type="button"
        onClick={() => onAct("delete")}
        disabled={busy}
        className="btn btn-danger btn-xs"
        title="Delete account"
      >
        <IconTrash />
        Delete
      </button>
    </>
  );
}

export default UserManagement;
