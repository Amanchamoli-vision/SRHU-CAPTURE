import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiJson, isAbortError } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import DeanShell from "../../components/dean/DeanShell";
import PageHero from "../../components/teacher/PageHero";
import Modal from "../../components/teacher/Modal";
import StatCard from "../../components/common/StatCard";
import Pagination from "../../components/common/Pagination";
import { PER_PAGE_OPTIONS, DEFAULT_PER_PAGE } from "../../hooks/useTableQuery";
import { ROLE_TRACK, initialsOf } from "../../components/common/roles";
import { DESIGNATION_SUGGESTIONS } from "../../utils/designations";
import { isValidPhone, normalizePhoneInput } from "../../utils/phone";
import { sendCredentialsInChunks } from "../../services/deanTeachers";
import CredentialReport from "../../components/dean/CredentialReport";
import ImportTeachersModal from "../../components/dean/ImportTeachersModal";
import {
  IconActivity,
  IconAlertTriangle,
  IconAward,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconInbox,
  IconKey,
  IconMail,
  IconMoreHorizontal,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUsers,
  IconX,
  IconXCircle,
} from "../../components/teacher/icons";

/**
 * The Dean's Teacher-account management (/dean/teachers).
 *
 * Modelled on the superadmin's User Management, narrowed to Teacher accounts.
 * Every action goes through /dean/teachers, which re-checks on the server that
 * the caller is a Dean and the target is a Teacher -- nothing here is the
 * permission boundary, it only avoids offering what the server would refuse.
 *
 * No password is ever shown: credentials and reset links go to the teacher's
 * inbox, and the API never returns them.
 */

const STATUS_TABS = [
  { key: "all", label: "All Teachers" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "pending", label: "Never signed in" },
];

const VERIFIED_OPTIONS = [
  { key: "all", label: "Any email status" },
  { key: "verified", label: "Email verified" },
  { key: "unverified", label: "Email not verified" },
];

const SOURCE_OPTIONS = [
  { key: "all", label: "Any source" },
  { key: "imported", label: "Imported from Excel" },
  { key: "registered", label: "Registered / onboarded" },
];

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name (A–Z)" },
  { key: "last_login", label: "Last login" },
];

// The desktop table is fixed-layout: every column but Teacher has a set width
// and Teacher takes what is left, truncating long emails instead of pushing
// the table past the screen. Status gathers what used to be three columns.
const TABLE_COLUMNS = [
  { label: "Teacher", width: "" },
  { label: "Mobile", width: "w-28" },
  { label: "Status", width: "w-56" },
  { label: "Last login", width: "w-40" },
  { label: "Actions", width: "w-32", align: "text-right" },
];

const TRACK_OK = "#10B981";
const TRACK_ERR = "#EF4444";
const TRACK_WARN = "#F59E0B";

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const nameOf = (t) => t?.name || t?.email || "this teacher";
const isActive = (t) => t?.is_active !== false;

/** What each confirmation dialog says and does. One table, so the phone
 *  cards and the desktop table can never offer different actions. */
const ACTIONS = {
  credentials: {
    eyebrow: "Login credentials",
    title: "Send login credentials?",
    body: (name, t) =>
      `${name} will be emailed a new temporary password at ${t.email} and asked to choose their own on first sign-in. Any password they had stops working and open sessions are signed out.`,
    confirm: "Send credentials",
    busy: "Sending…",
    tone: "btn-brand",
    Icon: IconMail,
    method: "POST",
    path: (id) => `/dean/teachers/${id}/send-credentials`,
  },
  reset: {
    eyebrow: "Password reset",
    title: "Send a password reset link?",
    body: (name, t) =>
      `${name} will be emailed a one-time link at ${t.email} to choose a new password. Their current password keeps working until they use it.`,
    confirm: "Send reset link",
    busy: "Sending…",
    tone: "btn-brand",
    Icon: IconKey,
    method: "POST",
    path: (id) => `/dean/teachers/${id}/reset-password`,
  },
  promote: {
    eyebrow: "Change role",
    title: "Promote to Dean?",
    body: (name) =>
      `${name} will become a Dean: they will review, approve and reject event proposals from every teacher and manage Teacher accounts. They will be signed out and must sign in again. You will no longer be able to manage this account from here.`,
    confirm: "Promote to Dean",
    busy: "Promoting…",
    tone: "btn-brand",
    Icon: IconAward,
    method: "POST",
    path: (id) => `/dean/teachers/${id}/promote`,
  },
  deactivate: {
    eyebrow: "Account access",
    title: "Deactivate this Teacher?",
    body: (name) =>
      `${name} will be signed out everywhere immediately and will not be able to sign in. Their events and uploads are kept. You can reactivate the account at any time.`,
    confirm: "Deactivate",
    busy: "Deactivating…",
    tone: "btn-danger",
    Icon: IconXCircle,
    method: "POST",
    path: (id) => `/dean/teachers/${id}/deactivate`,
  },
  activate: {
    eyebrow: "Account access",
    title: "Reactivate this Teacher?",
    body: (name) => `${name} will be able to sign in and use Campus Capture again.`,
    confirm: "Reactivate",
    busy: "Activating…",
    tone: "btn-ok",
    Icon: IconCheck,
    method: "POST",
    path: (id) => `/dean/teachers/${id}/activate`,
  },
  delete: {
    eyebrow: "Permanent",
    title: "Are you sure you want to delete this Teacher account?",
    body: (name) => `${name}'s account will be removed from Campus Capture. This cannot be undone.`,
    confirm: "Delete account",
    busy: "Deleting…",
    tone: "btn-danger",
    Icon: IconTrash,
    method: "DELETE",
    path: (id) => `/dean/teachers/${id}`,
  },
};

