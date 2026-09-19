import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import Modal from "../../components/teacher/Modal";
import Pagination from "../../components/common/Pagination";
import {
  IconAlertTriangle,
  IconBuilding,
  IconCheckCircle,
  IconEdit,
  IconInbox,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "../../components/teacher/icons";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

const TABLE_COLUMNS = ["Department", "Code", "School / Faculty", "Status", "Actions"];

export default function Departments() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [departments, setDepartments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null); // null when creating
  const [formData, setFormData] = useState({ name: "", code: "", school: "", is_active: true });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rawPer = Number(searchParams.get("per")) || 25;
  const per = [25, 50, 100].includes(rawPer) ? rawPer : 25;
  const skip = (page - 1) * per;

  const urlQ = searchParams.get("q") || "";
  const [searchDraft, setSearchDraft] = useState(urlQ);

  useEffect(() => {
    setSearchDraft(urlQ);
  }, [urlQ]);

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

  const statusFilter = STATUS_TABS.some((t) => t.key === searchParams.get("status"))
    ? searchParams.get("status")
    : "all";

  const setStatusFilter = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === "all") next.delete("status");
    else next.set("status", key);
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

  const loadDepartments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(per),
      });
      if (statusFilter === "active") params.set("is_active", "true");
      if (statusFilter === "inactive") params.set("is_active", "false");
      if (urlQ) params.set("q", urlQ);

      const res = await apiJson(`/superadmin/departments?${params}`);
      setDepartments(res?.departments || []);
      setTotal(res?.total || 0);
    } catch (err) {
      if (err?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Load departments error:", err);
      setError(err?.message || "Failed to load departments.");
    } finally {
      setLoading(false);
    }
  }, [skip, per, statusFilter, urlQ, navigate]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(""), 4500);
    return () => clearTimeout(t);
  }, [success]);

  const handleOpenCreate = () => {
    setEditingDept(null);
    setFormData({ name: "", code: "", school: "", is_active: true });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name || "",
      code: dept.code || "",
      school: dept.school || "",
      is_active: dept.is_active !== false,
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSaveDepartment = async (e) => {
    e.preventDefault();
    const name = formData.name.trim();
    const code = formData.code.trim().toUpperCase();
    const school = formData.school.trim() || null;

    if (!name) {
      setFormError("Department name is required.");
      return;
    }
    if (!code) {
      setFormError("Department code is required.");
      return;
    }

    try {
      setSubmitting(true);
      setFormError("");

      if (editingDept) {
        await apiJson(`/superadmin/departments/${editingDept.id}`, {
          method: "PUT",
          body: { name, code, school, is_active: formData.is_active },
        });
        setSuccess(`Department '${name}' updated successfully.`);
      } else {
        await apiJson("/superadmin/departments", {
          method: "POST",
          body: { name, code, school },
        });
        setSuccess(`Department '${name}' created successfully.`);
      }

      setIsModalOpen(false);
      await loadDepartments();
    } catch (err) {
      console.error("Save department error:", err);
      setFormError(err?.message || "Failed to save department.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (dept) => {
    try {
      setError("");
      const newStatus = !dept.is_active;
      await apiJson(`/superadmin/departments/${dept.id}`, {
        method: "PUT",
        body: { is_active: newStatus },
      });
      setSuccess(`Department '${dept.name}' ${newStatus ? "activated" : "deactivated"}.`);
      await loadDepartments();
    } catch (err) {
      console.error("Toggle active error:", err);
      setError(err?.message || "Failed to update department status.");
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <SuperAdminShell
      active="departments"
      profile={profile}
      onLogout={handleLogout}
      railNote="Manage the canonical academic departments used for event tagging and faculty affiliation."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
        <PageHero
          eyebrow="Super Admin"
          title="Department"
          accent="Registry"
          subtitle="Official departments and schools across Swami Rama Himalayan University for event organization and NAAC accreditation reporting."
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={loadDepartments}
                disabled={loading}
                className="btn btn-ghost"
              >
                {loading ? <span className="spin h-4 w-4" /> : <IconRefresh />}
                Refresh
              </button>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="btn btn-primary"
              >
                <IconPlus />
                Add Department
              </button>
            </div>
          }
        />

        {error && (
          <div className="toast toast-err mt-6" role="alert">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <p className="flex-1 text-sm font-medium text-ink">{error}</p>
          </div>
        )}

        {success && (
          <div className="toast toast-ok mt-6" role="status">
            <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
            <p className="flex-1 text-sm font-medium text-ink">{success}</p>
          </div>
        )}

        {/* ----------------------------------------------------- toolbar */}
        <div className="reveal mt-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between" style={{ "--i": 1 }}>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className="tab"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="relative block w-full md:w-72">
            <span className="sr-only">Search departments</span>
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search by name, code or school"
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
                {statusFilter === "all" ? "All Departments" : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Departments`}
              </h2>
            </div>
            {!loading && (
              <p className="num text-sm text-muted">
                <span className="font-semibold text-ink">
                  {total === 0 ? 0 : `${skip + 1}–${Math.min(skip + departments.length, total)}`}
                </span>
                {" of "}
                {total}
              </p>
            )}
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center">
              <span className="spin mx-auto mb-4 block h-9 w-9 text-accent" />
              <p className="prose-muted text-sm">Loading departments…</p>
            </div>
          ) : departments.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="icon-tile mx-auto">
                <IconInbox />
              </span>
              <p className="h3 mt-4 text-ink">
                {total === 0 && !urlQ && statusFilter === "all" ? "No departments yet" : "No matches"}
              </p>
              <p className="prose-muted mt-1 text-sm">
                {total === 0 && !urlQ && statusFilter === "all"
                  ? "Click 'Add Department' to register university academic departments."
                  : "Try a different search query or clear the filter."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <ul className="divide-y divide-line/8 md:hidden">
                {departments.map((dept) => (
                  <li key={dept.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-semibold text-ink">
                            {dept.name}
                          </span>
                          <span className="badge badge-subtle text-[11px] font-mono">
                            {dept.code}
                          </span>
                        </div>
                        {dept.school && (
                          <p className="prose-muted mt-0.5 text-xs">{dept.school}</p>
                        )}
                        <div className="mt-2">
                          {dept.is_active !== false ? (
                            <span className="chip chip-sm bg-ok/10 text-ok border-ok/30">Active</span>
                          ) : (
                            <span className="chip chip-sm bg-err/10 text-err border-err/30">Inactive</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(dept)}
                          className="btn btn-ghost btn-xs"
                          title="Edit department"
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(dept)}
                          className={`btn btn-xs ${dept.is_active !== false ? "btn-ghost text-err" : "btn-brand"}`}
                        >
                          {dept.is_active !== false ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop Table */}
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
                    {departments.map((dept) => (
                      <tr key={dept.id} className="transition hover:bg-raised/40">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                              <IconBuilding className="h-4 w-4" />
                            </span>
                            <span className="font-display text-sm font-semibold text-ink">
                              {dept.name}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span className="badge badge-subtle font-mono text-xs">
                            {dept.code}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted">
                          {dept.school || "—"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {dept.is_active !== false ? (
                            <span className="chip chip-sm bg-ok/10 text-ok border-ok/30">Active</span>
                          ) : (
                            <span className="chip chip-sm bg-err/10 text-err border-err/30">Inactive</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(dept)}
                              className="btn btn-ghost btn-xs"
                              title="Edit department"
                            >
                              <IconEdit />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(dept)}
                              className={`btn btn-xs ${dept.is_active !== false ? "btn-ghost text-err" : "btn-brand"}`}
                            >
                              {dept.is_active !== false ? "Deactivate" : "Activate"}
                            </button>
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

      {/* --------------------------------------------- Create / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => { if (!submitting) setIsModalOpen(false); }}
        eyebrow="Department Registry"
        title={editingDept ? "Edit Department" : "Add Department"}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="dept-form"
              disabled={submitting}
              className="btn btn-primary btn-sm"
            >
              {submitting ? <span className="spin h-4 w-4" /> : null}
              {editingDept ? "Save Changes" : "Create Department"}
            </button>
          </>
        }
      >
        <form id="dept-form" onSubmit={handleSaveDepartment} className="space-y-4">
          {formError && (
            <div className="toast toast-err text-xs" role="alert">
              <IconAlertTriangle className="h-4 w-4 shrink-0 text-err" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="label block text-xs font-semibold text-ink" htmlFor="dept-name">
              Department Name *
            </label>
            <input
              id="dept-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Computer Science & Engineering"
              className="input mt-1 w-full"
            />
          </div>

          <div>
            <label className="label block text-xs font-semibold text-ink" htmlFor="dept-code">
              Department Code *
            </label>
            <input
              id="dept-code"
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. CSE"
              className="input mt-1 w-full font-mono uppercase"
            />
          </div>

          <div>
            <label className="label block text-xs font-semibold text-ink" htmlFor="dept-school">
              School / Faculty (Optional)
            </label>
            <input
              id="dept-school"
              type="text"
              value={formData.school}
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
              placeholder="e.g. Himalayan School of Science & Technology"
              className="input mt-1 w-full"
            />
          </div>

          {editingDept && (
            <div className="flex items-center gap-3 pt-2">
              <input
                id="dept-active"
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
              <label htmlFor="dept-active" className="text-sm font-medium text-ink cursor-pointer">
                Department is active
              </label>
            </div>
          )}
        </form>
      </Modal>
    </SuperAdminShell>
  );
}
