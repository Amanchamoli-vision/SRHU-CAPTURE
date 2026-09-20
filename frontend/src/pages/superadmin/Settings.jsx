import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import EffectiveCeiling from "../../components/superadmin/settings/EffectiveCeiling";
import Modal from "../../components/teacher/Modal";
import PageHero from "../../components/teacher/PageHero";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconClock,
  IconRefresh,
  IconRotateCcw,
  IconSave,
} from "../../components/teacher/icons";
import { useAuth } from "../../context/AuthContext";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard";
import {
  fetchSuperAdminUploadLimits,
  resetSuperAdminUploadLimits,
  updateSuperAdminUploadLimits,
} from "../../services/settings";
import { fromServer, isDirty, toWire, validateLimits } from "../../utils/limitsForm";
import { DEFAULT_TAB, SETTINGS_TABS, resolveTab, tabOwningField } from "./settings/tabs";

export default function Settings() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // "loading" until the server answers. The form is never mounted without real
  // data: seeding it with local defaults after a failed load meant a single
  // click on Save silently overwrote the real configuration.
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");

  const [values, setValues] = useState(null);
  const [pristine, setPristine] = useState(null);
  const [errors, setErrors] = useState({});
  const [meta, setMeta] = useState(null);

  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [banner, setBanner] = useState(null); // { tone: "ok" | "err", title, message }
  const [confirm, setConfirm] = useState(null); // { kind: "reset" | "leave", href? }

  const bannerRef = useRef(null);
  const busy = saving || resetting;
  const dirty = useMemo(() => isDirty(values, pristine), [values, pristine]);

  const activeTab = resolveTab(searchParams.get("tab") || DEFAULT_TAB);

  const selectTab = useCallback(
    (key) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", key);
      // replace: tab-hopping should not fill the Back stack.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const applyServerState = useCallback((data) => {
    const next = fromServer(data.limits);
    setValues(next);
    setPristine(next);
    setErrors({});
    setMeta((current) => ({ ...(current || {}), ...data }));
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    setLoadError("");
    try {
      const data = await fetchSuperAdminUploadLimits();
      applyServerState(data);
      setStatus("ready");
    } catch (err) {
      setLoadError(err?.message || "Could not load the upload settings from the server.");
      setStatus("error");
    }
  }, [applyServerState]);

  useEffect(() => {
    load();
  }, [load]);

  // A banner that scrolls off the top of a tall page is a banner nobody sees:
  // the Save button sits at the bottom.
  useEffect(() => {
    if (!banner || !bannerRef.current) return;
    bannerRef.current.focus();
    bannerRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [banner]);

  const onChange = useCallback((field, raw) => {
    setValues((current) => ({ ...current, [field]: raw }));
    // Clear as soon as the admin acts on it, rather than leaving the red text
    // until the next submit.
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setBanner(null);
  }, []);

  const onInterceptNavigation = useCallback((href) => {
    setConfirm({ kind: "leave", href });
  }, []);

  useUnsavedChangesGuard(dirty && !busy, onInterceptNavigation);

  const handleSave = async (event) => {
    event.preventDefault();
    setBanner(null);

    const found = validateLimits(values, meta.bounds, {
      deploymentCeilingMb: meta.deploymentCeilingMb,
    });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const [firstField] = Object.keys(found);
      const owner = tabOwningField(firstField);
      if (owner.key !== activeTab.key) selectTab(owner.key);
      // Let the tab render before reaching for the input.
      window.requestAnimationFrame(() => {
        document.getElementById(firstField.replace(/_/g, "-"))?.focus();
      });
      setBanner({
        tone: "err",
        title: "Nothing was saved",
        message: "Some values need fixing first. The affected fields are marked below.",
      });
      return;
    }

    setSaving(true);
    try {
      const data = await updateSuperAdminUploadLimits(toWire(values));
      // Re-seed from the response: the server is the only thing that knows the
      // real timestamp and what it actually stored.
      applyServerState(data);
      setBanner({
        tone: "ok",
        title: "Upload limits saved",
        message:
          "New uploads are checked against these limits immediately. Event forms already open will pick them up when they are next focused.",
      });
    } catch (err) {
      setBanner({
        tone: "err",
        title: "Could not save",
        message: err?.message || "The server rejected the change. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setConfirm(null);
    setResetting(true);
    setBanner(null);
    try {
      const data = await resetSuperAdminUploadLimits();
      applyServerState(data);
      setBanner({
        tone: "ok",
        title: "Reset to system defaults",
        message: "The stored configuration was removed, so the platform defaults apply again.",
      });
    } catch (err) {
      setBanner({
        tone: "err",
        title: "Could not reset",
        message: err?.message || "The server rejected the reset. Please try again.",
      });
    } finally {
      setResetting(false);
    }
  };

  const handleDiscard = () => {
    setValues(pristine);
    setErrors({});
    setBanner(null);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const lastUpdated = meta?.updatedAt
    ? new Date(meta.updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const TabPanel = activeTab.Component;

  return (
    <SuperAdminShell
      active="settings"
      profile={profile}
      onLogout={handleLogout}
      railNote="Limits apply to every event across the university. The server enforces them on upload, so lowering a limit does not remove files already attached."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
        <PageHero
          eyebrow="Super Admin"
          title="System"
          accent="Settings"
          subtitle="How much teachers may attach to an event: photo, video and document limits for the whole platform."
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setConfirm({ kind: "reset" })}
                disabled={status !== "ready" || busy}
                className="btn btn-ghost text-xs sm:text-sm"
              >
                <IconRotateCcw aria-hidden="true" />
                {resetting ? "Resetting…" : "Reset to defaults"}
              </button>
            </div>
          }
        />

        {banner ? (
          <div
            ref={bannerRef}
            tabIndex={-1}
            role={banner.tone === "err" ? "alert" : "status"}
            aria-live={banner.tone === "err" ? "assertive" : "polite"}
            className={`toast ${banner.tone === "err" ? "toast-err" : "toast-ok"} mt-6 flex items-start gap-3 p-4`}
          >
            {banner.tone === "err" ? (
              <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" aria-hidden="true" />
            ) : (
              <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold ${banner.tone === "err" ? "text-err" : "text-ok"}`}
              >
                {banner.title}
              </p>
              <p className="text-sm text-ink">{banner.message}</p>
            </div>
          </div>
        ) : null}

        {status === "loading" ? (
          <div
            className="mt-8 flex justify-center py-16"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-sm text-muted">Loading settings…</p>
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <section className="glass reveal mt-8 p-6 sm:p-8" style={{ "--i": 1 }} role="alert">
            <div className="flex items-start gap-3">
              <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="h3 text-ink">Settings could not be loaded</h2>
                <p className="prose-muted mt-2 text-sm">{loadError}</p>
                <p className="prose-muted mt-2 text-sm">
                  The form stays hidden until the current values are known, so nothing can
                  be overwritten by accident.
                </p>
                <button type="button" onClick={load} className="btn btn-primary mt-5 text-sm">
                  <IconRefresh aria-hidden="true" />
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {status === "ready" && values ? (
          <form onSubmit={handleSave} noValidate aria-busy={busy} className="mt-8 space-y-6">
            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Settings sections"
            >
              {SETTINGS_TABS.map((tab) => {
                const hasError = tab.fields.some((field) => errors[field]);
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={tab.key === activeTab.key}
                    onClick={() => selectTab(tab.key)}
                    className="tab"
                  >
                    {tab.label}
                    {hasError ? (
                      <span className="tab-count text-err" aria-label="has errors">
                        !
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <TabPanel
              values={values}
              bounds={meta.bounds}
              errors={errors}
              disabled={busy}
              onChange={onChange}
            />

            <EffectiveCeiling
              values={values}
              deploymentCeilingMb={meta.deploymentCeilingMb}
            />

            <div
              className="glass reveal flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
              style={{ "--i": 4 }}
            >
              <p className="flex items-center gap-2 text-xs text-muted">
                {lastUpdated ? (
                  <>
                    <IconClock className="h-4 w-4" aria-hidden="true" />
                    <span>
                      Last updated{" "}
                      <span className="font-semibold text-ink">{lastUpdated}</span>
                      {meta.updatedByName ? (
                        <>
                          {" by "}
                          <span className="font-semibold text-ink">{meta.updatedByName}</span>
                        </>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <span>Using the default system configuration.</span>
                )}
              </p>

              <div className="flex items-center gap-3">
                {dirty ? (
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={busy}
                    className="btn btn-ghost text-sm"
                  >
                    Discard changes
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={!dirty || busy}
                  className="btn btn-primary min-w-36 text-sm"
                >
                  {saving ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                        aria-hidden="true"
                      />
                      Saving…
                    </>
                  ) : (
                    <>
                      <IconSave aria-hidden="true" />
                      Save limits
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>

      <Modal
        open={confirm?.kind === "reset"}
        onClose={() => !busy && setConfirm(null)}
        eyebrow="Confirm"
        title="Reset to system defaults"
        subtitle="This removes the saved configuration"
        zIndex={70}
        footer={
          <div className="flex w-full items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirm(null)}
              disabled={busy}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="btn btn-danger btn-sm"
            >
              <IconRotateCcw className="h-4 w-4" aria-hidden="true" />
              {resetting ? "Resetting…" : "Reset to defaults"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink">Every limit goes back to the platform default:</p>
        <dl className="mt-4 space-y-1.5 text-sm">
          {meta?.defaults
            ? Object.entries(meta.defaults).map(([field, value]) => (
                <div key={field} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">{field.replace(/^max_/, "").replace(/_/g, " ")}</dt>
                  <dd className="font-mono text-ink">{value === null ? "no limit" : value}</dd>
                </div>
              ))
            : null}
        </dl>
      </Modal>

      <Modal
        open={confirm?.kind === "leave"}
        onClose={() => setConfirm(null)}
        eyebrow="Unsaved changes"
        title="Leave without saving?"
        subtitle="Your edits to the upload limits will be lost"
        zIndex={70}
        footer={
          <div className="flex w-full items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="btn btn-ghost btn-sm"
            >
              Stay on this page
            </button>
            <button
              type="button"
              onClick={() => {
                const { href } = confirm;
                setConfirm(null);
                setValues(pristine);
                navigate(href);
              }}
              className="btn btn-danger btn-sm"
            >
              Discard and leave
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink">
          You have changed the upload limits but not saved them yet.
        </p>
      </Modal>
    </SuperAdminShell>
  );
}
