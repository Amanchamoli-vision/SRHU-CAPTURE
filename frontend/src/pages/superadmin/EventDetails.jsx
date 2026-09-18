import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch, apiJson, errorFromResponse } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import SuperAdminShell from "../../components/superadmin/SuperAdminShell";
import PageHero from "../../components/teacher/PageHero";
import StatusChip from "../../components/teacher/StatusChip";
import EventMediaSections from "../../components/common/EventMediaSections";
import useMediaRefresh from "../../components/common/useMediaRefresh";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendar,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconMapPin,
  IconTag,
  IconUser,
} from "../../components/teacher/icons";
import { decodeEventMetadata } from "../../utils/draftStorage";

const formatDay = (value) => {
  if (!value) return "Not set";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatKb = (bytes) => (bytes ? ` · ${Math.max(1, Math.round(bytes / 1024))} KB` : "");

/**
 * One event as the superadmin sees it: its details, its Photos and Videos in
 * their own sections, its documents and, once generated, its report. There
 * are no decision buttons here -- approving and rejecting belong to the Deans.
 */
export default function SuperAdminEventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [event, setEvent] = useState(null);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [teacherName, setTeacherName] = useState("");
  const [reportReady, setReportReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const loadEvent = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [eventData, mediaData, documentData, reportData, userData] = await Promise.all([
        apiJson(`/dean/events/${eventId}`),
        apiJson(`/dean/events/${eventId}/media`),
        apiJson(`/dean/events/${eventId}/documents`),
        apiJson(`/dean/events/${eventId}/report-status`),
        apiJson("/superadmin/users"),
      ]);

      const loaded = eventData?.event || null;
      setEvent(loaded);
      setMedia(mediaData?.media || []);
      setDocuments(documentData?.documents || []);
      setReportReady(Boolean(reportData?.report_generated));
      const owner = (userData?.users || []).find((u) => u.id === loaded?.teacher_id);
      setTeacherName(owner ? owner.name || owner.email : "");
    } catch (err) {
      if (err?.status === 401) {
        navigate("/login");
        return;
      }
      console.error("Load event error:", err);
      setError(err.status === 404 ? "This event no longer exists." : err.message || "Failed to load the event");
    } finally {
      setLoading(false);
    }
  }, [eventId, navigate]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // Media and document links are signed and expire; when one fails to load,
  // fetch fresh ones without reloading the whole page.
  const refreshMediaLinks = useMediaRefresh(async () => {
    const [mediaData, documentData] = await Promise.all([
      apiJson(`/dean/events/${eventId}/media`),
      apiJson(`/dean/events/${eventId}/documents`),
    ]);
    setMedia(mediaData?.media || []);
    setDocuments(documentData?.documents || []);
  });

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleDownloadReport = async () => {
    try {
      setDownloading(true);
      setError("");
      const response = await apiFetch(`/dean/events/${eventId}/report/download`);
      if (!response.ok) {
        throw await errorFromResponse(response, "Failed to download report");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(event?.event_name || "Event").replace(/[^a-z0-9]+/gi, "_")}_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  const { description, meta } = decodeEventMetadata(event?.description || "");

  const facts = event
    ? [
        { label: "Date", value: formatDay(event.event_date), Icon: IconCalendar },
        { label: "Type", value: event.event_type || "Not set", Icon: IconTag },
        { label: "Venue", value: event.location || "Not set", Icon: IconMapPin },
        { label: "Teacher", value: teacherName || "Unknown", Icon: IconUser },
        meta.department && { label: "Department", value: meta.department, Icon: IconTag },
        meta.organizer && { label: "Organizer", value: meta.organizer, Icon: IconUser },
      ].filter(Boolean)
    : [];

  return (
    <SuperAdminShell
      active="events"
      profile={profile}
      onLogout={handleLogout}
      railNote="Read-only view. Approving, rejecting and reports are handled by the Deans."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
        <Link to="/superadmin/events" className="btn btn-ghost btn-sm mb-5">
          <IconArrowLeft />
          All events
        </Link>

        {error && (
          <div className="toast toast-err mb-6" role="alert">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <p className="flex-1 text-sm font-medium text-ink">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="glass px-6 py-16 text-center">
            <span className="spin mx-auto mb-4 block h-9 w-9 text-accent" />
            <p className="prose-muted text-sm">Loading event…</p>
          </div>
        ) : !event ? null : (
          <>
            <PageHero
              eyebrow="Event"
              title={event.event_name || "Untitled Event"}
              subtitle={teacherName ? `Submitted by ${teacherName}` : undefined}
              actions={
                <div className="flex flex-wrap items-center gap-2.5">
                  <StatusChip status={event.status} size="md" />
                  {reportReady && (
                    <button
                      type="button"
                      onClick={handleDownloadReport}
                      disabled={downloading}
                      className="btn btn-primary"
                    >
                      {downloading ? <span className="spin h-4 w-4" /> : <IconDownload />}
                      Download report
                    </button>
                  )}
                </div>
              }
            />

            <div className="mt-6 space-y-6">
              <section className="glass overflow-hidden">
                <dl className="grid sm:grid-cols-2 lg:grid-cols-3">
                  {facts.map(({ label, value, Icon }) => (
                    <div key={label} className="flex items-start gap-3 px-5 py-4">
                      <span className="icon-tile h-9 w-9 rounded-lg">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
                        <dd className="mt-0.5 wrap-break-word text-sm font-medium text-ink">{value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
                <div className="border-t hairline px-6 py-5">
                  <p className="eyebrow">Description</p>
                  <p className="prose-muted mt-2 whitespace-pre-line text-sm">
                    {description || "No description provided."}
                  </p>
                  {event.rejection_reason && (
                    <p className="mt-4 text-sm text-ink">
                      <span className="font-semibold">Dean&apos;s remarks: </span>
                      {event.rejection_reason}
                    </p>
                  )}
                </div>
              </section>

              <EventMediaSections
                items={media}
                eventName={event.event_name || "Event"}
                onLoadError={refreshMediaLinks}
              />

              <section className="glass overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b hairline px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="icon-tile h-9 w-9 rounded-lg">
                      <IconFileText className="h-4 w-4" />
                    </span>
                    <h2 className="h3 text-base text-ink">Documents</h2>
                  </div>
                  <span className="chip chip-sm chip-solid num">{documents.length}</span>
                </div>
                <div className="p-5">
                  {documents.length === 0 ? (
                    <p className="prose-muted rounded-xl border border-dashed border-line/20 p-6 text-center text-sm">
                      No supporting documents uploaded.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {documents.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-xl border hairline bg-raised/40 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">{doc.file_name}</p>
                            <p className="text-[10px] text-muted">
                              {doc.file_type || "File"}
                              {formatKb(doc.file_size)}
                            </p>
                          </div>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-xs shrink-0"
                          >
                            <IconExternalLink />
                            Open
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </SuperAdminShell>
  );
}
