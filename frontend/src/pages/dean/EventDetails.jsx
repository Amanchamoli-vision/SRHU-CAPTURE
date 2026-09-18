import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchCurrentUser, getSession as getStoredSession, signOut } from "../../services/auth";
import { API_BASE_URL } from "../../services/api";
import DeanShell from "../../components/dean/DeanShell";
import Modal from "../../components/teacher/Modal";
import PageHero from "../../components/teacher/PageHero";
import ProgressTimeline from "../../components/teacher/ProgressTimeline";
import StatusChip from "../../components/teacher/StatusChip";
import { trackOf } from "../../components/teacher/status";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconImagePlus,
  IconMapPin,
  IconPhone,
  IconRefresh,
  IconShield,
  IconTag,
  IconUser,
  IconUsers,
  IconX,
  RidgeDivider,
} from "../../components/teacher/icons";
import {
  canApproveEvent,
  canRejectEvent,
  getApproveLabel,
  getNextStage,
  getPreviousStage,
  getRejectLabel,
  getStatusBucket,
  isRejected,
} from "../../utils/constants";
import { decodeEventMetadata } from "../../utils/draftStorage";

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);

  // Signed-in Dean, used for the shell's account blocks.
  const [deanProfile, setDeanProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);

  const [socialNetworkUrl, setSocialNetworkUrl] = useState("");
  const [savingSocialLink, setSavingSocialLink] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Media / documents share one panel so they cost one card, not two.
  const [activeTab, setActiveTab] = useState("media");

  // Advancing through the post-approval delivery stages.
  const [stageSaving, setStageSaving] = useState(false);

  // The decision being confirmed: "approve" | "reject". A themed dialog rather
  // than window.confirm / window.prompt, matching the All Events screen.
  const [decisionKind, setDecisionKind] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  // ============================================================
  // GET SESSION
  // ============================================================

  const getSession = async () => {
    const session = getStoredSession();

    if (!session?.access_token) {
      navigate("/login");
      return null;
    }

    return session;
  };

  // ============================================================
  // LOAD EVENT
  // ============================================================

  const loadEvent = async () => {
    try {
      setLoading(true);
      setError("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(`${API_BASE_URL}/dean/events`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to load event");
      }

      const foundEvent = (data.events || []).find((item) => item.id === eventId);

      if (!foundEvent) {
        throw new Error("Event not found");
      }

      setEvent(foundEvent);

      setSocialNetworkUrl(foundEvent.social_network_url || "");

      await loadMedia(eventId, session.access_token);

      await loadDocuments(eventId, session.access_token);

      await loadReportStatus(eventId, session.access_token);
    } catch (err) {
      console.error("Load event error:", err);

      setError(err.message || "Failed to load event details");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOAD MEDIA
  // ============================================================

  const loadMedia = async (id, accessToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/dean/events/${id}/media`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        setMedia([]);
        return;
      }

      const data = await response.json();

      setMedia(data.media || []);
    } catch (err) {
      console.error("Load media error:", err);
      setMedia([]);
    }
  };

  // ============================================================
  // LOAD DOCUMENTS
  // ============================================================

  const loadDocuments = async (id, accessToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/dean/events/${id}/documents`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        setDocuments([]);
        return;
      }

      const data = await response.json();

      setDocuments(data.documents || []);
    } catch (err) {
      console.error("Load documents error:", err);
      setDocuments([]);
    }
  };

  // ============================================================
  // LOAD REPORT STATUS
  // ============================================================

  const loadReportStatus = async (id, accessToken) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/dean/events/${id}/report-status`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      setReportGenerated(Boolean(data.report_generated));

      setGeneratedAt(data.generated_at || null);

      if (data.social_network_url) {
        setSocialNetworkUrl(data.social_network_url);
      }
    } catch (err) {
      console.error("Load report status error:", err);
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  useEffect(() => {
    let mounted = true;

    fetchCurrentUser()
      .then((data) => {
        // Non-blocking: the shell falls back to a neutral initial.
        if (mounted && data) setDeanProfile(data);
      })
      .catch((err) => console.error("Load dean profile error:", err));

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  // ============================================================
  // OPEN / CLOSE A DECISION
  // ============================================================

  const openDecision = (kind) => {
    setDecisionKind(kind);
    setRejectReason("");
    setReasonError("");
  };

  const closeDecision = () => {
    if (processing) return; // never abandon a request mid-flight
    setDecisionKind(null);
    setRejectReason("");
    setReasonError("");
  };

  // ============================================================
  // APPROVE EVENT
  // ============================================================

  const confirmApprove = async () => {
    if (!event) return;

    try {
      setProcessing(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/approve`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to approve event");
      }

      setEvent(data.event);

      setSuccess(data.message || "Event approved successfully.");
      setDecisionKind(null);

      // Refresh report status after approval
      await loadReportStatus(event.id, session.access_token);
    } catch (err) {
      console.error("Approve event error:", err);

      setError(err.message || "Failed to approve event");
      setDecisionKind(null);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // REJECT EVENT
  // ============================================================

  const confirmReject = async () => {
    if (!event) return;

    const reason = rejectReason.trim();

    if (!reason) {
      setReasonError("A reason is required — the teacher sees it verbatim.");
      return;
    }

    try {
      setProcessing(true);
      setError("");
      setSuccess("");
      setReasonError("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/reject?rejection_reason=${encodeURIComponent(
          reason
        )}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to reject event");
      }

      setEvent(data.event);

      setSuccess(data.message || "Event rejected successfully.");
      setDecisionKind(null);

      // Mirrors confirmApprove: keep report state in sync when the decision
      // is revised without a page reload. report-status has no status gate.
      await loadReportStatus(event.id, session.access_token);
    } catch (err) {
      console.error("Reject event error:", err);

      setError(err.message || "Failed to reject event");
      setDecisionKind(null);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // CHANGE STAGE
  // ============================================================

  const handleChangeStage = async (stageKey) => {
    if (!event) return;

    try {
      setStageSaving(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/stage?stage=${encodeURIComponent(
          stageKey
        )}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to update the event stage");
      }

      setEvent(data.event);

      setSuccess(data.message || "Event stage updated successfully.");
    } catch (err) {
      console.error("Change stage error:", err);

      setError(err.message || "Failed to update the event stage");
    } finally {
      setStageSaving(false);
    }
  };

  // ============================================================
  // SAVE SOCIAL NETWORK LINK
  // ============================================================

  const handleSaveSocialLink = async () => {
    if (!event) return;

    if (!socialNetworkUrl.trim()) {
      setError("Please enter a Social Network Link.");
      return;
    }

    try {
      setSavingSocialLink(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/social-link`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            social_network_url: socialNetworkUrl.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to save Social Network Link");
      }

      setSocialNetworkUrl(data.social_network_url);

      setEvent((previous) => ({
        ...previous,
        social_network_url: data.social_network_url,
      }));

      // Existing report becomes invalid
      // because social link changed.
      setReportGenerated(false);
      setGeneratedAt(null);

      setSuccess("Social Network Link saved successfully.");
    } catch (err) {
      console.error("Save social link error:", err);

      setError(err.message || "Failed to save Social Network Link");
    } finally {
      setSavingSocialLink(false);
    }
  };

  // ============================================================
  // GENERATE REPORT
  // ============================================================

  const handleGenerateReport = async () => {
    if (!event) return;

    if (event.status !== "approved") {
      setError("Report can only be generated for an approved event.");
      return;
    }

    if (!socialNetworkUrl.trim()) {
      setError("Social Network Link is required before generating the report.");
      return;
    }

    try {
      setReportLoading(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/generate-report`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to generate report");
      }

      setReportGenerated(true);

      setGeneratedAt(data.generated_at || null);

      setSuccess(data.message || "Report generated successfully.");
    } catch (err) {
      console.error("Generate report error:", err);

      setError(err.message || "Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  // ============================================================
  // DOWNLOAD REPORT
  // ============================================================

  const handleDownloadReport = async () => {
    if (!event) return;

    try {
      setReportLoading(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/report/download`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        let message = "Failed to download report";

        try {
          const data = await response.json();

          message = data.detail || message;
        } catch {
          // Ignore JSON parsing error
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = downloadUrl;

      link.download = `${event.event_name
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_")}_Report.pdf`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      window.URL.revokeObjectURL(downloadUrl);

      setSuccess("Report downloaded successfully.");
    } catch (err) {
      console.error("Download report error:", err);

      setError(err.message || "Failed to download report");
    } finally {
      setReportLoading(false);
    }
  };

  // ============================================================
  // LOADING
  // ============================================================

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

  // ============================================================
  // ERROR / NOT FOUND
  // ============================================================

  if (error && !event) {
    return (
      <DeanShell active="events" profile={deanProfile} onLogout={handleLogout}>
        <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">
          <div
            className="flex flex-col items-center rounded-2xl border px-6 py-14 text-center"
            data-tint=""
            style={{ "--track": trackOf("rejected") }}
            role="alert"
          >
            <span
              className="icon-tile icon-tile-track mb-4 h-14 w-14 rounded-2xl"
              style={{ "--track": trackOf("rejected") }}
            >
              <IconAlertTriangle className="h-6 w-6" />
            </span>

            <h1 className="h3 text-ink">Unable to load this event</h1>
            <p className="prose-muted mt-1.5 max-w-md text-sm">{error}</p>

            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={loadEvent} className="btn btn-ghost btn-sm">
                <IconRefresh />
                Try again
              </button>
              <Link to="/dean/events" className="btn btn-brand btn-sm">
                <IconArrowLeft />
                Back to all events
              </Link>
            </div>
          </div>
        </div>
      </DeanShell>
    );
  }

  // ============================================================
  // MAIN UI
  // ============================================================

  // ----------------------------------------------------------
  // Derived view data
  // ----------------------------------------------------------

  // Teacher extras are encoded into description as an HTML comment; decode so
  // the Dean sees a clean description plus the fields that were hidden in it.
  const { description: cleanDescription, meta } = decodeEventMetadata(
    event.description || ""
  );

  const rejected = isRejected(event.status);
  const nextStage = getNextStage(event.status);
  const previousStage = getPreviousStage(event.status);
  const isApproved = getStatusBucket(event.status) === "approved";

  const isRevoking = decisionKind === "reject" && isApproved;
  const isReapproving = decisionKind === "approve" && rejected;

  const formatStamp = (value) => {
    if (!value) return "date not recorded";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "date not recorded";
    return parsed.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDay = (value) => {
    if (!value) return "Not set";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const timeRange =
    meta.startTime || meta.endTime
      ? `${meta.startTime || "?"}${meta.endTime ? ` – ${meta.endTime}` : ""}`
      : "Not set";

  // The hero's four facts: what the Dean checks first, in the order they ask.
  const facts = [
    { label: "Date", value: formatDay(event.event_date), Icon: IconCalendar },
    { label: "Venue", value: event.location || "Not set", Icon: IconMapPin },
    { label: "Time", value: timeRange, Icon: IconClock },
    {
      label: "Organizer",
      value: meta.organizer || "Not provided",
      Icon: IconUser,
    },
  ];

  const details = [
    {
      label: "Department",
      value: meta.department || "Not provided",
      Icon: IconBuilding,
    },
    {
      label: "Expected participants",
      value: meta.expectedParticipants || "Not provided",
      Icon: IconUsers,
    },
    { label: "Contact", value: meta.contactInfo || "Not provided", Icon: IconPhone },
  ];

  return (
    <DeanShell active="events" profile={deanProfile} onLogout={handleLogout}>
      {/* Toasts sit bottom-right so feedback never shifts the layout. */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-85 max-w-[calc(100vw-2.5rem)] flex-col gap-3">
        {error && (
          <div className="toast toast-err pointer-events-auto" role="alert">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" />
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="toast toast-ok pointer-events-auto" role="status">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
              <IconCheck className="h-3 w-3" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{success}</p>
            <button
              type="button"
              onClick={() => setSuccess("")}
              aria-label="Dismiss message"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-wrap px-5 py-8 sm:px-8">

        <Link to="/dean/events" className="btn btn-ghost btn-xs mb-5">
          <IconArrowLeft />
          Back to all events
        </Link>

        {/* -------------------------------------------------------- the hero */}
        <PageHero
          eyebrow={event.event_type || "Program"}
          title={event.event_name}
          subtitle={`Submitted ${formatStamp(event.created_at)}`}
          actions={<StatusChip status={event.status} size="md" />}
        >
          <dl className="grid gap-4 border-t hairline pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-center gap-3">
                <span className="icon-tile h-9 w-9 rounded-xl">
                  <fact.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted">
                    {fact.label}
                  </dt>
                  <dd className="truncate text-sm font-medium text-ink" title={fact.value}>
                    {fact.value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </PageHero>

        {/* ====================================================
            TWO-COLUMN BODY
            Left: the evidence.  Right: the decision, always in view.
        ==================================================== */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">

          {/* ================= LEFT ================= */}
          <div className="space-y-6 lg:col-span-8">

            {/* ---------------------------------------- coordination info */}
            <section className="glass p-6">
              <p className="eyebrow">Coordination</p>
              <h2 className="h3 mt-1 border-b hairline pb-4 text-ink">
                Event information
              </h2>

              <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {details.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <span className="icon-tile h-9 w-9 rounded-xl">
                      <item.Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium text-muted">{item.label}</dt>
                      <dd className="mt-0.5 wrap-break-word text-sm font-semibold text-ink">
                        {item.value}
                      </dd>
                    </div>
                  </div>
                ))}

                <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-3">
                  <span className="icon-tile h-9 w-9 rounded-xl">
                    <IconTag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted">
                      Social network link
                    </dt>
                    <dd className="mt-0.5">
                      {event.social_network_url ? (
                        <a
                          href={event.social_network_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link block truncate text-sm font-semibold"
                        >
                          {event.social_network_url}
                        </a>
                      ) : (
                        <span className="text-sm text-muted italic">Not provided</span>
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>

            {/* ------------------------------------------------ description */}
            <section className="glass overflow-hidden">
              <div className="border-b hairline px-6 py-5">
                <p className="eyebrow">Proposal</p>
                <h2 className="h3 mt-1 text-ink">Event description</h2>
              </div>
              <p className="prose-muted whitespace-pre-line px-6 py-5 text-sm">
                {cleanDescription || "No description provided."}
              </p>
            </section>

            {/* ------------------------------------- media and documents */}
            <section className="glass overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5 border-b hairline px-4 py-3 sm:px-5">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "media"}
                  onClick={() => setActiveTab("media")}
                  className="tab"
                >
                  <IconImagePlus className="h-4 w-4" />
                  Photos &amp; videos
                  <span className="tab-count">{media.length}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "documents"}
                  onClick={() => setActiveTab("documents")}
                  className="tab"
                >
                  <IconFileText className="h-4 w-4" />
                  Documents
                  <span className="tab-count">{documents.length}</span>
                </button>
              </div>

              <div className="p-5">
                {activeTab === "media" ? (
                  media.length === 0 ? (
                    <p className="prose-muted rounded-xl border border-dashed border-line/20 p-6 text-center text-sm">
                      No media uploaded for this event.
                    </p>
                  ) : (
                    <div className="grid max-h-85 gap-3 overflow-y-auto sm:grid-cols-3">
                      {media.map((item) =>
                        item.media_type === "video" ? (
                          // Not wrapped in a link: a click on the player
                          // controls would otherwise open a new tab.
                          <div
                            key={item.id}
                            className="overflow-hidden rounded-xl border hairline bg-black sm:col-span-3"
                          >
                            <video
                              src={item.media_url}
                              controls
                              playsInline
                              preload="metadata"
                              className="aspect-video w-full object-contain"
                            />
                          </div>
                        ) : (
                          <a
                            key={item.id}
                            href={item.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group overflow-hidden rounded-xl border hairline bg-raised/60"
                          >
                            <img
                              src={item.media_url}
                              alt={event.event_name}
                              className="h-28 w-full object-cover transition group-hover:opacity-90"
                            />
                          </a>
                        )
                      )}
                    </div>
                  )
                ) : documents.length === 0 ? (
                  <p className="prose-muted rounded-xl border border-dashed border-line/20 p-6 text-center text-sm">
                    No supporting documents uploaded.
                  </p>
                ) : (
                  <ul className="max-h-85 space-y-2.5 overflow-y-auto">
                    {documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex items-center justify-between gap-3 rounded-xl border hairline bg-raised/40 p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="icon-tile h-9 w-9 rounded-lg">
                            <IconFileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">
                              {document.file_name}
                            </p>
                            <p className="text-[10px] text-muted">
                              {document.file_type || "File"}
                              {document.file_size
                                ? ` · ${(document.file_size / 1024).toFixed(0)} KB`
                                : ""}
                            </p>
                          </div>
                        </div>

                        <a
                          href={document.file_url}
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

            {/* ---- Report (post-approval only) ---- */}
            {isApproved && (
              <>
                <RidgeDivider className="divider" />

                <section className="glass overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-6 py-5">
                    <div className="flex items-center gap-3">
                      <span className="icon-tile">
                        <IconFileText />
                      </span>
                      <div>
                        <p className="eyebrow">Output</p>
                        <h2 className="h3 text-ink">Event report</h2>
                      </div>
                    </div>

                    {reportGenerated && (
                      <span
                        className="chip chip-track"
                        style={{ "--track": trackOf("approved") }}
                      >
                        <span className="dot dot-sm" />
                        Generated
                      </span>
                    )}
                  </div>

                  <div className="space-y-5 px-6 py-5">
                    <div className="field">
                      <label htmlFor="reportSocialLink">
                        Social network link
                        <span className="req">*</span>
                      </label>

                      <div className="flex flex-wrap gap-2.5">
                        <input
                          id="reportSocialLink"
                          type="url"
                          value={socialNetworkUrl}
                          onChange={(e) => setSocialNetworkUrl(e.target.value)}
                          placeholder="https://instagram.com/your-event"
                          disabled={savingSocialLink}
                          className="input min-w-0 flex-1"
                        />
                        <button
                          type="button"
                          onClick={handleSaveSocialLink}
                          disabled={savingSocialLink || !socialNetworkUrl.trim()}
                          className="btn btn-ghost btn-sm shrink-0"
                        >
                          {savingSocialLink && <span className="spin h-3.5 w-3.5" />}
                          {savingSocialLink ? "Saving…" : "Save"}
                        </button>
                      </div>

                      {!socialNetworkUrl.trim() && (
                        <p className="text-xs font-medium text-emberink">
                          Required before the report can be generated.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2.5 border-t hairline pt-5">
                      <button
                        type="button"
                        onClick={handleGenerateReport}
                        disabled={reportLoading || !socialNetworkUrl.trim()}
                        className="btn btn-brand btn-sm flex-1"
                      >
                        {reportLoading ? (
                          <span className="spin h-3.5 w-3.5" />
                        ) : (
                          <IconRefresh />
                        )}
                        {reportLoading
                          ? "Processing…"
                          : reportGenerated
                          ? "Regenerate"
                          : "Generate report"}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadReport}
                        disabled={reportLoading || !reportGenerated}
                        className="btn btn-ghost btn-sm flex-1"
                      >
                        <IconDownload />
                        Download
                      </button>
                    </div>

                    {generatedAt && (
                      <p className="num text-[11px] text-muted">
                        Last generated {formatStamp(generatedAt)}
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* ================= RIGHT: sticky decision rail ================= */}
          <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">

            {/* ---- Progress / workflow ---- */}
            <section className="glass overflow-hidden">
              <div className="border-b hairline px-6 py-5">
                <p className="eyebrow">Tracking</p>
                <h2 className="h3 mt-1 text-ink">Event progress</h2>
                <p className="prose-muted mt-0.5 text-xs">
                  Every submission, decision and remark, oldest first.
                </p>
              </div>

              <div className="px-6 py-5">
                <ProgressTimeline
                  event={event}
                  viewerId={deanProfile?.id}
                  perspective="dean"
                />

                {/* Advance or step back through the delivery stages */}
                {(nextStage || previousStage) && (
                  <div className="mt-5 flex flex-wrap gap-2.5 border-t hairline pt-5">
                    {nextStage && (
                      <button
                        type="button"
                        onClick={() => handleChangeStage(nextStage.key)}
                        disabled={stageSaving}
                        className="btn btn-brand btn-xs"
                      >
                        {stageSaving ? (
                          <span className="spin h-3.5 w-3.5" />
                        ) : (
                          <IconArrowRight />
                        )}
                        {stageSaving ? "Saving…" : nextStage.label}
                      </button>
                    )}

                    {previousStage && (
                      <button
                        type="button"
                        onClick={() => handleChangeStage(previousStage.key)}
                        disabled={stageSaving}
                        className="btn btn-ghost btn-xs"
                      >
                        <IconArrowLeft />
                        {previousStage.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ---- Rejection reason ---- */}
            {rejected && event.rejection_reason && (
              <section
                className="overflow-hidden rounded-2xl border"
                data-tint=""
                style={{ "--track": trackOf("rejected") }}
              >
                <div
                  className="flex items-center gap-2.5 border-b px-6 py-4"
                  style={{
                    borderColor: "color-mix(in srgb, var(--track) 22%, transparent)",
                  }}
                >
                  <IconAlertTriangle
                    className="h-5 w-5 shrink-0"
                    style={{ color: trackOf("rejected") }}
                  />
                  <h2 className="h3 text-base text-ink">Rejection reason</h2>
                </div>

                <p className="whitespace-pre-wrap px-6 py-5 text-sm leading-6 text-ink">
                  {event.rejection_reason}
                </p>
              </section>
            )}

            {/* ---- Decision ---- */}
            <section className="glass p-6">
              <div className="flex items-center gap-3">
                <span className="icon-tile">
                  <IconShield />
                </span>
                <div>
                  <p className="eyebrow">Decision</p>
                  <h2 className="h3 text-ink">Dean decision</h2>
                </div>
              </div>

              <p className="prose-muted mt-3 flex items-center gap-1.5 text-xs">
                Currently
                <StatusChip status={event.status} />
              </p>
              <p className="prose-muted mt-1.5 text-xs">
                You can revise a decision at any time; the teacher sees each one in their history.
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {canApproveEvent(event) && (
                  <button
                    type="button"
                    onClick={() => openDecision("approve")}
                    disabled={processing}
                    className="btn btn-ok btn-sm flex-1"
                  >
                    <IconCheck />
                    {getApproveLabel(event)}
                  </button>
                )}

                {canRejectEvent(event) && (
                  <button
                    type="button"
                    onClick={() => openDecision("reject")}
                    disabled={processing}
                    className="btn btn-danger btn-sm flex-1"
                  >
                    <IconX />
                    {getRejectLabel(event)}
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* ==================================================================
          THE DECISION
          One dialog for both halves of the decision, the same one the All
          Events table opens, so the two screens cannot drift apart.
      ================================================================== */}
      <Modal
        open={Boolean(decisionKind)}
        onClose={closeDecision}
        eyebrow="Confirm"
        title={
          decisionKind === "approve"
            ? isReapproving
              ? "Re-approve event"
              : "Approve event"
            : isRevoking
            ? "Revoke approval & reject"
            : "Reject event"
        }
        subtitle={
          decisionKind === "approve"
            ? "The teacher is notified of the decision."
            : "The teacher sees the reason you give."
        }
        footer={
          <>
            <button
              type="button"
              onClick={closeDecision}
              disabled={processing}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>

            {decisionKind === "approve" ? (
              <button
                type="button"
                onClick={confirmApprove}
                disabled={processing}
                className="btn btn-ok btn-sm"
              >
                {processing ? <span className="spin h-3.5 w-3.5" /> : <IconCheck />}
                {processing ? "Approving…" : isReapproving ? "Re-approve" : "Approve"}
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmReject}
                disabled={processing}
                className="btn btn-danger btn-sm"
              >
                {processing ? <span className="spin h-3.5 w-3.5" /> : <IconX />}
                {processing ? "Rejecting…" : isRevoking ? "Revoke & reject" : "Reject"}
              </button>
            )}
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span
            className="icon-tile icon-tile-track"
            style={{
              "--track":
                decisionKind === "approve" ? trackOf("approved") : trackOf("rejected"),
            }}
          >
            {decisionKind === "approve" ? <IconCheckCircle /> : <IconAlertTriangle />}
          </span>

          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-ink">
              {event.event_name || "Untitled Event"}
            </p>
            <p className="prose-muted mt-1 text-xs">
              {[event.event_type, formatDay(event.event_date), event.location]
                .filter(Boolean)
                .join(" · ") || "No details recorded"}
            </p>
          </div>
        </div>

        {/* What the decision actually changes, when it is not the plain case */}
        {(isRevoking || isReapproving) && (
          <div
            className="mt-4 rounded-xl border px-4 py-3"
            data-tint=""
            style={{ "--track": trackOf(isRevoking ? "rejected" : "approved") }}
          >
            <p className="text-sm text-ink">
              {isRevoking
                ? "This event is approved. Rejecting it revokes the approval, hides its generated report, and notifies the teacher."
                : "This event is rejected. Re-approving it clears the existing rejection reason and notifies the teacher."}
            </p>
          </div>
        )}

        {decisionKind === "reject" && (
          <div className="field mt-5">
            <label htmlFor="deanRejectReason">
              Reason for rejection
              <span className="req">*</span>
            </label>

            <textarea
              id="deanRejectReason"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (reasonError) setReasonError("");
              }}
              rows={4}
              autoFocus
              placeholder="What needs to change before this can be approved?"
              aria-invalid={reasonError ? "true" : undefined}
              aria-describedby={reasonError ? "deanRejectReasonError" : undefined}
              className="input"
            />

            {reasonError && (
              <p id="deanRejectReasonError" className="field-error">
                {reasonError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </DeanShell>
  );
}

export default EventDetails;
