import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../services/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);

  const [socialNetworkUrl, setSocialNetworkUrl] = useState("");
  const [savingSocialLink, setSavingSocialLink] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ============================================================
  // GET SESSION
  // ============================================================

  const getSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

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

      const response = await fetch(
        `${API_BASE_URL}/dean/events`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to load event"
        );
      }

      const foundEvent = (data.events || []).find(
        (item) => item.id === eventId
      );

      if (!foundEvent) {
        throw new Error("Event not found");
      }

      setEvent(foundEvent);

      setSocialNetworkUrl(
        foundEvent.social_network_url || ""
      );

      await loadMedia(
        eventId,
        session.access_token
      );

      await loadDocuments(
        eventId,
        session.access_token
      );

      await loadReportStatus(
        eventId,
        session.access_token
      );
    } catch (err) {
      console.error("Load event error:", err);

      setError(
        err.message || "Failed to load event details"
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOAD MEDIA
  // ============================================================

  const loadMedia = async (id, accessToken) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/dean/events/${id}/media`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

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
      const response = await fetch(
        `${API_BASE_URL}/dean/events/${id}/documents`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

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

  const loadReportStatus = async (
    id,
    accessToken
  ) => {
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

      setReportGenerated(
        Boolean(data.report_generated)
      );

      setGeneratedAt(
        data.generated_at || null
      );

      if (data.social_network_url) {
        setSocialNetworkUrl(
          data.social_network_url
        );
      }
    } catch (err) {
      console.error(
        "Load report status error:",
        err
      );
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  // ============================================================
  // APPROVE EVENT
  // ============================================================

  const handleApprove = async () => {
    if (!event) return;

    const confirmed = window.confirm(
      `Are you sure you want to approve "${event.event_name}"?`
    );

    if (!confirmed) return;

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
        throw new Error(
          data.detail || "Failed to approve event"
        );
      }

      setEvent(data.event);

      setSuccess(
        data.message ||
          "Event approved successfully."
      );

      // Refresh report status after approval
      await loadReportStatus(
        event.id,
        session.access_token
      );
    } catch (err) {
      console.error(
        "Approve event error:",
        err
      );

      setError(
        err.message ||
          "Failed to approve event"
      );
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // REJECT EVENT
  // ============================================================

  const handleReject = async () => {
    if (!event) return;

    const reason = window.prompt(
      "Please enter the reason for rejecting this event:"
    );

    if (!reason || !reason.trim()) {
      return;
    }

    try {
      setProcessing(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) return;

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${event.id}/reject?rejection_reason=${encodeURIComponent(
          reason.trim()
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
        throw new Error(
          data.detail ||
            "Failed to reject event"
        );
      }

      setEvent(data.event);

      setSuccess(
        data.message ||
          "Event rejected successfully."
      );
    } catch (err) {
      console.error(
        "Reject event error:",
        err
      );

      setError(
        err.message ||
          "Failed to reject event"
      );
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // SAVE SOCIAL NETWORK LINK
  // ============================================================

  const handleSaveSocialLink = async () => {
    if (!event) return;

    if (!socialNetworkUrl.trim()) {
      setError(
        "Please enter a Social Network Link."
      );
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
            social_network_url:
              socialNetworkUrl.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Failed to save Social Network Link"
        );
      }

      setSocialNetworkUrl(
        data.social_network_url
      );

      setEvent((previous) => ({
        ...previous,
        social_network_url:
          data.social_network_url,
      }));

      // Existing report becomes invalid
      // because social link changed.
      setReportGenerated(false);
      setGeneratedAt(null);

      setSuccess(
        "Social Network Link saved successfully."
      );
    } catch (err) {
      console.error(
        "Save social link error:",
        err
      );

      setError(
        err.message ||
          "Failed to save Social Network Link"
      );
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
      setError(
        "Report can only be generated for an approved event."
      );
      return;
    }

    if (!socialNetworkUrl.trim()) {
      setError(
        "Social Network Link is required before generating the report."
      );
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
        throw new Error(
          data.detail ||
            "Failed to generate report"
        );
      }

      setReportGenerated(true);

      setGeneratedAt(
        data.generated_at || null
      );

      setSuccess(
        data.message ||
          "Report generated successfully."
      );
    } catch (err) {
      console.error(
        "Generate report error:",
        err
      );

      setError(
        err.message ||
          "Failed to generate report"
      );
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
        let message =
          "Failed to download report";

        try {
          const data =
            await response.json();

          message =
            data.detail || message;
        } catch {
          // Ignore JSON parsing error
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      const downloadUrl =
        window.URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = downloadUrl;

      link.download =
        `${event.event_name
          .replace(/[^a-z0-9]/gi, "_")
          .replace(/_+/g, "_")}_Report.pdf`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      window.URL.revokeObjectURL(
        downloadUrl
      );

      setSuccess(
        "Report downloaded successfully."
      );
    } catch (err) {
      console.error(
        "Download report error:",
        err
      );

      setError(
        err.message ||
          "Failed to download report"
      );
    } finally {
      setReportLoading(false);
    }
  };

  // ============================================================
  // STATUS BADGE
  // ============================================================

  const getStatusBadge = (status) => {
    if (status === "approved") {
      return (
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Approved
        </span>
      );
    }

    if (status === "rejected") {
      return (
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
          Rejected
        </span>
      );
    }

    return (
      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
        Pending
      </span>
    );
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />

          <p className="text-sm text-slate-500">
            Loading event details...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // ERROR / NOT FOUND
  // ============================================================

  if (error && !event) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center justify-between px-6">
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                Campus Capture
              </h1>

              <p className="text-sm text-slate-500">
                Dean Panel
              </p>
            </div>

            <button
              onClick={() =>
                navigate("/dean/events")
              }
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Back to Events
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-10">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <h2 className="text-lg font-semibold text-red-800">
              Unable to load event
            </h2>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ============================================================
  // MAIN UI
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ======================================================
          NAVBAR
      ====================================================== */}

      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-6">

          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Campus Capture
            </h1>

            <p className="text-sm text-slate-500">
              Dean Panel
            </p>
          </div>

          <button
            onClick={() =>
              navigate("/dean/events")
            }
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Back to Events
          </button>
        </div>
      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto max-w-5xl px-6 py-8">

        {/* Back */}

        <button
          onClick={() =>
            navigate("/dean/events")
          }
          className="mb-5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to All Events
        </button>

        {/* Error */}

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Success */}

        {success && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* ====================================================
            EVENT HEADER
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

            <div>
              <p className="mb-2 text-sm font-medium text-blue-600">
                Event Details
              </p>

              <h2 className="text-3xl font-bold text-slate-800">
                {event.event_name}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Submitted event information
              </p>
            </div>

            <div>
              {getStatusBadge(
                event.status
              )}
            </div>

          </div>
        </div>

        {/* ====================================================
            EVENT INFORMATION
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="font-semibold text-slate-800">
              Event Information
            </h3>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">

            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Event Name
              </p>

              <p className="mt-1 text-sm font-medium text-slate-800">
                {event.event_name}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Event Date
              </p>

              <p className="mt-1 text-sm text-slate-700">
                {event.event_date}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Event Type
              </p>

              <p className="mt-1 text-sm text-slate-700">
                {event.event_type}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Location
              </p>

              <p className="mt-1 text-sm text-slate-700">
                {event.location}
              </p>
            </div>

            <div className="md:col-span-2">

              <p className="text-xs font-semibold uppercase text-slate-400">
                Description
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {event.description ||
                  "No description provided."}
              </p>

            </div>

            <div className="md:col-span-2">

              <p className="text-xs font-semibold uppercase text-slate-400">
                Teacher ID
              </p>

              <p className="mt-1 break-all text-sm text-slate-700">
                {event.teacher_id}
              </p>

            </div>

            {/* Social Network Link */}

            <div className="md:col-span-2">

              <p className="text-xs font-semibold uppercase text-slate-400">
                Social Network Link
              </p>

              {event.social_network_url ? (
                <a
                  href={
                    event.social_network_url
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {event.social_network_url}
                </a>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Not provided
                </p>
              )}

            </div>

          </div>
        </div>

        {/* ====================================================
            REJECTION REASON
        ==================================================== */}

        {event.status === "rejected" &&
          event.rejection_reason && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-6">

              <h3 className="font-semibold text-red-800">
                Rejection Reason
              </h3>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-700">
                {event.rejection_reason}
              </p>

            </div>
          )}

        {/* ====================================================
            MEDIA
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-4">

            <h3 className="font-semibold text-slate-800">
              Event Media
            </h3>

          </div>

          <div className="p-6">

            {media.length === 0 ? (

              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">

                <p className="text-sm text-slate-500">
                  No media uploaded for this event.
                </p>

              </div>

            ) : (

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

                {media.map((item) => (

                  <div
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  >

                    {item.media_type ===
                    "image" ? (

                      <img
                        src={item.media_url}
                        alt={event.event_name}
                        className="h-52 w-full object-cover"
                      />

                    ) : (

                      <video
                        src={item.media_url}
                        controls
                        className="h-52 w-full object-cover"
                      />

                    )}

                  </div>

                ))}

              </div>

            )}

          </div>
        </div>

        {/* ====================================================
            DOCUMENTS
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-4">

            <h3 className="font-semibold text-slate-800">
              Supporting Documents
            </h3>

          </div>

          <div className="p-6">

            {documents.length === 0 ? (

              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">

                <p className="text-sm text-slate-500">
                  No supporting documents uploaded.
                </p>

              </div>

            ) : (

              <div className="space-y-3">

                {documents.map((document) => (

                  <div
                    key={document.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >

                    <div>

                      <p className="text-sm font-medium text-slate-800">
                        {document.file_name}
                      </p>

                      {document.file_type && (
                        <p className="mt-1 text-xs text-slate-500">
                          {document.file_type}
                        </p>
                      )}

                    </div>

                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      View / Download
                    </a>

                  </div>

                ))}

              </div>

            )}

          </div>
        </div>

        {/* ====================================================
            DEAN DECISION
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <h3 className="font-semibold text-slate-800">
                Dean Decision
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Review this event and update its approval status.
              </p>

            </div>

            {event.status === "pending" && (

              <div className="flex gap-3">

                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing
                    ? "Processing..."
                    : "Reject"}
                </button>

                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing
                    ? "Processing..."
                    : "Approve"}
                </button>

              </div>

            )}

            {event.status === "approved" && (

              <span className="rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                Event Approved
              </span>

            )}

            {event.status === "rejected" && (

              <span className="rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
                Event Rejected
              </span>

            )}

          </div>
        </div>

        {/* ====================================================
            REPORT SECTION
        ==================================================== */}

        {event.status === "approved" && (

          <div className="mb-8 rounded-xl border border-blue-200 bg-white shadow-sm">

            {/* Report Header */}

            <div className="border-b border-blue-100 bg-blue-50 px-6 py-5">

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h3 className="text-lg font-bold text-slate-800">
                    Event Report
                  </h3>

                  <p className="mt-1 text-sm text-slate-600">
                    Generate and download the official event report.
                  </p>

                </div>

                {reportGenerated && (

                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                    Report Generated
                  </span>

                )}

              </div>

            </div>

            <div className="space-y-6 p-6">

              {/* =================================================
                  SOCIAL LINK STATUS
              ================================================= */}

              <div>

                <label
                  htmlFor="reportSocialLink"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Social Network Link
                </label>

                <p className="mt-1 text-xs text-slate-500">
                  This link will be included automatically in the report.
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">

                  <input
                    id="reportSocialLink"
                    type="url"
                    value={socialNetworkUrl}
                    onChange={(e) =>
                      setSocialNetworkUrl(
                        e.target.value
                      )
                    }
                    placeholder="https://instagram.com/your-event"
                    disabled={savingSocialLink}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />

                  <button
                    onClick={
                      handleSaveSocialLink
                    }
                    disabled={
                      savingSocialLink ||
                      !socialNetworkUrl.trim()
                    }
                    className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingSocialLink
                      ? "Saving..."
                      : "Save Link"}
                  </button>

                </div>

                {!socialNetworkUrl.trim() && (

                  <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">

                    <p className="text-sm font-medium text-yellow-800">
                      Social Network Link is required before generating the report.
                    </p>

                  </div>

                )}

                {socialNetworkUrl.trim() && (

                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">

                    <p className="text-sm font-medium text-green-800">
                      Social Network Link is available.
                    </p>

                  </div>

                )}

              </div>

              {/* =================================================
                  REPORT ACTIONS
              ================================================= */}

              <div className="border-t border-slate-200 pt-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                  <div>

                    <h4 className="font-semibold text-slate-800">
                      Report Actions
                    </h4>

                    <p className="mt-1 text-sm text-slate-500">
                      The report is generated automatically from the approved event information.
                    </p>

                    {generatedAt && (

                      <p className="mt-2 text-xs text-slate-400">
                        Last generated:{" "}
                        {new Date(
                          generatedAt
                        ).toLocaleString()}
                      </p>

                    )}

                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">

                    {/* Generate */}

                    <button
                      onClick={
                        handleGenerateReport
                      }
                      disabled={
                        reportLoading ||
                        !socialNetworkUrl.trim()
                      }
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {reportLoading
                        ? "Processing..."
                        : reportGenerated
                        ? "Regenerate Report"
                        : "Generate Report"}
                    </button>

                    {/* Download */}

                    <button
                      onClick={
                        handleDownloadReport
                      }
                      disabled={
                        reportLoading ||
                        !reportGenerated
                      }
                      className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Download Report
                    </button>

                  </div>

                </div>

              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default EventDetails;