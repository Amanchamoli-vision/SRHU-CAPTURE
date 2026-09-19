import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  getUploadLimitsSettings,
  saveUploadLimitsSettings,
} from "../../services/uploadLimits";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import { ROLE_TRACK } from "../../components/common/roles";
import PageHero from "../../components/teacher/PageHero";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconFilm,
  IconImagePlus,
  IconRotateCcw,
  IconUploadCloud,
} from "../../components/teacher/icons";

/**
 * The one place the per-event photo and video caps are set.
 *
 * They used to be constants in backend/app/config.py mirrored by
 * frontend/src/utils/uploadRules.js, so "let teachers upload 15 photos" was a
 * code change and a deploy. The values live in MongoDB now; a teacher's wizard
 * reads them on load and every upload is measured against them server-side.
 *
 * Documents are deliberately absent: their budget is not configurable.
 */

/**
 * The form, group by group. `nullable` fields may be left blank, which stores
 * `null` and means "no limit" — that is what photo-total and video-count were
 * before they could be set at all, so blank is also their default.
 */
const GROUPS = [
  {
    key: "photos",
    title: "Photos",
    Icon: IconImagePlus,
    blurb: "Posters, banners and photographs attached to an event.",
    fields: [
      {
        name: "max_photos_per_event",
        label: "Maximum photos per event",
        unit: "photos",
        help: "How many photo files one event may carry.",
      },
      {
        name: "max_photo_size_mb",
        label: "Maximum size per photo",
        unit: "MB",
        help: "Any single photo larger than this is refused.",
      },
      {
        name: "max_photo_total_mb",
        label: "Maximum combined size of all photos",
        unit: "MB",
        optional: true,
        help: "Leave blank for no combined limit — photos are then capped by count and per-file size only.",
      },
    ],
  },
  {
    key: "videos",
    title: "Videos",
    Icon: IconFilm,
    blurb: "Teasers, highlights and recordings attached to an event.",
    fields: [
      {
        name: "max_videos_per_event",
        label: "Maximum videos per event",
        unit: "videos",
        optional: true,
        help: "Leave blank for no limit on how many video files an event may carry.",
      },
      {
        name: "max_video_size_mb",
        label: "Maximum size per video",
        unit: "MB",
        help: "Any single video larger than this is refused.",
      },
      {
        name: "max_video_total_mb",
        label: "Maximum combined size of all videos",
        unit: "MB",
        help: "The whole video budget for one event, across any number of files.",
      },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

const FIELD_LABELS = Object.fromEntries(
  ALL_FIELDS.map((field) => [field.name, field.label]),
);

/** Limits from the server (numbers and nulls) to form state (strings). */
function toForm(limits) {
  return Object.fromEntries(
    ALL_FIELDS.map(({ name }) => [
      name,
      limits?.[name] == null ? "" : String(limits[name]),
    ]),
  );
}

/**
 * Validate one field against the server's own bounds, which arrive with the
 * configuration. Returns an error string, or "" when the value is fine.
 *
 * The same rules run again in the API — this exists so a Super Admin is told
 * about a bad value as they type it rather than on submit.
 */
function errorFor(field, raw, bounds) {
  const value = String(raw ?? "").trim();
  const limits = bounds?.[field.name];
  const min = limits?.min ?? 1;
  const max = limits?.max;

  if (!value) {
    return field.optional ? "" : `${field.label} is required.`;
  }

  if (!/^\d+$/.test(value)) {
    // Catches "0.5", "-4", "20 MB" and "1e3" in one rule: a limit is a whole
    // positive number of files or megabytes, nothing else.
    return "Enter a whole number greater than zero.";
  }

  const number = Number(value);
  if (number < min) {
    return `Must be at least ${units(min, field.unit)}.`;
  }
  if (max != null && number > max) {
    return `Must be ${units(max, field.unit)} or less.`;
  }
  return "";
}

/** Cross-field rules: a per-file cap above its combined budget is unreachable. */
function pairErrors(form) {
  const errors = {};
  const number = (name) => {
    const value = String(form[name] ?? "").trim();
    return /^\d+$/.test(value) ? Number(value) : null;
  };

  const photoSize = number("max_photo_size_mb");
  const photoTotal = number("max_photo_total_mb");
  if (photoSize != null && photoTotal != null && photoSize > photoTotal) {
    errors.max_photo_size_mb =
      "Cannot be larger than the combined photo size below.";
  }

  const videoSize = number("max_video_size_mb");
  const videoTotal = number("max_video_total_mb");
  if (videoSize != null && videoTotal != null && videoSize > videoTotal) {
    errors.max_video_size_mb =
      "Cannot be larger than the combined video size below.";
  }

  return errors;
}

/** Form state (strings) back to the payload the API expects. */
function toPayload(form) {
  return Object.fromEntries(
    ALL_FIELDS.map(({ name }) => {
      const value = String(form[name] ?? "").trim();
      return [name, value === "" ? null : Number(value)];
    }),
  );
}

/** "1 photos" reads as a bug; these bounds are shown often enough to be worth it. */
const SINGULAR = { photos: "photo", videos: "video" };
const units = (count, unit) => `${count} ${count === 1 ? SINGULAR[unit] || unit : unit}`;

function UploadLimits() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [form, setForm] = useState(() => toForm(null));
  const [defaults, setDefaults] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [isDefault, setIsDefault] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const applyRecord = (data) => {
    setForm(toForm(data?.limits));
    setDefaults(data?.defaults || null);
    setBounds(data?.bounds || null);
    setIsDefault(Boolean(data?.is_default));
    setUpdatedAt(data?.updated_at || null);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getUploadLimitsSettings();
        if (!cancelled) applyRecord(data);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          navigate("/login");
          return;
        }
        setError(err?.message || "Could not load the current upload limits.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Blank rather than a stale number while the first request is in flight, so
  // nobody saves a value they were shown before the real one arrived.
  const busy = loading || saving;

  const liveErrors = useMemo(() => {
    const errors = {};
    for (const field of ALL_FIELDS) {
      const message = errorFor(field, form[field.name], bounds);
      if (message) errors[field.name] = message;
    }
    return { ...errors, ...pairErrors(form) };
  }, [form, bounds]);

  const handleChange = (name) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess("");
    // Clear the error for the field being edited; the rest stay until submit,
    // so the summary does not flicker as the form is filled in.
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const restoreDefaults = () => {
    if (!defaults) return;
    setForm(toForm(defaults));
    setFieldErrors({});
    setSuccess("");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (Object.keys(liveErrors).length > 0) {
      setFieldErrors(liveErrors);
      setError("Please correct the highlighted values before saving.");
      return;
    }

    setSaving(true);
    try {
      const data = await saveUploadLimitsSettings(toPayload(form));
      applyRecord(data);
      setFieldErrors({});
      setSuccess(
        data?.message ||
          "Upload limits saved. Teachers will see them on their next page load.",
      );
    } catch (err) {
      if (err?.status === 401) {
        setError("Super Admin session expired. Please login again.");
        navigate("/login");
        return;
      }
      console.error("Save upload limits error:", err);
      setError(err?.message || "Something went wrong while saving the limits.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <SuperAdminShell
      active="upload-limits"
      profile={profile}
      onLogout={handleLogout}
      railNote="How much a teacher may attach to one event. Applies to every teacher, and takes effect without a deploy."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        <PageHero
          eyebrow="Super Admin"
          title="Upload"
          accent="Limits"
          subtitle="Set how many photos and videos a teacher may attach to one event, and how large each may be. Changes apply to every new upload — no deployment needed."
          actions={
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={busy || !defaults}
              className="btn btn-ghost"
            >
              <IconRotateCcw />
              Restore defaults
            </button>
          }
        />

        <div className="mt-7 grid gap-4 lg:grid-cols-5">

          {/* ---------------------------------------------------- form */}
          <div className="lg:col-span-3">
            <section className="glass reveal p-5 sm:p-7" style={{ "--i": 1 }}>
              <div className="flex items-center gap-3">
                <span
                  className="icon-tile icon-tile-track"
                  style={{ "--track": ROLE_TRACK.superadmin }}
                >
                  <IconUploadCloud />
                </span>
                <div>
                  <p className="eyebrow">Per event</p>
                  <h2 className="h3 text-ink">Photo and video limits</h2>
                </div>
              </div>

              {error && (
                <div
                  className="mt-5 flex items-start gap-3 rounded-2xl border p-3.5"
                  data-tint=""
                  style={{ "--track": "#EF4444" }}
                  role="alert"
                >
                  <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
                  <p className="text-sm text-ink">{error}</p>
                </div>
              )}

              {success && (
                <div
                  className="mt-5 flex items-start gap-3 rounded-2xl border p-3.5"
                  data-tint=""
                  style={{ "--track": "#10B981" }}
                  aria-live="polite"
                >
                  <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#10B981" }} />
                  <p className="text-sm text-ink">{success}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-7">
                {GROUPS.map((group) => (
                  <fieldset key={group.key} disabled={busy} className="min-w-0">
                    <legend className="flex items-center gap-2.5 pb-1">
                      <group.Icon className="h-4 w-4 text-accent" />
                      <span className="font-display text-sm font-semibold text-ink">
                        {group.title}
                      </span>
                    </legend>
                    <p className="prose-muted text-xs">{group.blurb}</p>

                    <div className="mt-4 space-y-5">
                      {group.fields.map((field) => {
                        const message = fieldErrors[field.name];
                        const bound = bounds?.[field.name];
                        return (
                          <div key={field.name} className="field">
                            <label htmlFor={field.name}>
                              {field.label}
                              {field.optional ? (
                                <span className="ml-2 font-normal text-muted">(Optional)</span>
                              ) : (
                                <span className="req">*</span>
                              )}
                            </label>

                            <div className="relative">
                              <input
                                id={field.name}
                                name={field.name}
                                type="number"
                                inputMode="numeric"
                                min={bound?.min ?? 1}
                                max={bound?.max ?? undefined}
                                step="1"
                                value={form[field.name]}
                                onChange={handleChange(field.name)}
                                placeholder={field.optional ? "No limit" : ""}
                                autoComplete="off"
                                aria-invalid={message ? "true" : undefined}
                                aria-describedby={`${field.name}-note`}
                                className="input pr-20"
                              />
                              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
                                {field.unit}
                              </span>
                            </div>

                            {message ? (
                              <p className="field-error">{message}</p>
                            ) : (
                              <p id={`${field.name}-note`} className="text-xs text-muted">
                                {field.help}
                                {bound && (
                                  <>
                                    {" "}
                                    Allowed: {bound.min}–{bound.max} {field.unit}.
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}

                <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-end">
                  <Link to="/superadmin/dashboard" className="btn btn-ghost">
                    Cancel
                  </Link>
                  <button type="submit" disabled={busy} className="btn btn-primary">
                    {saving ? (
                      <>
                        <span className="spin h-4 w-4" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <IconCheckCircle />
                        Save upload limits
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* ------------------------------------------------- guidance */}
          <aside className="space-y-4 lg:col-span-2">
            <section className="glass reveal p-5 sm:p-6" style={{ "--i": 2 }}>
              <p className="eyebrow">In force now</p>
              <dl className="mt-4 space-y-2.5">
                {ALL_FIELDS.map((field) => (
                  <div key={field.name} className="flex items-baseline justify-between gap-4">
                    <dt className="prose-muted min-w-0 text-xs">{FIELD_LABELS[field.name]}</dt>
                    <dd className="num shrink-0 text-sm font-semibold text-ink">
                      {form[field.name] === ""
                        ? "No limit"
                        : units(Number(form[field.name]), field.unit)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="prose-muted mt-4 text-xs">
                {loading
                  ? "Loading the saved configuration…"
                  : isDefault
                    ? "No configuration has been saved yet, so the built-in defaults are in force."
                    : updatedAt
                      ? `Last changed ${new Date(updatedAt).toLocaleString()}.`
                      : "Saved configuration in force."}
              </p>
            </section>

            {defaults && (
              <section className="glass reveal p-5 sm:p-6" style={{ "--i": 3 }}>
                <p className="eyebrow">Built-in defaults</p>
                <p className="prose-muted mt-2 text-xs">
                  Used when nothing has been saved. These are the values the system
                  shipped with.
                </p>
                <dl className="mt-3 space-y-2">
                  {ALL_FIELDS.map((field) => (
                    <div key={field.name} className="flex items-baseline justify-between gap-4">
                      <dt className="prose-muted min-w-0 text-xs">{FIELD_LABELS[field.name]}</dt>
                      <dd className="num shrink-0 text-xs text-muted">
                        {defaults[field.name] == null
                          ? "No limit"
                          : units(defaults[field.name], field.unit)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section
              className="reveal rounded-2xl border p-5"
              data-tint=""
              style={{ "--track": ROLE_TRACK.superadmin, "--i": 4 }}
            >
              <div className="flex items-center gap-2.5">
                <span className="dot" style={{ "--track": ROLE_TRACK.superadmin }} />
                <p className="font-display text-sm font-semibold text-ink">
                  What changes for teachers
                </p>
              </div>
              <ul className="prose-muted mt-3 space-y-1.5 text-xs">
                <li>The create-event wizard shows the new numbers on the next page load.</li>
                <li>Every upload is re-checked against them on the server.</li>
                <li>Files already attached to an event are never removed by a lower limit.</li>
                <li>Supporting documents are not affected — their budget is fixed.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </SuperAdminShell>
  );
}

export default UploadLimits;
