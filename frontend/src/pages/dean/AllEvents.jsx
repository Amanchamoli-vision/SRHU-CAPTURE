import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function AllEvents() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Selected date
  // Empty means all dates
  const [selectedDate, setSelectedDate] = useState("");

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
  // LOAD EVENTS
  // ============================================================

  const loadEvents = async (date = selectedDate) => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) {
        return;
      }

      let url = `${API_BASE_URL}/dean/events`;

      // Date filter
      if (date) {
        url += `?event_date=${encodeURIComponent(date)}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to load events"
        );
      }

      setEvents(data.events || []);
    } catch (err) {
      console.error("Load events error:", err);

      setError(
        err.message || "Failed to load events"
      );

      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadEvents("");
  }, []);

  // ============================================================
  // DATE CHANGE
  // ============================================================

  const handleDateChange = (event) => {
    const date = event.target.value;

    setSelectedDate(date);

    // Immediately load events for selected date
    loadEvents(date);
  };

  // ============================================================
  // CLEAR DATE FILTER
  // ============================================================

  const handleClearDate = () => {
    setSelectedDate("");

    loadEvents("");
  };

  // ============================================================
  // FORMAT SELECTED DATE
  // ============================================================

  const formatSelectedDate = (date) => {
    if (!date) {
      return "All Dates";
    }

    const dateObject = new Date(
      `${date}T00:00:00`
    );

    return dateObject.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    );
  };

  // ============================================================
  // APPROVE EVENT
  // ============================================================

  const handleApprove = async (event) => {
    const confirmed = window.confirm(
      `Are you sure you want to approve "${event.event_name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingId(event.id);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) {
        return;
      }

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
          data.detail ||
            "Failed to approve event"
        );
      }

      // Update current event locally
      setEvents((previousEvents) =>
        previousEvents.map((item) =>
          item.id === event.id
            ? data.event
            : item
        )
      );

      setSuccess(
        data.message ||
          "Event approved successfully."
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
      setProcessingId(null);
    }
  };

  // ============================================================
  // REJECT EVENT
  // ============================================================

  const handleReject = async (event) => {
    const reason = window.prompt(
      "Please enter the reason for rejecting this event:"
    );

    if (!reason || !reason.trim()) {
      return;
    }

    try {
      setProcessingId(event.id);
      setError("");
      setSuccess("");

      const session = await getSession();

      if (!session) {
        return;
      }

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

      // Update current event locally
      setEvents((previousEvents) =>
        previousEvents.map((item) =>
          item.id === event.id
            ? data.event
            : item
        )
      );

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
      setProcessingId(null);
    }
  };

  // ============================================================
  // VIEW DETAILS
  // ============================================================

  const handleViewDetails = (eventId) => {
    navigate(`/dean/events/${eventId}`);
  };

  // ============================================================
  // STATUS BADGE
  // ============================================================

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

  // ============================================================
  // EVENT COUNTS
  // ============================================================

  const eventCounts = useMemo(() => {
    return {
      total: events.length,

      pending: events.filter(
        (event) => event.status === "pending"
      ).length,

      approved: events.filter(
        (event) => event.status === "approved"
      ).length,

      rejected: events.filter(
        (event) => event.status === "rejected"
      ).length,
    };
  }, [events]);

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />

          <p className="text-sm text-slate-500">
            Loading events...
          </p>

        </div>
      </div>
    );
  }

  // ============================================================
  // MAIN UI
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ======================================================
          HEADER
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
              navigate("/dean/dashboard")
            }
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Dashboard
          </button>

        </div>

      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <main className="mx-auto max-w-7xl px-6 py-8">

        {/* Back */}

        <button
          onClick={() =>
            navigate("/dean/dashboard")
          }
          className="mb-5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Dashboard
        </button>

        {/* ====================================================
            PAGE HEADER
        ==================================================== */}

        <div className="mb-6">

          <h2 className="text-3xl font-bold text-slate-800">
            All Events
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            View and manage events submitted by teachers.
          </p>

        </div>

        {/* ====================================================
            DATE FILTER
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

            <div className="w-full lg:max-w-sm">

              <label
                htmlFor="eventDate"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Select Event Date
              </label>

              <input
                id="eventDate"
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <p className="mt-2 text-xs text-slate-500">
                Select a date to view all events scheduled on that day.
              </p>

            </div>

            <div className="flex flex-wrap gap-3">

              {selectedDate && (
                <button
                  onClick={handleClearDate}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Clear Date
                </button>
              )}

              <button
                onClick={() =>
                  loadEvents(selectedDate)
                }
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Refresh
              </button>

            </div>

          </div>

        </div>

        {/* ====================================================
            SELECTED DATE
        ==================================================== */}

        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-5">

          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Currently Viewing
              </p>

              <h3 className="mt-1 text-lg font-bold text-slate-800">
                {formatSelectedDate(
                  selectedDate
                )}
              </h3>

            </div>

            <div className="rounded-lg bg-white px-4 py-3 shadow-sm">

              <p className="text-xs text-slate-500">
                Total Events
              </p>

              <p className="text-2xl font-bold text-blue-600">
                {eventCounts.total}
              </p>

            </div>

          </div>

        </div>

        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (

          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>

        )}

        {/* ====================================================
            SUCCESS
        ==================================================== */}

        {success && (

          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>

        )}

        {/* ====================================================
            EVENT SUMMARY
        ==================================================== */}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

            <p className="text-sm text-slate-500">
              Total Events
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-800">
              {eventCounts.total}
            </p>

          </div>

          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">

            <p className="text-sm text-yellow-700">
              Pending
            </p>

            <p className="mt-2 text-3xl font-bold text-yellow-800">
              {eventCounts.pending}
            </p>

          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-5">

            <p className="text-sm text-green-700">
              Approved
            </p>

            <p className="mt-2 text-3xl font-bold text-green-800">
              {eventCounts.approved}
            </p>

          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-5">

            <p className="text-sm text-red-700">
              Rejected
            </p>

            <p className="mt-2 text-3xl font-bold text-red-800">
              {eventCounts.rejected}
            </p>

          </div>

        </div>

        {/* ====================================================
            EVENTS TABLE
        ==================================================== */}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-4">

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h3 className="font-semibold text-slate-800">
                  {selectedDate
                    ? `Events on ${formatSelectedDate(
                        selectedDate
                      )}`
                    : "All Submitted Events"}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {eventCounts.total} event
                  {eventCounts.total !== 1
                    ? "s"
                    : ""}{" "}
                  found
                </p>

              </div>

            </div>

          </div>

          {events.length === 0 ? (

            <div className="p-12 text-center">

              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">

                <span className="text-2xl">
                  📅
                </span>

              </div>

              <h3 className="text-lg font-semibold text-slate-800">
                No events found
              </h3>

              <p className="mt-2 text-sm text-slate-500">

                {selectedDate
                  ? `There are no events scheduled on ${formatSelectedDate(
                      selectedDate
                    )}.`
                  : "No events have been submitted yet."}

              </p>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="min-w-full divide-y divide-slate-200">

                <thead className="bg-slate-50">

                  <tr>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Event
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Date
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Type
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Location
                    </th>

                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>

                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Action
                    </th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-200 bg-white">

                  {events.map((event) => (

                    <tr
                      key={event.id}
                      className="transition hover:bg-slate-50"
                    >

                      {/* Event */}

                      <td className="px-6 py-4">

                        <button
                          onClick={() =>
                            handleViewDetails(
                              event.id
                            )
                          }
                          className="text-left"
                        >

                          <p className="font-semibold text-slate-800 hover:text-blue-600">
                            {event.event_name}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Click to view full details
                          </p>

                        </button>

                      </td>

                      {/* Date */}

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">

                        {event.event_date}

                      </td>

                      {/* Type */}

                      <td className="px-6 py-4 text-sm text-slate-700">

                        {event.event_type}

                      </td>

                      {/* Location */}

                      <td className="px-6 py-4 text-sm text-slate-700">

                        {event.location}

                      </td>

                      {/* Status */}

                      <td className="px-6 py-4">

                        {getStatusBadge(
                          event.status
                        )}

                      </td>

                      {/* Action */}

                      <td className="px-6 py-4">

                        <div className="flex items-center justify-end gap-2">

                          <button
                            onClick={() =>
                              handleViewDetails(
                                event.id
                              )
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            View Details
                          </button>

                          {event.status ===
                            "pending" && (

                            <>

                              <button
                                onClick={() =>
                                  handleReject(
                                    event
                                  )
                                }
                                disabled={
                                  processingId ===
                                  event.id
                                }
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {processingId ===
                                event.id
                                  ? "..."
                                  : "Reject"}
                              </button>

                              <button
                                onClick={() =>
                                  handleApprove(
                                    event
                                  )
                                }
                                disabled={
                                  processingId ===
                                  event.id
                                }
                                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {processingId ===
                                event.id
                                  ? "..."
                                  : "Approve"}
                              </button>

                            </>

                          )}

                        </div>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </main>

    </div>
  );
}

export default AllEvents;