import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";

function AllEvents() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingEventId, setProcessingEventId] =
    useState(null);

  // =========================
  // LOAD ALL EVENTS
  // =========================

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate("/login");
        return;
      }

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
          data.detail || "Failed to fetch events"
        );
      }

      setEvents(data.events || []);
    } catch (err) {
      console.error("Load events error:", err);

      setError(
        err.message || "Failed to load events"
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // INITIAL LOAD
  // =========================

  useEffect(() => {
    loadEvents();
  }, []);

  // =========================
  // LOGOUT
  // =========================

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // =========================
  // STATUS BADGE
  // =========================

  const getStatusBadge = (status) => {
    if (status === "approved") {
      return (
        <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Approved
        </span>
      );
    }

    if (status === "rejected") {
      return (
        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
          Rejected
        </span>
      );
    }

    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
        Pending
      </span>
    );
  };

  // =========================
  // APPROVE EVENT
  // =========================

  const handleApprove = async (eventId) => {
    const confirmed = window.confirm(
      "Are you sure you want to approve this event?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingEventId(eventId);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${eventId}/approve`,
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

      await loadEvents();
    } catch (err) {
      console.error("Approve event error:", err);

      setError(
        err.message || "Failed to approve event"
      );
    } finally {
      setProcessingEventId(null);
    }
  };

  // =========================
  // REJECT EVENT
  // =========================

  const handleReject = async (eventId) => {
    const reason = window.prompt(
      "Please enter the reason for rejecting this event:"
    );

    if (!reason || !reason.trim()) {
      return;
    }

    try {
      setProcessingEventId(eventId);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/dean/events/${eventId}/reject?rejection_reason=${encodeURIComponent(
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
          data.detail || "Failed to reject event"
        );
      }

      await loadEvents();
    } catch (err) {
      console.error("Reject event error:", err);

      setError(
        err.message || "Failed to reject event"
      );
    } finally {
      setProcessingEventId(null);
    }
  };

  // =========================
  // OPEN EVENT DETAILS
  // =========================

  const handleViewDetails = (eventId) => {
    navigate(`/dean/events/${eventId}`);
  };

  // =========================
  // UI
  // =========================

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ================= NAVBAR ================= */}

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
            onClick={handleLogout}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Logout
          </button>

        </div>
      </header>

      {/* ================= MAIN ================= */}

      <main className="mx-auto max-w-7xl px-6 py-8">

        {/* PAGE HEADER */}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              All Events
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Review and manage submitted events.
            </p>
          </div>

          <button
            onClick={loadEvents}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

        </div>

        {/* ================= ERROR ================= */}

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ================= LOADING ================= */}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">

            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />

            <p className="text-sm text-slate-500">
              Loading events...
            </p>

          </div>
        ) : events.length === 0 ? (

          /* ================= NO EVENTS ================= */

          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">

            <h3 className="text-lg font-semibold text-slate-800">
              No events found
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              No events have been submitted yet.
            </p>

          </div>

        ) : (

          /* ================= EVENTS TABLE ================= */

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

            <div className="overflow-x-auto">

              <table className="w-full min-w-[1100px]">

                {/* TABLE HEADER */}

                <thead className="border-b border-slate-200 bg-slate-50">

                  <tr>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Event
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Date
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Type
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Location
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Action
                    </th>

                  </tr>

                </thead>

                {/* TABLE BODY */}

                <tbody className="divide-y divide-slate-100">

                  {events.map((event) => {

                    const isProcessing =
                      processingEventId === event.id;

                    return (
                      <tr
                        key={event.id}
                        className="transition hover:bg-slate-50"
                      >

                        {/* EVENT */}

                        <td className="px-6 py-4">

                          <button
                            onClick={() =>
                              handleViewDetails(event.id)
                            }
                            className="text-left"
                          >

                            <p className="font-medium text-slate-800 transition hover:text-blue-600">
                              {event.event_name}
                            </p>

                            {event.description && (
                              <p className="mt-1 max-w-xs truncate text-xs text-slate-400">
                                {event.description}
                              </p>
                            )}

                            <p className="mt-1 text-xs text-blue-500">
                              View details →
                            </p>

                          </button>

                        </td>

                        {/* DATE */}

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {event.event_date}
                        </td>

                        {/* TYPE */}

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {event.event_type}
                        </td>

                        {/* LOCATION */}

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {event.location}
                        </td>

                        {/* STATUS */}

                        <td className="px-6 py-4">
                          {getStatusBadge(event.status)}
                        </td>

                        {/* ACTION */}

                        <td className="px-6 py-4 text-right">

                          {event.status === "pending" ? (

                            <div className="flex justify-end gap-2">

                              <button
                                onClick={() =>
                                  handleApprove(event.id)
                                }
                                disabled={isProcessing}
                                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isProcessing
                                  ? "Processing..."
                                  : "Approve"}
                              </button>

                              <button
                                onClick={() =>
                                  handleReject(event.id)
                                }
                                disabled={isProcessing}
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isProcessing
                                  ? "Processing..."
                                  : "Reject"}
                              </button>

                            </div>

                          ) : (

                            <span className="text-xs text-slate-400">
                              No action
                            </span>

                          )}

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>

          </div>

        )}

      </main>

    </div>
  );
}

export default AllEvents;