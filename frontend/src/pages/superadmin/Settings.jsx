import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import {
  IconAlertTriangle,
  IconCamera,
  IconCheckCircle,
  IconClock,
  IconFilm,
  IconRotateCcw,
  IconSave,
} from "../../components/teacher/icons";
import {
  fetchSuperAdminUploadLimits,
  resetSuperAdminUploadLimits,
  updateSuperAdminUploadLimits,
} from "../../services/settings";

export default function Settings() {
  const { profile, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Form fields
  const [maxPhotos, setMaxPhotos] = useState(10);
  const [maxPhotoSizeMb, setMaxPhotoSizeMb] = useState(20);
  const [photoTotalEnabled, setPhotoTotalEnabled] = useState(false);
  const [maxPhotoTotalMb, setMaxPhotoTotalMb] = useState("");

  const [videoCountEnabled, setVideoCountEnabled] = useState(false);
  const [maxVideos, setMaxVideos] = useState("");
  const [maxVideoSizeMb, setMaxVideoSizeMb] = useState(200);
  const [maxVideoTotalMb, setMaxVideoTotalMb] = useState(200);

  const [updatedAt, setUpdatedAt] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSuperAdminUploadLimits();
      const lim = data.limits;

      setMaxPhotos(lim.max_photos_per_event ?? 10);
      setMaxPhotoSizeMb(lim.max_photo_size_mb ?? 20);

      if (lim.max_photo_total_mb != null) {
        setPhotoTotalEnabled(true);
        setMaxPhotoTotalMb(String(lim.max_photo_total_mb));
      } else {
        setPhotoTotalEnabled(false);
        setMaxPhotoTotalMb("");
      }

      if (lim.max_videos_per_event != null) {
        setVideoCountEnabled(true);
        setMaxVideos(String(lim.max_videos_per_event));
      } else {
        setVideoCountEnabled(false);
        setMaxVideos("");
      }

      setMaxVideoSizeMb(lim.max_video_size_mb ?? 200);
      setMaxVideoTotalMb(lim.max_video_total_mb ?? 200);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      setError(err?.message || "Failed to load upload settings from the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const validate = () => {
    const errors = {};

    // Photos validation
    const numPhotos = Number(maxPhotos);
    if (!Number.isInteger(numPhotos) || numPhotos < 1 || numPhotos > 100) {
      errors.maxPhotos = "Enter a valid photo count between 1 and 100.";
    }

    const photoSize = Number(maxPhotoSizeMb);
    if (!Number.isFinite(photoSize) || photoSize < 1 || photoSize > 100) {
      errors.maxPhotoSizeMb = "Enter a valid photo size between 1 and 100 MB.";
    }

    if (photoTotalEnabled) {
      const photoTotal = Number(maxPhotoTotalMb);
      if (!Number.isFinite(photoTotal) || photoTotal < 1 || photoTotal > 1000) {
        errors.maxPhotoTotalMb = "Enter a valid total photo budget between 1 and 1000 MB.";
      } else if (photoTotal < photoSize) {
        errors.maxPhotoTotalMb =
          "Total photo budget cannot be less than the single photo limit.";
      }
    }

    // Videos validation
    if (videoCountEnabled) {
      const numVideos = Number(maxVideos);
      if (!Number.isInteger(numVideos) || numVideos < 1 || numVideos > 50) {
        errors.maxVideos = "Enter a valid video count between 1 and 50.";
      }
    }

    const videoSize = Number(maxVideoSizeMb);
    if (!Number.isFinite(videoSize) || videoSize < 1 || videoSize > 1000) {
      errors.maxVideoSizeMb = "Enter a valid video size between 1 and 1000 MB.";
    }

    const videoTotal = Number(maxVideoTotalMb);
    if (!Number.isFinite(videoTotal) || videoTotal < 1 || videoTotal > 2000) {
      errors.maxVideoTotalMb = "Enter a valid total video budget between 1 and 2000 MB.";
    } else if (videoSize > videoTotal) {
      errors.maxVideoSizeMb =
        "Per-video size cannot exceed the total video budget.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        max_photos_per_event: parseInt(maxPhotos, 10),
        max_photo_size_mb: parseInt(maxPhotoSizeMb, 10),
        max_photo_total_mb:
          photoTotalEnabled && maxPhotoTotalMb ? parseInt(maxPhotoTotalMb, 10) : null,
        max_videos_per_event:
          videoCountEnabled && maxVideos ? parseInt(maxVideos, 10) : null,
        max_video_size_mb: parseInt(maxVideoSizeMb, 10),
        max_video_total_mb: parseInt(maxVideoTotalMb, 10),
      };

      await updateSuperAdminUploadLimits(payload);
      setSuccessMessage("Upload limits have been saved and applied dynamically across the platform.");
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err?.message || "Failed to save upload limits. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Are you sure you want to reset photo and video upload limits to default values (10 photos, 20 MB/photo, 200 MB total videos)?",
      )
    ) {
      return;
    }

    setResetting(true);
    setError("");
    setSuccessMessage("");

    try {
      await resetSuperAdminUploadLimits();
      await loadSettings();
      setSuccessMessage("Upload limits have been reset to default system values.");
    } catch (err) {
      setError(err?.message || "Failed to reset limits.");
    } finally {
      setResetting(false);
    }
  };

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <SuperAdminShell active="settings" profile={profile} onLogout={signOut}>
      <div className="mx-auto max-w-6xl">
        <PageHero
          title="System Settings"
          subtitle="Configure platform-wide upload limits, file caps, and media sizes for event reporting."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={loading || saving || resetting}
                className="btn btn-ghost text-xs sm:text-sm"
              >
                <IconRotateCcw />
                Reset defaults
              </button>
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
            <div className="min-w-0">
              <p className="text-sm font-semibold text-err">Error</p>
              <p className="text-sm text-ink">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div
            className="mt-6 flex items-start gap-3 rounded-2xl border p-4"
            data-tint=""
            style={{ "--track": "#10B981" }}
            role="status"
            aria-live="polite"
          >
            <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-500">Settings updated</p>
              <p className="text-sm text-ink">{successMessage}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-8 flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-sm text-muted">Loading settings...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} noValidate className="mt-8 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* ================================= Photos Section ================================= */}
              <section className="glass reveal flex flex-col p-5 sm:p-7" style={{ "--i": 1 }}>
                <div className="flex items-center justify-between gap-3 border-b pb-4">
                  <div className="flex items-center gap-3">
                    <span className="icon-tile icon-tile-track" style={{ "--track": "#3B82F6" }}>
                      <IconCamera />
                    </span>
                    <div>
                      <p className="eyebrow">Images & Photographs</p>
                      <h2 className="h3 text-ink">Photo Upload Limits</h2>
                    </div>
                  </div>
                  <span className="chip chip-sm bg-accent/10 text-accent font-medium">
                    JPEG, PNG, WebP, GIF
                  </span>
                </div>

                <p className="prose-muted mt-4 text-xs sm:text-sm">
                  Controls the number and size of photos teachers can attach when submitting or editing an event.
                </p>

                <div className="mt-6 space-y-5">
                  {/* Max Photos per Event */}
                  <div className="field">
                    <label htmlFor="max-photos">
                      Max photos per event<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="max-photos"
                        type="number"
                        min="1"
                        max="100"
                        value={maxPhotos}
                        onChange={(e) => setMaxPhotos(e.target.value)}
                        disabled={saving}
                        className="input font-mono"
                        aria-invalid={fieldErrors.maxPhotos ? "true" : undefined}
                      />
                    </div>
                    <p className="field-hint">
                      Maximum number of images permitted for a single event (default: 10).
                    </p>
                    {fieldErrors.maxPhotos && (
                      <p className="field-error">{fieldErrors.maxPhotos}</p>
                    )}
                  </div>

                  {/* Max Size per Photo */}
                  <div className="field">
                    <label htmlFor="max-photo-size">
                      Max size per photo (MB)<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="max-photo-size"
                        type="number"
                        min="1"
                        max="100"
                        value={maxPhotoSizeMb}
                        onChange={(e) => setMaxPhotoSizeMb(e.target.value)}
                        disabled={saving}
                        className="input font-mono"
                        aria-invalid={fieldErrors.maxPhotoSizeMb ? "true" : undefined}
                      />
                    </div>
                    <p className="field-hint">
                      Single file threshold in megabytes. Photos exceeding this will be rejected (default: 20 MB).
                    </p>
                    {fieldErrors.maxPhotoSizeMb && (
                      <p className="field-error">{fieldErrors.maxPhotoSizeMb}</p>
                    )}
                  </div>

                  {/* Combined Photo Size (Optional) */}
                  <div className="rounded-xl border p-4 bg-raised/40 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={photoTotalEnabled}
                        onChange={(e) => {
                          setPhotoTotalEnabled(e.target.checked);
                          if (!e.target.checked) setMaxPhotoTotalMb("");
                        }}
                        className="rounded border text-accent focus:ring-accent"
                        disabled={saving}
                      />
                      <span className="text-sm font-semibold text-ink">
                        Enforce combined total photo budget
                      </span>
                    </label>

                    {photoTotalEnabled && (
                      <div className="field pt-1">
                        <label htmlFor="max-photo-total">
                          Max total combined size for all photos (MB)<span className="req">*</span>
                        </label>
                        <input
                          id="max-photo-total"
                          type="number"
                          min="1"
                          max="1000"
                          placeholder="e.g. 100"
                          value={maxPhotoTotalMb}
                          onChange={(e) => setMaxPhotoTotalMb(e.target.value)}
                          disabled={saving}
                          className="input font-mono"
                          aria-invalid={fieldErrors.maxPhotoTotalMb ? "true" : undefined}
                        />
                        <p className="field-hint">
                          Optional total budget for all attached photos combined. Must be ≥ per-photo limit.
                        </p>
                        {fieldErrors.maxPhotoTotalMb && (
                          <p className="field-error">{fieldErrors.maxPhotoTotalMb}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* ================================= Videos Section ================================= */}
              <section className="glass reveal flex flex-col p-5 sm:p-7" style={{ "--i": 2 }}>
                <div className="flex items-center justify-between gap-3 border-b pb-4">
                  <div className="flex items-center gap-3">
                    <span className="icon-tile icon-tile-track" style={{ "--track": "#8B5CF6" }}>
                      <IconFilm />
                    </span>
                    <div>
                      <p className="eyebrow">Recordings & Teasers</p>
                      <h2 className="h3 text-ink">Video Upload Limits</h2>
                    </div>
                  </div>
                  <span className="chip chip-sm bg-purple-500/10 text-purple-600 font-medium">
                    MP4, WebM, MOV
                  </span>
                </div>

                <p className="prose-muted mt-4 text-xs sm:text-sm">
                  Controls individual video file sizes, maximum video count, and the cumulative video storage cap.
                </p>

                <div className="mt-6 space-y-5">
                  {/* Max Videos per Event (Optional count) */}
                  <div className="rounded-xl border p-4 bg-raised/40 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={videoCountEnabled}
                        onChange={(e) => {
                          setVideoCountEnabled(e.target.checked);
                          if (!e.target.checked) setMaxVideos("");
                        }}
                        className="rounded border text-accent focus:ring-accent"
                        disabled={saving}
                      />
                      <span className="text-sm font-semibold text-ink">
                        Enforce maximum video count limit
                      </span>
                    </label>

                    {videoCountEnabled ? (
                      <div className="field pt-1">
                        <label htmlFor="max-videos">
                          Max number of videos allowed<span className="req">*</span>
                        </label>
                        <input
                          id="max-videos"
                          type="number"
                          min="1"
                          max="50"
                          placeholder="e.g. 5"
                          value={maxVideos}
                          onChange={(e) => setMaxVideos(e.target.value)}
                          disabled={saving}
                          className="input font-mono"
                          aria-invalid={fieldErrors.maxVideos ? "true" : undefined}
                        />
                        <p className="field-hint">
                          Limit on the number of individual video files per event.
                        </p>
                        {fieldErrors.maxVideos && (
                          <p className="field-error">{fieldErrors.maxVideos}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        Unchecked: Teachers may upload any number of videos as long as the total combined size is not exceeded.
                      </p>
                    )}
                  </div>

                  {/* Max Size per Video */}
                  <div className="field">
                    <label htmlFor="max-video-size">
                      Max size per video (MB)<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="max-video-size"
                        type="number"
                        min="1"
                        max="1000"
                        value={maxVideoSizeMb}
                        onChange={(e) => setMaxVideoSizeMb(e.target.value)}
                        disabled={saving}
                        className="input font-mono"
                        aria-invalid={fieldErrors.maxVideoSizeMb ? "true" : undefined}
                      />
                    </div>
                    <p className="field-hint">
                      Maximum size of any single video file in megabytes (default: 200 MB).
                    </p>
                    {fieldErrors.maxVideoSizeMb && (
                      <p className="field-error">{fieldErrors.maxVideoSizeMb}</p>
                    )}
                  </div>

                  {/* Max Total Video Size */}
                  <div className="field">
                    <label htmlFor="max-video-total">
                      Max total combined size for all videos (MB)<span className="req">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="max-video-total"
                        type="number"
                        min="1"
                        max="2000"
                        value={maxVideoTotalMb}
                        onChange={(e) => setMaxVideoTotalMb(e.target.value)}
                        disabled={saving}
                        className="input font-mono"
                        aria-invalid={fieldErrors.maxVideoTotalMb ? "true" : undefined}
                      />
                    </div>
                    <p className="field-hint">
                      Cumulative byte budget across all videos for an event (default: 200 MB).
                    </p>
                    {fieldErrors.maxVideoTotalMb && (
                      <p className="field-error">{fieldErrors.maxVideoTotalMb}</p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Bottom Actions Bar */}
            <div className="glass reveal flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6" style={{ "--i": 3 }}>
              <div className="flex items-center gap-2 text-xs text-muted">
                {formattedDate ? (
                  <>
                    <IconClock className="h-4 w-4 text-muted" />
                    <span>Last updated: <span className="font-semibold text-ink">{formattedDate}</span></span>
                  </>
                ) : (
                  <span>Using default system configuration</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Link to="/superadmin/dashboard" className="btn btn-ghost text-sm">
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving || resetting}
                  className="btn btn-primary min-w-36 text-sm"
                >
                  {saving ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <IconSave />
                      Save Limits
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </SuperAdminShell>
  );
}
