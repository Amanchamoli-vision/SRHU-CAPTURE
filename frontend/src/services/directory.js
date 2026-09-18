/**
 * Lookup data the create-event form needs: event categories and faculty
 * coordinators. Both are lists the teacher picks from and may add to.
 */

import { apiJson } from "./api";

/**
 * The category list used to be hardcoded in three places that had already
 * drifted apart — a teacher could pick a type the Dean's filter could not
 * select. It is server data now; this is the only copy left, and it exists
 * solely so the form still works if the request fails.
 */
export const FALLBACK_EVENT_TYPES = [
  "Academic",
  "Cultural",
  "Sports",
  "Workshop",
  "Seminar",
  "Conference",
  "Celebration",
  "Other",
];

// Shared across every component that mounts at once (the wizard and the Dean
// filters), so the list is fetched once per page rather than per consumer.
let inFlight = null;

export async function listEventTypes({ force = false } = {}) {
  if (force) inFlight = null;
  if (!inFlight) {
    inFlight = apiJson("/event-types")
      .then((data) => data?.event_types || [])
      .catch((error) => {
        inFlight = null; // let the next caller retry
        throw error;
      });
  }
  return inFlight;
}

export async function createEventType(name) {
  const data = await apiJson("/event-types", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  inFlight = Promise.resolve(data?.event_types || []);
  return data;
}

export async function listFacultyCoordinators(query = "") {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const data = await apiJson(`/faculty/coordinators${search}`);
  return data?.coordinators || [];
}

export async function createFacultyCoordinator({ name, phone }) {
  const data = await apiJson("/faculty/coordinators", {
    method: "POST",
    body: JSON.stringify({ name, phone }),
  });
  return data?.coordinator || null;
}

/**
 * Names already attached to this event (PRD 10).
 * Returns a { [fileName]: boolean } map; an empty map on failure, because a
 * duplicate check that cannot run must not block the upload.
 */
export async function checkUploadNames(eventId, fileNames, kind = "media") {
  const names = (fileNames || []).filter(Boolean);
  if (!eventId || names.length === 0) return {};

  const query = names
    .map((name) => `file_name=${encodeURIComponent(name)}`)
    .join("&");

  try {
    const data = await apiJson(
      `/teacher/events/${eventId}/uploads/check-name?${query}&kind=${kind}`,
    );
    return data?.duplicates || {};
  } catch {
    return {};
  }
}