export default function Teachers() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // ------------------------------------------------------------ URL state
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rawPer = Number(searchParams.get("per")) || DEFAULT_PER_PAGE;
  const per = PER_PAGE_OPTIONS.includes(rawPer) ? rawPer : DEFAULT_PER_PAGE;
  const skip = (page - 1) * per;
  const urlQ = searchParams.get("q") || "";
  const statusFilter = STATUS_TABS.some((t) => t.key === searchParams.get("status"))
    ? searchParams.get("status")
    : "all";
  const verifiedFilter = VERIFIED_OPTIONS.some((o) => o.key === searchParams.get("verified"))
    ? searchParams.get("verified")
    : "all";
  const sourceFilter = SOURCE_OPTIONS.some((o) => o.key === searchParams.get("source"))
    ? searchParams.get("source")
    : "all";
  const sort = SORT_OPTIONS.some((o) => o.key === searchParams.get("sort"))
    ? searchParams.get("sort")
    : "newest";

  const updateParams = useCallback(
    (changes, { keepPage = false } = {}) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === "" || value === undefined) next.delete(key);
        else next.set(key, String(value));
      });
      if (!keepPage) next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [searchDraft, setSearchDraft] = useState(urlQ);
  useEffect(() => setSearchDraft(urlQ), [urlQ]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchDraft.trim();
      if (trimmed !== urlQ) updateParams({ q: trimmed || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft, urlQ, updateParams]);

  // ------------------------------------------------------------ data
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, active: 0, inactive: 0, pending: 0 });
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activityKey, setActivityKey] = useState(0);

  const loadControllerRef = useRef(null);
  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const handleApiError = useCallback(
    (err, fallback) => {
      if (err?.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err?.message || fallback);
    },
    [navigate],
  );

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (verifiedFilter !== "all") params.set("verified", verifiedFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (urlQ) params.set("q", urlQ);
    params.set("sort", sort);
    return params;
  }, [statusFilter, verifiedFilter, sourceFilter, urlQ, sort]);

  const loadTeachers = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;

    try {
      setLoading(true);
      const params = new URLSearchParams(filterParams);
      params.set("skip", String(skip));
      params.set("limit", String(per));
      const data = await apiJson(`/dean/teachers?${params}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setTeachers(data?.teachers || []);
      setTotal(data?.total || 0);
      if (data?.counts) setCounts(data.counts);
      setEmailConfigured(data?.email_configured !== false);
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      handleApiError(err, "Failed to load teachers.");
      setTeachers([]);
      setTotal(0);
    } finally {
      if (loadControllerRef.current === controller) setLoading(false);
    }
  }, [filterParams, skip, per, handleApiError]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const refreshAll = useCallback(async () => {
    setActivityKey((k) => k + 1);
    await loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  // ------------------------------------------------------------ selection
  // Keyed by id and kept across pages and filters, so a Dean can pick
  // teachers from several pages before sending.
  const [selected, setSelected] = useState(() => new Map());
  const [selectingAll, setSelectingAll] = useState(false);

  const pageIds = teachers.map((t) => t.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleOne = (teacher) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(teacher.id)) next.delete(teacher.id);
      else next.set(teacher.id, teacher);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) teachers.forEach((t) => next.delete(t.id));
      else teachers.forEach((t) => next.set(t.id, t));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Map());

  /** Every teacher matching the current filters, across all pages. */
  const selectAllMatching = async () => {
    try {
      setSelectingAll(true);
      const next = new Map(selected);
      for (let offset = 0; offset < total; offset += 100) {
        const params = new URLSearchParams(filterParams);
        params.set("skip", String(offset));
        params.set("limit", "100");
        const data = await apiJson(`/dean/teachers?${params}`);
        (data?.teachers || []).forEach((t) => next.set(t.id, t));
        if (!data?.has_more) break;
      }
      setSelected(next);
    } catch (err) {
      handleApiError(err, "Could not select every matching teacher.");
    } finally {
      setSelectingAll(false);
    }
  };

  // ------------------------------------------------------------ single actions
  const [pending, setPending] = useState(null); // { kind, teacher }
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingError, setPendingError] = useState("");

  const openAction = (kind, teacher) => {
    setPendingError("");
    setPending({ kind, teacher });
  };

  const runPendingAction = async () => {
    if (!pending) return;
    const { kind, teacher } = pending;
    const action = ACTIONS[kind];
    try {
      setPendingBusy(true);
      setPendingError("");
      setError("");
      const data = await apiJson(action.path(teacher.id), { method: action.method });
      setSuccess(data?.message || "Done.");
      setPending(null);
      if (kind === "delete" || kind === "promote") {
        setSelected((prev) => {
          const next = new Map(prev);
          next.delete(teacher.id);
          return next;
        });
      }
      if ((kind === "delete" || kind === "promote") && teachers.length === 1 && page > 1) {
        updateParams({ page: page - 1 }, { keepPage: true });
        setActivityKey((k) => k + 1);
      } else {
        await refreshAll();
      }
    } catch (err) {
      if (err?.status === 401) {
        setPending(null);
        handleApiError(err);
        return;
      }
      // Kept in the dialog, next to what the Dean just tried.
      setPendingError(err?.message || "The action failed.");
      setActivityKey((k) => k + 1);
    } finally {
      setPendingBusy(false);
    }
  };

  // ------------------------------------------------------------ edit
  const [editing, setEditing] = useState(null);

  // ------------------------------------------------------------ import
  const [importOpen, setImportOpen] = useState(false);

  // ------------------------------------------------------------ bulk send
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRun, setBulkRun] = useState(null); // { done, total, results, running }

  const runBulkSend = async () => {
    const ids = [...selected.keys()];
    if (ids.length === 0) return;
    setBulkConfirmOpen(false);
    setBulkRun({ done: 0, total: ids.length, results: [], running: true, error: "" });

    let withNames;
    let fatal;
    try {
      ({ results: withNames, error: fatal } = await sendCredentialsInChunks(ids, {
        lookup: (id) => selected.get(id),
        onProgress: (done, results) => setBulkRun((prev) => ({ ...prev, done, results })),
      }));
    } catch (err) {
      setBulkRun(null);
      handleApiError(err);
      return;
    }
    setBulkRun({ done: ids.length, total: ids.length, results: withNames, running: false, error: fatal });

    // Anyone who was sent credentials is done; keep the rest selected so the
    // Dean can deal with them.
    setSelected((prev) => {
      const next = new Map(prev);
      withNames.filter((r) => r.status === "sent").forEach((r) => next.delete(r.user_id));
      return next;
    });
    await refreshAll();
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const pendingAction = pending ? ACTIONS[pending.kind] : null;
  const filtersActive =
    Boolean(urlQ) || statusFilter !== "all" || verifiedFilter !== "all" || sourceFilter !== "all";
  const selectedCount = selected.size;

  // ------------------------------------------------------------ UI
  return (
    <DeanShell
      active="teachers"
      profile={profile}
      onLogout={handleLogout}
      railNote="Credentials and reset links are emailed to the teacher. Passwords are never shown here."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
        <PageHero
          eyebrow="Dean Panel"
          title="Teacher"
          accent="Management"
          subtitle="Every Teacher account at Swami Rama Himalayan University. Send login credentials, reset passwords, edit profiles, manage access and promote teachers to Dean."
          actions={
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button type="button" onClick={refreshAll} disabled={loading} className="btn btn-ghost">
                {loading ? <span className="spin h-4 w-4" /> : <IconRefresh />}
                Refresh
              </button>
              <button type="button" onClick={() => setImportOpen(true)} className="btn btn-primary">
                <IconUpload />
                Import from Excel
              </button>
            </div>
          }
        />

        {/* ------------------------------------------------ overview */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="All teachers"
            value={counts.all ?? 0}
            Icon={IconUsers}
            track={ROLE_TRACK.teacher}
            hint="Every Teacher account"
            to="/dean/teachers"
            index={0}
          />
          <StatCard
            label="Active"
            value={counts.active ?? 0}
            Icon={IconCheckCircle}
            track={TRACK_OK}
            hint="Can sign in"
            to="/dean/teachers?status=active"
            index={1}
          />
          <StatCard
            label="Inactive"
            value={counts.inactive ?? 0}
            Icon={IconXCircle}
            track={TRACK_ERR}
            hint="Deactivated accounts"
            to="/dean/teachers?status=inactive"
            index={2}
          />
          <StatCard
            label="Never signed in"
            value={counts.pending ?? 0}
            Icon={IconClock}
            track={TRACK_WARN}
            hint="May need credentials"
            to="/dean/teachers?status=pending"
            index={3}
          />
        </div>

        {!emailConfigured && (
          <Banner track={TRACK_WARN} Icon={IconAlertTriangle} title="Email is not configured">
            Sending credentials and password reset links needs outgoing email, which is not set up on
            this server. Ask the administrator to configure SMTP.
          </Banner>
        )}

        {error && (
          <Banner track={TRACK_ERR} Icon={IconAlertTriangle} title="Action failed" role="alert" onDismiss={() => setError("")}>
            {error}
          </Banner>
        )}

        {success && (
          <Banner track={TRACK_OK} Icon={IconCheckCircle} title="Done" role="status" onDismiss={() => setSuccess("")}>
            {success}
          </Banner>
        )}

        {/* ------------------------------------------------ toolbar */}
        <div className="reveal mt-7 flex flex-col gap-3" style={{ "--i": 1 }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by account status">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.key}
                  onClick={() => updateParams({ status: tab.key === "all" ? null : tab.key })}
                  className="tab"
                >
                  {tab.label}
                  <span className="tab-count">{counts[tab.key] ?? 0}</span>
                </button>
              ))}
            </div>

            <label className="relative block w-full lg:w-72">
              <span className="sr-only">Search teachers</span>
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search name, email, mobile, department"
                className="input pl-10"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={verifiedFilter}
              onChange={(e) => updateParams({ verified: e.target.value === "all" ? null : e.target.value })}
              aria-label="Filter by email verification"
              className="input h-9 w-auto py-0 text-sm"
            >
              {VERIFIED_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => updateParams({ source: e.target.value === "all" ? null : e.target.value })}
              aria-label="Filter by how the teacher was added"
              className="input h-9 w-auto py-0 text-sm"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value === "newest" ? null : e.target.value })}
              aria-label="Sort teachers"
              className="input h-9 w-auto py-0 text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  updateParams({ q: null, status: null, verified: null, source: null });
                }}
                className="btn btn-ghost btn-sm"
              >
                <IconX />
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------ selection bar */}
        {selectedCount > 0 && (
          <div
            className="glass mt-4 flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            role="region"
            aria-label="Selected teachers"
          >
            <p className="text-sm text-ink">
              <span className="num font-semibold">{selectedCount}</span>{" "}
              {selectedCount === 1 ? "teacher" : "teachers"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {total > selectedCount && (
                <button
                  type="button"
                  onClick={selectAllMatching}
                  disabled={selectingAll}
                  className="btn btn-ghost btn-sm"
                >
                  {selectingAll && <span className="spin h-4 w-4" />}
                  Select all {total} matching
                </button>
              )}
              <button type="button" onClick={clearSelection} className="btn btn-ghost btn-sm">
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={!emailConfigured || Boolean(bulkRun?.running)}
                title={emailConfigured ? undefined : "Email is not configured on the server"}
                className="btn btn-primary btn-sm"
              >
                <IconMail />
                Send login credentials
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------ results */}
        <section className="glass reveal mt-4 overflow-hidden" style={{ "--i": 2 }}>
          <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-4">
            <div>
              <p className="eyebrow">Role · Teacher</p>
              <h2 className="h3 text-ink">{STATUS_TABS.find((t) => t.key === statusFilter).label}</h2>
            </div>
            {!loading && (
              <p className="num text-sm text-muted">
                <span className="font-semibold text-ink">
                  {total === 0 ? 0 : `${skip + 1}–${Math.min(skip + teachers.length, total)}`}
                </span>
                {" of "}
                {total}
              </p>
            )}
          </div>

          {loading && teachers.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="spin mx-auto mb-4 block h-9 w-9 text-accent" />
              <p className="prose-muted text-sm">Loading teachers…</p>
            </div>
          ) : teachers.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="icon-tile mx-auto">
                <IconInbox />
              </span>
              <p className="h3 mt-4 text-ink">{filtersActive ? "No matches" : "No teachers yet"}</p>
              <p className="prose-muted mt-1 text-sm">
                {filtersActive
                  ? "Try a different search or clear the filters."
                  : "Teacher accounts appear here once they register or are onboarded."}
              </p>
            </div>
          ) : (
            <>
              {/* Below 1280px: one card per teacher (two a row on a tablet),
                  with a page-level select-all. */}
              <div className="flex items-center gap-3 border-b hairline px-5 py-2.5 xl:hidden">
                <SelectBox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onChange={togglePage}
                  label="Select all teachers on this page"
                />
                <span className="text-xs text-muted">Select all on this page</span>
              </div>
              <ul className={`grid md:grid-cols-2 xl:hidden ${loading ? "opacity-60" : ""}`}>
                {teachers.map((t) => (
                  <li
                    key={t.id}
                    className={`border-b hairline px-5 py-4 md:odd:border-r ${selected.has(t.id) ? "bg-accent/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <SelectBox
                        checked={selected.has(t.id)}
                        onChange={() => toggleOne(t)}
                        label={`Select ${nameOf(t)}`}
                      />
                      <Avatar teacher={t} />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-semibold text-ink">{t.name || "Unnamed"}</p>
                        <p className="prose-muted truncate text-xs">{t.email}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <ActiveChip teacher={t} />
                          <VerifiedChip teacher={t} />
                          <SourceChips teacher={t} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                          {t.phone && <span>Mobile {t.phone}</span>}
                          <span>Created {formatDate(t.created_at)}</span>
                          <span>Last login {t.last_sign_in_at ? formatDate(t.last_sign_in_at) : "Never"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t hairline pt-3">
                      <RowActions
                        teacher={t}
                        emailConfigured={emailConfigured}
                        onAct={openAction}
                        onEdit={setEditing}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {/* 1280px and up: a table that fits the screen without scrolling sideways. */}
              <div className="hidden xl:block">
                <table className="w-full table-fixed text-left">
                  <thead>
                    <tr className="border-b hairline bg-raised/40">
                      <th scope="col" className="w-12 py-3 pl-5 pr-1">
                        <SelectBox
                          checked={allOnPageSelected}
                          indeterminate={!allOnPageSelected && someOnPageSelected}
                          onChange={togglePage}
                          label="Select all teachers on this page"
                        />
                      </th>
                      {TABLE_COLUMNS.map((col) => (
                        <th
                          key={col.label}
                          scope="col"
                          className={`whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted ${col.width} ${col.align || ""}`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-line/8 ${loading ? "opacity-60" : ""}`}>
                    {teachers.map((t) => (
                      <tr
                        key={t.id}
                        className={`transition hover:bg-raised/40 ${selected.has(t.id) ? "bg-accent/5" : ""}`}
                      >
                        <td className="py-3 pl-5 pr-1 align-middle">
                          <SelectBox
                            checked={selected.has(t.id)}
                            onChange={() => toggleOne(t)}
                            label={`Select ${nameOf(t)}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar teacher={t} />
                            <div className="min-w-0">
                              <p className="truncate font-display text-sm font-semibold text-ink" title={t.name || undefined}>
                                {t.name || "Unnamed"}
                              </p>
                              <p className="prose-muted truncate text-xs" title={t.email}>{t.email}</p>
                              {(t.designation || t.department) && (
                                <p
                                  className="prose-muted mt-0.5 truncate text-[11px]"
                                  title={[t.designation, t.department].filter(Boolean).join(" · ")}
                                >
                                  {[t.designation, t.department].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-3 text-sm text-muted">{t.phone || "—"}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            <ActiveChip teacher={t} />
                            <VerifiedChip teacher={t} />
                            <SourceChips teacher={t} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-sm">
                          {t.last_sign_in_at ? (
                            <p className="num text-ink" title={formatDateTime(t.last_sign_in_at) || undefined}>
                              {formatDate(t.last_sign_in_at)}
                            </p>
                          ) : (
                            <p className="text-muted">Never</p>
                          )}
                          <p className="text-[11px] text-muted">Joined {formatDate(t.created_at)}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <RowActions
                              teacher={t}
                              compact
                              emailConfigured={emailConfigured}
                              onAct={openAction}
                              onEdit={setEditing}
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
              onPageChange={(p) => updateParams({ page: p > 1 ? p : null }, { keepPage: true })}
              onPerPageChange={(p) => updateParams({ per: p === DEFAULT_PER_PAGE ? null : p })}
              disabled={loading}
            />
          )}
        </section>

        <ActivityPanel refreshKey={activityKey} />
      </div>

      {/* ------------------------------------------------ confirm dialog */}
      <Modal
        open={Boolean(pending)}
        onClose={() => { if (!pendingBusy) setPending(null); }}
        eyebrow={pendingAction?.eyebrow}
        title={pendingAction?.title}
        footer={
          <>
            <button type="button" onClick={() => setPending(null)} disabled={pendingBusy} className="btn btn-ghost btn-sm">
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
                  {pendingAction && <pendingAction.Icon />}
                  {pendingAction?.confirm}
                </>
              )}
            </button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            <TeacherSummary teacher={pending.teacher} />
            <p className="prose-muted text-sm">{pendingAction.body(nameOf(pending.teacher), pending.teacher)}</p>
            {pending.kind === "delete" && (
              <div className="flex items-start gap-3 rounded-2xl border p-3.5" data-tint="" style={{ "--track": TRACK_ERR }}>
                <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
                <p className="text-sm text-ink">
                  Their events, uploaded media, documents, reports and notifications are deleted with the
                  account. To keep their records, deactivate the account instead.
                </p>
              </div>
            )}
            {pendingError && (
              <div className="toast toast-err text-sm" role="alert">
                <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
                <span>{pendingError}</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------ bulk confirm */}
      <Modal
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        eyebrow="Login credentials"
        title={`Send login credentials to ${selectedCount} ${selectedCount === 1 ? "teacher" : "teachers"}?`}
        footer={
          <>
            <button type="button" onClick={() => setBulkConfirmOpen(false)} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button type="button" onClick={runBulkSend} className="btn btn-primary btn-sm">
              <IconMail />
              Send to {selectedCount}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="prose-muted">
            Each teacher is emailed a new temporary password and asked to choose their own on first
            sign-in. Their previous password stops working and open sessions are signed out.
          </p>
          <p className="prose-muted">
            Some teachers are skipped automatically, and the report says why: deactivated accounts,
            teachers who already sign in with their own password (use Reset Password for them),
            invalid email addresses, and anyone sent credentials in the last few minutes.
          </p>
        </div>
      </Modal>

      {/* ------------------------------------------------ bulk progress + report */}
      <Modal
        open={Boolean(bulkRun)}
        onClose={() => { if (!bulkRun?.running) setBulkRun(null); }}
        eyebrow="Login credentials"
        title={bulkRun?.running ? "Sending credentials…" : "Credential delivery report"}
        wide
        footer={
          !bulkRun?.running && (
            <button type="button" onClick={() => setBulkRun(null)} className="btn btn-primary btn-sm">
              Done
            </button>
          )
        }
      >
        {bulkRun && <CredentialReport run={bulkRun} />}
      </Modal>

      <ImportTeachersModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={refreshAll}
        onUnauthorized={() => navigate("/login", { replace: true })}
      />

      <EditTeacherModal
        teacher={editing}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setSuccess(message);
          await refreshAll();
        }}
        onUnauthorized={() => navigate("/login", { replace: true })}
      />
    </DeanShell>
  );
}

/* ----------------------------------------------------------- small parts */

function Banner({ track, Icon, title, role, onDismiss, children }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border p-4" data-tint="" style={{ "--track": track }} role={role}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: track }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="prose-muted mt-0.5 text-sm">{children}</p>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="btn btn-ghost btn-xs shrink-0">
          Dismiss
        </button>
      )}
    </div>
  );
}

function SelectBox({ checked, indeterminate = false, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-line text-accent focus:ring-accent"
    />
  );
}

function Avatar({ teacher }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold ring-1"
      style={{
        "--track": ROLE_TRACK.teacher,
        background: "color-mix(in srgb, var(--track) 14%, transparent)",
        color: "color-mix(in srgb, var(--track) 80%, rgb(var(--c-ink)))",
        "--tw-ring-color": "color-mix(in srgb, var(--track) 30%, transparent)",
      }}
      aria-hidden="true"
    >
      {initialsOf(teacher.name, teacher.email)}
    </span>
  );
}

function ActiveChip({ teacher }) {
  return isActive(teacher) ? (
    <span className="chip chip-sm border-ok/30 bg-ok/10 text-ok">Active</span>
  ) : (
    <span className="chip chip-sm border-err/30 bg-err/10 text-err">Inactive</span>
  );
}

/**
 * "Imported" for an account created from an Excel import, and "Credentials
 * not sent" while such an account has no way to sign in yet.
 */
function SourceChips({ teacher }) {
  if (teacher.onboarded_via !== "dean_import") return null;
  const awaiting = !teacher.credentials_sent_at && !teacher.last_sign_in_at;
  return (
    <>
      <span className="chip chip-sm chip-track" style={{ "--track": ROLE_TRACK.teacher }}>
        <IconUpload className="h-3 w-3" />
        Imported
      </span>
      {awaiting && (
        <span
          className="chip chip-sm"
          style={{ color: TRACK_WARN, borderColor: `${TRACK_WARN}55` }}
          title="This teacher cannot sign in until login credentials are sent"
        >
          Credentials not sent
        </span>
      )}
    </>
  );
}

function VerifiedChip({ teacher }) {
  return teacher.email_verified ? (
    <span className="chip chip-sm border-ok/30 bg-ok/10 text-ok">
      <IconCheck className="h-3 w-3" />
      Verified
    </span>
  ) : (
    <span className="chip chip-sm" style={{ color: TRACK_WARN, borderColor: `${TRACK_WARN}55` }}>
      Not verified
    </span>
  );
}

function TeacherSummary({ teacher }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border hairline bg-raised/40 p-3.5">
      <Avatar teacher={teacher} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-ink">{teacher.name || "Unnamed"}</p>
        <p className="truncate text-xs text-muted">{teacher.email}</p>
      </div>
      <ActiveChip teacher={teacher} />
    </div>
  );
}

/**
 * The actions a Teacher row offers; the server enforces the same rules.
 *
 * `compact` (the desktop table) keeps the two everyday actions as buttons and
 * puts the rest in a "More actions" menu, so the row fits the screen. The
 * cards have the room to show every action as a button.
 */
function RowActions({ teacher, emailConfigured, onAct, onEdit, compact = false }) {
  const active = isActive(teacher);
  const mailTitle = (label) => (emailConfigured ? label : `${label} (email is not configured)`);
  const btn = "btn btn-ghost btn-xs btn-icon";

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => onAct("credentials", teacher)}
          disabled={!active || !emailConfigured}
          className={btn}
          title={active ? mailTitle("Send login credentials") : "Activate the account first"}
          aria-label="Send login credentials"
        >
          <IconMail className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onEdit(teacher)} className={btn} title="Edit teacher" aria-label="Edit teacher">
          <IconEdit className="h-4 w-4" />
        </button>
        <RowMenu
          label={`More actions for ${nameOf(teacher)}`}
          items={[
            {
              key: "reset",
              label: "Send password reset link",
              Icon: IconKey,
              disabled: !active || !emailConfigured,
              hint: !active ? "Activate the account first" : !emailConfigured ? "Email is not configured" : null,
            },
            {
              key: "promote",
              label: "Promote to Dean",
              Icon: IconAward,
              disabled: !active,
              hint: !active ? "Activate the account first" : null,
            },
            active
              ? { key: "deactivate", label: "Deactivate account", Icon: IconXCircle, danger: true }
              : { key: "activate", label: "Reactivate account", Icon: IconCheck },
            { key: "delete", label: "Delete account", Icon: IconTrash, danger: true },
          ]}
          onSelect={(key) => onAct(key, teacher)}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onAct("credentials", teacher)}
        disabled={!active || !emailConfigured}
        className={btn}
        title={active ? mailTitle("Send login credentials") : "Activate the account first"}
        aria-label="Send login credentials"
      >
        <IconMail className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onAct("reset", teacher)}
        disabled={!active || !emailConfigured}
        className={btn}
        title={active ? mailTitle("Send password reset link") : "Activate the account first"}
        aria-label="Send password reset link"
      >
        <IconKey className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onEdit(teacher)} className={btn} title="Edit teacher" aria-label="Edit teacher">
        <IconEdit className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onAct("promote", teacher)}
        disabled={!active}
        className="btn btn-brand btn-xs btn-icon"
        title={active ? "Promote to Dean" : "Activate the account before promoting"}
        aria-label="Promote to Dean"
      >
        <IconAward className="h-4 w-4" />
      </button>
      {active ? (
        <button
          type="button"
          onClick={() => onAct("deactivate", teacher)}
          className={`${btn} text-err hover:bg-err/10`}
          title="Deactivate account"
          aria-label="Deactivate account"
        >
          <IconXCircle className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onAct("activate", teacher)}
          className="btn btn-ok btn-xs btn-icon"
          title="Reactivate account"
          aria-label="Reactivate account"
        >
          <IconCheck className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onAct("delete", teacher)}
        className="btn btn-danger btn-xs btn-icon"
        title="Delete account"
        aria-label="Delete account"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </>
  );
}

