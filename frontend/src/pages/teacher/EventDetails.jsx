import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../services/api";
import { fetchCurrentUser, signOut } from "../../services/auth";
import { canTeacherEditEvent } from "../../utils/constants";
import { buildTimeline } from "../../utils/eventHistory";
import {
  decodeEventMetadata,
  duplicateEventAsDraft,
} from "../../utils/draftStorage";
import TeacherShell from "../../components/teacher/TeacherShell";
import PageHero from "../../components/teacher/PageHero";
import Modal from "../../components/teacher/Modal";
import Lifecycle from "../../components/teacher/Lifecycle";
import ProgressTimeline from "../../components/teacher/ProgressTimeline";
import StatusChip from "../../components/teacher/StatusChip";
import { isApprovedStatus, trackOf } from "../../components/teacher/status";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowLeft,
  IconBuilding,
  IconCheckCircle,
  IconCalendar,
  IconClock,
  IconCopy,
  IconDownload,
  IconEdit,
  IconFilm,
  IconMapPin,
  IconPhone,
  IconRefresh,
  IconTag,
  IconTrash,
  IconUser,
  IconUsers,
  RidgeDivider,
} from "../../components/teacher/icons";

function formatTimestamp(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function getFileExt(fileName) {
  const parts = (fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toUpperCase() : "DOC";
}

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      setError("");

      const userProfile = await fetchCurrentUser();

      if (!userProfile) {
        navigate("/login");
        return;
      }

      if (userProfile.role !== "teacher") {
        navigate("/");
        return;
      }

      setProfile(userProfile);

      // Event, media and supporting documents in one API call
      const { event: eventData, media: mediaData, documents: docData } =
        await apiJson(`/teacher/events/${eventId}`);

      setEvent(eventData);
      setMedia(mediaData || []);
      setDocuments(docData || []);
    } catch (err) {
      console.error("Event details error:", err);
      setError(err.message || "Unable to load event details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventDetails();
  }, [eventId]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleDuplicate = () => {
    if (!event || !profile) return;
    try {
      const newDraft = duplicateEventAsDraft(profile.id, event);
      setActionNotice("Event duplicated as new draft.");
      setTimeout(() => {
        navigate(`/teacher/create-event?draftId=${newDraft.id}`);
      }, 700);
    } catch (err) {
      console.error("Duplicate error:", err);
      alert("Failed to duplicate event.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!event || !profile) return;
    try {
      setDeletingLoading(true);
      await apiJson(`/teacher/events/${event.id}`, { method: "DELETE" });

      navigate("/teacher/my-events", { replace: true });
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete event: " + (err.message || "Unknown error"));
    } finally {
      setDeletingLoading(false);
      setShowDeleteModal(false);
    }
  };

  const scrollToLifecycle = () => {
    const el = document.getElementById("approval-lifecycle-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="hv-root flex min-h-screen items-center justify-center">
        <div className="text-center">
          <span className="spin mx-auto mb-4 block h-10 w-10 text-accent" />
          <p className="prose-muted text-sm">Loading event details…</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="hv-root flex min-h-screen items-center justify-center px-4">
        <div className="glass w-full max-w-md p-9 text-center">
          <span
            className="icon-tile icon-tile-track mx-auto mb-4 h-14 w-14 rounded-2xl"
            style={{ "--track": trackOf("rejected") }}
          >
            <IconAlertTriangle className="h-6 w-6" />
          </span>
          <h1 className="h3 text-ink">Event Not Found</h1>
          <p className="prose-muted mt-2 text-sm">
            {error || "This event could not be found."}
          </p>
          <Link to="/teacher/my-events" className="btn btn-brand mt-6">
            <IconArrowLeft />
            Back to My Events
          </Link>
        </div>
      </div>
    );
  }

  const { description: cleanDescription, meta } = decodeEventMetadata(event.description);
  // The approval banner reads from the recorded trail, so it can name the
  // Dean who approved and say whether a rejection came first.
  const timeline = buildTimeline(event);
  const isApprovedNow = isApprovedStatus(String(event.status || "").toLowerCase());
  const approval = isApprovedNow
    ? [...timeline].reverse().find((entry) => entry.action === "approved") || null
    : null;
  const hadRejection = timeline.some(
    (entry) => entry.action === "rejected" || entry.action === "changes_requested"
  );

  const canDelete =
    event.status === "draft" ||
    event.status === "pending" ||
    event.status === "submitted" ||
    event.status === "rejected";

  const facts = [
    { Icon: IconCalendar, label: "Date", value: event.event_date || "Not set" },
    {
      Icon: IconClock,
      label: "Timings",
      value: meta.startTime && meta.endTime ? `${meta.startTime} – ${meta.endTime}` : "All day",
    },
    { Icon: IconMapPin, label: "Venue", value: event.location || "Not set" },
  ];

  const details = [
    { Icon: IconBuilding, label: "Department / School", value: meta.department || "University-wide" },
    {
      Icon: IconUser,
      label: "Organizer / Coordinator",
      value: meta.organizer || profile?.name || "Not specified",
    },
    {
      Icon: IconPhone,
      label: "Contact Information",
      value: meta.contactInfo || profile?.email || "Not specified",
    },
    ...(meta.expectedParticipants
      ? [{ Icon: IconUsers, label: "Expected Participants", value: meta.expectedParticipants }]
      : []),
  ];

  return (
    <TeacherShell
      active="events"
      profile={profile}
      onLogout={handleLogout}
      railNote="Complete review records, history, and uploaded assets for this event."
    >
      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        {actionNotice && (
          <div className="toast toast-ok mb-5" role="status">
            <span className="dot mt-1" style={{ "--track": trackOf("approved") }} />
            <p className="text-sm font-medium text-ink">{actionNotice}</p>
          </div>
        )}

        {/* ------------------------------------------------- back + actions */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link to="/teacher/my-events" className="btn btn-ghost btn-sm">
            <IconArrowLeft />
            Back to My Events
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={scrollToLifecycle} className="btn btn-ghost btn-xs">
              <IconActivity />
              Track Status
            </button>

            <button
              type="button"
              onClick={handleDuplicate}
              className="btn btn-ghost btn-xs hover:border-ember/60"
            >
              <IconCopy />
              Duplicate
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="btn btn-ghost btn-xs text-err hover:border-err/50"
              >
                <IconTrash />
                Delete
              </button>
            )}

            {event.status === "rejected" && (
              <Link
                to={`/teacher/create-event?editEventId=${event.id}`}
                className="btn btn-danger btn-xs"
              >
                <IconRefresh />
                Edit &amp; Resubmit
              </Link>
            )}

            {/* Editable until the Dean approves it. */}
            {event.status !== "rejected" && canTeacherEditEvent(event) && (
              <Link
                to={`/teacher/create-event?editEventId=${event.id}`}
                className="btn btn-ghost btn-xs"
              >
                <IconEdit />
                Edit
              </Link>
            )}
          </div>
        </div>

        {/* -------------------------------------------------------- the hero */}
        <PageHero
          eyebrow={event.event_type}
          title={event.event_name}
          subtitle={`Organized by ${meta.organizer || profile?.name || "Teacher"}`}
          actions={<StatusChip status={event.status} size="md" />}
        >
          <dl className="grid gap-4 border-t hairline pt-5 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-center gap-3">
                <span className="icon-tile h-9 w-9 rounded-xl">
                  <fact.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted">
                    {fact.label}
                  </dt>
                  <dd className="truncate text-sm font-medium text-ink">{fact.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </PageHero>

        {/* ---------------------------------------------- approved, plainly */}
        {approval && (
          <section
            style={{ "--track": trackOf("approved") }}
            data-tint="approved"
            className="reveal mt-6 flex items-start gap-3 rounded-2xl border px-6 py-4"
            role="status"
          >
            <IconCheckCircle
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: trackOf("approved") }}
            />
            <div className="min-w-0">
              <h2 className="h3 text-base text-ink">Approved by the Dean</h2>
              <p className="prose-muted mt-0.5 text-sm">
                {approval.actor_name ? `${approval.actor_name} approved` : "Approved"} this
                event on {formatTimestamp(approval.created_at)}.
                {hadRejection && " It had been sent back earlier — the full exchange is below."}
              </p>
            </div>
          </section>
        )}

        {/* ------------------------------------------- progress and updates */}
        <section id="approval-lifecycle-section" className="glass reveal mt-6 p-6">
          <p className="eyebrow">Tracking</p>
          <h2 className="h3 mt-1 text-ink">Event progress &amp; updates</h2>
          <p className="prose-muted mt-0.5 text-xs">
            Where this event stands, every step it has been through, and everything
            the Dean has said about it.
          </p>

          <div className="mt-7">
            <Lifecycle status={event.status || "pending"} />
          </div>

          <div className="mt-8 border-t hairline pt-6">
            <h3 className="mb-4 font-display text-sm font-semibold text-ink">
              History
            </h3>
            <ProgressTimeline event={event} viewerId={profile?.id} perspective="teacher" />
          </div>
        </section>

        {/* --------------------------------------------------- Dean remarks */}
        {event.rejection_reason && (
          <section
            style={{ "--track": trackOf("rejected") }}
            data-tint="rejected"
            className="reveal mt-6 overflow-hidden rounded-2xl border"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
                 style={{ borderColor: "color-mix(in srgb, var(--track) 22%, transparent)" }}>
              <div className="flex items-center gap-2.5">
                <IconAlertTriangle className="h-5 w-5" style={{ color: trackOf("rejected") }} />
                <h2 className="h3 text-base text-ink">Reviewer / Dean Remarks</h2>
              </div>

              <Link
                to={`/teacher/create-event?editEventId=${event.id}`}
                className="btn btn-danger btn-xs"
              >
                <IconRefresh />
                Edit &amp; Resubmit
              </Link>
            </div>

            <p className="whitespace-pre-line px-6 py-5 text-sm leading-6 text-ink">
              {event.rejection_reason}
            </p>
          </section>
        )}

        <RidgeDivider className="divider mt-6" />

        {/* ---------------------------------------------- coordination info */}
        <section className="glass p-6">
          <p className="eyebrow">Coordination</p>
          <h2 className="h3 mt-1 border-b hairline pb-4 text-ink">Event Information</h2>

          <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {details.map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="icon-tile h-9 w-9 rounded-xl">
                  <item.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted">{item.label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">{item.value}</dd>
                </div>
              </div>
            ))}

            {event.social_network_url && (
              <div className="flex items-start gap-3 sm:col-span-2">
                <span className="icon-tile h-9 w-9 rounded-xl">
                  <IconTag className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted">Social Network Link</dt>
                  <dd className="mt-0.5">
                    <a
                      href={event.social_network_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link text-sm font-semibold"
                    >
                      {event.social_network_url}
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </section>

        {/* ------------------------------------------------------ description */}
        <section className="glass mt-6 overflow-hidden">
          <div className="border-b hairline px-6 py-5">
            <p className="eyebrow">Proposal</p>
            <h2 className="h3 mt-1 text-ink">Event Description</h2>
          </div>
          <p className="prose-muted whitespace-pre-line px-6 py-5 text-sm">
            {cleanDescription || "No description provided."}
          </p>
        </section>

        {/* ------------------------------------------------------- the files */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">

          <section className="glass overflow-hidden">
            <div className="flex items-center justify-between border-b hairline px-6 py-4">
              <h2 className="h3 text-base text-ink">Supporting Documents</h2>
              <span className="chip chip-sm chip-solid num">{documents.length}</span>
            </div>

            <div className="p-5">
              {documents.length === 0 ? (
                <p className="prose-muted py-6 text-center text-xs">
                  No supporting documents uploaded.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 rounded-xl border hairline bg-raised/40 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="icon-tile h-9 w-9 rounded-lg font-display text-[10px] font-bold">
                          {getFileExt(doc.file_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink">
                            {doc.file_name}
                          </p>
                          <p className="text-[10px] text-muted">{formatFileSize(doc.file_size)}</p>
                        </div>
                      </div>

                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="btn btn-ghost btn-xs shrink-0"
                      >
                        <IconDownload />
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="glass overflow-hidden">
            <div className="flex items-center justify-between border-b hairline px-6 py-4">
              <h2 className="h3 text-base text-ink">Media Files</h2>
              <span className="chip chip-sm chip-solid num">{media.length}</span>
            </div>

            <div className="p-5">
              {media.length === 0 ? (
                <p className="prose-muted py-6 text-center text-xs">
                  No photos or videos attached.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {media.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-xl border hairline bg-raised/60"
                    >
                      {item.media_type === "video" ? (
                        <div className="flex h-24 items-center justify-center bg-ink/80 text-surface">
                          <IconFilm className="h-6 w-6" />
                        </div>
                      ) : (
                        <img
                          src={item.media_url}
                          alt={event.event_name}
                          className="h-24 w-full object-cover transition duration-200 group-hover:scale-105"
                        />
                      )}
                      <a
                        href={item.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 flex items-center justify-center bg-ink/45 opacity-0 transition group-hover:opacity-100"
                      >
                        <span className="chip chip-sm chip-solid">Open</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ----------------------------------------------------- delete modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => !deletingLoading && setShowDeleteModal(false)}
        eyebrow="Confirm"
        title="Delete Event"
        subtitle="Permanent action"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              disabled={deletingLoading}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deletingLoading}
              className="btn btn-danger btn-sm"
            >
              {deletingLoading && <span className="spin h-3.5 w-3.5" />}
              {deletingLoading ? "Deleting…" : "Delete Event"}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="icon-tile icon-tile-track" style={{ "--track": trackOf("rejected") }}>
            <IconAlertTriangle />
          </span>
          <p className="prose-muted text-sm">
            Are you sure you want to delete{" "}
            <strong>&ldquo;{event.event_name}&rdquo;</strong>? This removes all event records,
            uploads, and history.
          </p>
        </div>
      </Modal>
    </TeacherShell>
  );
}

export default EventDetails;
