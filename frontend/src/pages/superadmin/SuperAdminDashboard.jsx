import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import { ROLE_TRACK } from "../../components/common/roles";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconAward,
  IconClock,
  IconRefresh,
  IconShield,
  IconUser,
  IconUserPlus,
  IconUsers,
  RidgeDivider,
} from "../../components/teacher/icons";

const EMPTY_STATS = {
  total_users: 0,
  teachers: 0,
  deans: 0,
  superadmins: 0,
  pending_events: 0,
};

const ALL_USERS_TRACK = "#10B981"; // emerald: the whole directory, no single role

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);

      const data = await apiJson("/superadmin/dashboard/stats");
      setError("");
      setStats({ ...EMPTY_STATS, ...data });
    } catch (err) {
      // 401 means the token is gone or rejected even after a refresh; apiJson
      // has already cleared the stored session by then.
      if (err?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Super Admin Dashboard Error:", err);
      setError(err?.message || "Unable to load dashboard statistics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const summaryCards = [
    {
      key: "all",
      label: "Total Users",
      value: stats.total_users,
      hint: "Open the directory",
      to: "/superadmin/users",
      track: ALL_USERS_TRACK,
      Icon: IconUsers,
    },
    {
      key: "teachers",
      label: "Teachers",
      value: stats.teachers,
      hint: "View teachers",
      to: "/superadmin/users?role=teacher",
      track: ROLE_TRACK.teacher,
      Icon: IconUser,
    },
    {
      key: "deans",
      label: "Deans",
      value: stats.deans,
      hint: "View deans",
      to: "/superadmin/users?role=dean",
      track: ROLE_TRACK.dean,
      Icon: IconAward,
    },
    {
      key: "pending",
      label: "Pending Events",
      value: stats.pending_events,
      hint: "Awaiting a Dean decision",
      track: trackOf("pending"),
      Icon: IconClock,
    },
  ];

  const roleShare = [
    { key: "teacher", label: "Teachers", value: stats.teachers, track: ROLE_TRACK.teacher },
    { key: "dean", label: "Deans", value: stats.deans, track: ROLE_TRACK.dean },
    { key: "superadmin", label: "Super Admins", value: stats.superadmins, track: ROLE_TRACK.superadmin },
  ];
  const roleTotal = roleShare.reduce((sum, r) => sum + (r.value || 0), 0);

  const managementCards = [
    {
      key: "users",
      to: "/superadmin/users",
      track: ROLE_TRACK.teacher,
      Icon: IconUsers,
      title: "User Management",
      body: "Browse every registered account, promote a teacher to Dean, step a Dean back to teacher, or remove an account.",
      cta: "Manage users",
    },
    {
      key: "create-dean",
      to: "/superadmin/create-dean",
      track: ROLE_TRACK.dean,
      Icon: IconUserPlus,
      title: "Create Dean",
      body: "Open a new Dean account for the university. A temporary password is generated for you to hand over securely.",
      cta: "Create a Dean",
    },
  ];

  if (loading) {
    return (
      <div className="hv-root flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
          <p className="prose-muted text-sm">Loading super admin console…</p>
        </div>
      </div>
    );
  }

  return (
    <SuperAdminShell
      active="dashboard"
      profile={profile}
      onLogout={handleLogout}
      railBadge={stats.total_users}
      railNote="Roles decide what a person can do: teachers propose events, Deans approve them, super admins manage accounts."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        <PageHero
          eyebrow="Super Admin"
          title="Super Admin"
          accent="Console"
          subtitle={`Welcome back, ${profile?.name || "Super Admin"}. Manage accounts, roles and Dean access for Campus Capture.`}
          actions={
            <>
              <button
                type="button"
                onClick={() => loadStats({ silent: true })}
                disabled={refreshing}
                className="btn btn-ghost"
              >
                {refreshing ? <span className="spin h-4 w-4" /> : <IconRefresh />}
                Refresh
              </button>
              <Link to="/superadmin/create-dean" className="btn btn-primary">
                <IconUserPlus />
                Create Dean
              </Link>
            </>
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
              <p className="text-sm font-semibold text-ink">Statistics unavailable</p>
              <p className="prose-muted mt-0.5 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => loadStats({ silent: true })}
              className="btn btn-ghost btn-xs shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* ------------------------------------------------ summary cards */}
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card, i) => {
            const Tag = card.to ? Link : "div";
            return (
              <Tag
                key={card.key}
                to={card.to}
                style={{ "--track": card.track, "--i": i + 1 }}
                className="stat-card reveal group"
              >
                <span className="stat-watermark" aria-hidden="true">{i + 1}</span>

                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted">{card.label}</p>
                    <p className="stat-num mt-1.5" style={{ color: card.track }}>
                      {card.value}
                    </p>
                  </div>
                  <span className="icon-tile icon-tile-track">
                    <card.Icon />
                  </span>
                </div>

                <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted">
                  {card.hint}
                  {card.to && (
                    <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  )}
                </p>
              </Tag>
            );
          })}
        </div>

        <RidgeDivider className="divider my-4" />

        {/* -------------------------------- role share + management cards */}
        <div className="grid gap-4 lg:grid-cols-5">

          <section className="glass reveal p-6 lg:col-span-2" style={{ "--i": 5 }}>
            <div className="flex items-center gap-3">
              <span className="icon-tile">
                <IconShield />
              </span>
              <div>
                <p className="eyebrow">Directory</p>
                <h2 className="h3 text-ink">Accounts by role</h2>
              </div>
            </div>

            {roleTotal === 0 ? (
              <p className="prose-muted mt-5 text-sm">No accounts registered yet.</p>
            ) : (
              <>
                <div
                  className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-raised"
                  role="img"
                  aria-label={roleShare.map((r) => `${r.label}: ${r.value}`).join(", ")}
                >
                  {roleShare
                    .filter((r) => r.value > 0)
                    .map((r) => (
                      <span
                        key={r.key}
                        style={{ width: `${(r.value / roleTotal) * 100}%`, background: r.track }}
                        className="h-full min-w-1 transition-[width] duration-300"
                      />
                    ))}
                </div>

                <ul className="mt-4 space-y-2.5">
                  {roleShare.map((r) => (
                    <li key={r.key} className="flex items-center gap-3 text-sm">
                      <span className="dot dot-sm" style={{ "--track": r.track }} />
                      <span className="text-muted">{r.label}</span>
                      <span className="num ml-auto font-semibold text-ink">{r.value}</span>
                      <span className="num w-10 text-right text-xs text-muted">
                        {Math.round((r.value / roleTotal) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
            {managementCards.map((card, i) => (
              <Link
                key={card.key}
                to={card.to}
                style={{ "--track": card.track, "--i": 6 + i }}
                className="stat-card reveal group"
              >
                <div className="relative">
                  <span className="icon-tile icon-tile-track">
                    <card.Icon />
                  </span>
                  <h2 className="h3 mt-4 text-ink">{card.title}</h2>
                  <p className="prose-muted mt-2 text-sm">{card.body}</p>
                </div>
                <span className="mt-auto flex items-center gap-1.5 pt-5 font-display text-sm font-semibold text-accent">
                  {card.cta}
                  <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </SuperAdminShell>
  );
}

export default SuperAdminDashboard;