/**
 * A row's overflow menu. Rendered into <body> with fixed positioning so the
 * table's own overflow can never clip it, and flipped above the button when
 * there is no room below. It follows the button while the page scrolls or
 * resizes (closing on scroll made it vanish whenever the browser nudged the
 * page, e.g. as the list reloaded). Escape, Tab and a click outside close
 * it; the arrow keys move between items.
 */
function RowMenu({ label, items, onSelect }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const WIDTH = 232;

  const place = useCallback(() => {
    const button = buttonRef.current?.getBoundingClientRect();
    if (!button) return;
    const height = menuRef.current?.offsetHeight || 0;
    const below = button.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, button.top - height - 6) : below;
    const left = Math.min(Math.max(8, button.right - WIDTH), window.innerWidth - WIDTH - 8);
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const itemsOf = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    itemsOf()[0]?.focus({ preventScroll: true });

    const close = (refocus = false) => {
      setOpen(false);
      if (refocus) buttonRef.current?.focus();
    };
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = itemsOf();
        const at = list.indexOf(document.activeElement);
        const next = e.key === "ArrowDown" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
        list[next]?.focus({ preventScroll: true });
      } else if (e.key === "Tab") {
        close();
      }
    };
    const onScroll = () => place();

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title="More actions"
        className={`btn btn-ghost btn-xs btn-icon ${open ? "bg-raised" : ""}`}
      >
        <IconMoreHorizontal className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="hv-popover glass glass-blur fixed z-50 rounded-xl p-1.5 text-left"
            style={{ top: pos.top, left: pos.left, width: WIDTH }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.hint || undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.key);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
                  item.danger
                    ? "text-err hover:bg-err/10 focus-visible:bg-err/10"
                    : "text-ink hover:bg-raised focus-visible:bg-raised"
                }`}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

const EMPTY_FORM = { name: "", email: "", phone: "", department: "", designation: "" };

function EditTeacherModal({ teacher, onClose, onSaved, onUnauthorized }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!teacher) return;
    setForm({
      name: teacher.name || "",
      email: teacher.email || "",
      phone: teacher.phone || "",
      department: teacher.department || "",
      designation: teacher.designation || "",
    });
    setError("");
  }, [teacher]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const phoneInvalid = !isValidPhone(form.phone);
  const emailChanged = teacher && form.email.trim().toLowerCase() !== (teacher.email || "").toLowerCase();

  const submit = async (e) => {
    e.preventDefault();
    if (!teacher || phoneInvalid) return;

    // Only what changed is sent, so a field the Dean did not touch is never
    // rewritten from a stale copy.
    const next = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      department: form.department.trim() || null,
      designation: form.designation.trim() || null,
    };
    const body = {};
    Object.entries(next).forEach(([key, value]) => {
      if ((value || null) !== (teacher[key] || null)) body[key] = value;
    });
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    try {
      setBusy(true);
      setError("");
      const data = await apiJson(`/dean/teachers/${teacher.id}`, { method: "PATCH", body });
      await onSaved(data?.message || "Teacher updated.");
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err?.message || "Failed to update the teacher.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(teacher)}
      onClose={() => { if (!busy) onClose(); }}
      eyebrow="Teacher profile"
      title="Edit teacher"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-sm">
            Cancel
          </button>
          <button type="submit" form="dean-edit-teacher" disabled={busy || phoneInvalid} className="btn btn-primary btn-sm">
            {busy && <span className="spin h-4 w-4" />}
            Save changes
          </button>
        </>
      }
    >
      {teacher && (
        <form id="dean-edit-teacher" onSubmit={submit} className="space-y-4">
          {error && (
            <div className="toast toast-err text-sm" role="alert">
              <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label htmlFor="dt-name">Full name <span className="req">*</span></label>
            <input id="dt-name" type="text" required maxLength={120} value={form.name} onChange={set("name")} className="input" />
          </div>

          <div className="field">
            <label htmlFor="dt-email">Email <span className="req">*</span></label>
            <input id="dt-email" type="email" required maxLength={254} value={form.email} onChange={set("email")} className="input" />
            {emailChanged && (
              <p className="field-hint">
                The teacher will sign in with this address from now on. Any reset link already sent to the
                old address stops working.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="dt-phone">
              Mobile number <span className="ml-2 font-normal text-muted">(Optional)</span>
            </label>
            <input
              id="dt-phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: normalizePhoneInput(e.target.value) }))}
              placeholder="10-digit mobile number"
              className="input"
              aria-invalid={phoneInvalid || undefined}
            />
            {phoneInvalid && <p className="field-error">Mobile number must be exactly 10 digits.</p>}
          </div>

          <div className="field">
            <label htmlFor="dt-designation">
              Designation <span className="ml-2 font-normal text-muted">(Optional)</span>
            </label>
            <input
              id="dt-designation"
              type="text"
              maxLength={120}
              list="dt-designation-options"
              value={form.designation}
              onChange={set("designation")}
              className="input"
            />
            <datalist id="dt-designation-options">
              {DESIGNATION_SUGGESTIONS.map((d) => <option key={d} value={d} />)}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="dt-department">
              Department <span className="ml-2 font-normal text-muted">(Optional)</span>
            </label>
            <input
              id="dt-department"
              type="text"
              maxLength={120}
              value={form.department}
              onChange={set("department")}
              placeholder="e.g. Computer Science & Engineering"
              className="input"
            />
          </div>

          <p className="text-xs text-muted">
            Role, account status and password are changed with their own actions, not here.
          </p>
        </form>
      )}
    </Modal>
  );
}

const ACTIVITY_LABEL = {
  teacher_credentials_sent: "Sent login credentials",
  teachers_credentials_sent: "Bulk sent login credentials",
  teachers_imported: "Imported teachers from Excel",
  password_reset_link_sent: "Sent password reset link",
  user_profile_updated: "Edited teacher",
  user_deleted: "Deleted teacher",
  user_activated: "Reactivated teacher",
  user_deactivated: "Deactivated teacher",
  role_change: "Promoted to Dean",
};

function ActivityPanel({ refreshKey }) {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiJson("/dean/teachers/activity?limit=25")
      .then((data) => { if (!cancelled) setLogs(data?.logs || []); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Could not load recent activity."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, refreshKey]);

  return (
    <section className="glass reveal mt-6 overflow-hidden" style={{ "--i": 3 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="icon-tile h-9 w-9 rounded-lg [&>svg]:h-4 [&>svg]:w-4"><IconActivity /></span>
          <span>
            <span className="eyebrow block">Teacher management</span>
            <span className="h3 block text-ink">Recent activity</span>
          </span>
        </span>
        <span className="text-xs font-semibold text-accent">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t hairline">
          {loading && logs.length === 0 ? (
            <p className="prose-muted px-5 py-6 text-sm">Loading…</p>
          ) : error ? (
            <p className="px-5 py-6 text-sm text-err">{error}</p>
          ) : logs.length === 0 ? (
            <p className="prose-muted px-5 py-6 text-sm">No teacher-management actions yet.</p>
          ) : (
            <ul className="divide-y divide-line/8">
              {logs.map((log) => {
                const d = log.details || {};
                const failed = d.result === "failed";
                const summary = log.action === "teachers_credentials_sent"
                  ? `${d.sent_count ?? 0} sent · ${d.failed_count ?? 0} failed · ${d.skipped_count ?? 0} skipped`
                  : log.action === "teachers_imported"
                    ? `${d.created_count ?? 0} created · ${d.skipped_count ?? 0} skipped`
                    : d.target_name || d.target_email || "";
                return (
                  <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        <span className="font-semibold">{ACTIVITY_LABEL[log.action] || log.action}</span>
                        {summary && <span className="text-muted"> · {summary}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        by {log.actor_name || log.actor_email || "Unknown"} · {formatDateTime(log.created_at) || "—"}
                      </p>
                    </div>
                    {failed ? (
                      <span className="chip chip-sm border-err/30 bg-err/10 text-err">Failed</span>
                    ) : d.result === "partial" ? (
                      <span className="chip chip-sm" style={{ color: TRACK_WARN, borderColor: `${TRACK_WARN}55` }}>Partial</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
