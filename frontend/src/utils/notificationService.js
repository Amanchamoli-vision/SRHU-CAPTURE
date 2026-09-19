/**
 * Notification Service & Event Reminder Engine for Campus Capture
 *
 * Notifications live in MongoDB behind the API and are read by every role
 * through the same role-neutral endpoints (`/notifications`): the server scopes
 * each list to the signed-in user, so a Dean receives review-queue updates and
 * a teacher receives decisions about their own events.
 *
 * A small localStorage cache keeps the bell populated while the API is
 * unreachable. Only notifications that never reached the server are kept from
 * that cache — anything the server has ever issued is taken from the server
 * alone, so a notification it deletes (say, with its event) disappears here too
 * instead of lingering in the cache forever.
 */
import { apiJson } from "../services/api";
import { decodeEventMetadata } from "./draftStorage";
import { formatTime12h, localDateKey, localDateKeyOffset } from "./dates";

const STORAGE_PREFIX = "cc_teacher_notifs_";
const REMINDER_STORAGE_PREFIX = "cc_sent_reminders_";

/** Ids minted in the browser for notifications the server has not stored. */
const LOCAL_ID_PREFIX = "notif_";
const isLocalOnly = (notification) =>
  String(notification?.id ?? "").startsWith(LOCAL_ID_PREFIX);

/**
 * Format relative time (e.g., "5m ago", "2h ago", "Yesterday")
 */
export function timeAgo(isoDate) {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getLocalNotifications(userId) {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalNotifications(userId, list) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(list.slice(0, 100)));
  } catch (err) {
    console.error("Failed to save local notifications:", err);
  }
}

const newestFirst = (a, b) =>
  new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

/**
 * All notifications for the signed-in user, newest first.
 *
 * When the server answers, its list is the truth, plus any local-only entries
 * still waiting to be stored. When it does not, the last cached list is shown.
 */
export async function fetchNotifications(userId) {
  if (!userId) return [];

  const cached = getLocalNotifications(userId);

  let server;
  try {
    const data = await apiJson("/notifications");
    server = Array.isArray(data?.notifications) ? data.notifications : [];
  } catch (err) {
    console.warn("Notifications unavailable, showing the cached list:", err);
    return cached.sort(newestFirst);
  }

  const merged = [...server, ...cached.filter(isLocalOnly)].sort(newestFirst);
  saveLocalNotifications(userId, merged);
  return merged;
}

/** @deprecated Kept for older imports; every role now uses fetchNotifications. */
export const fetchTeacherNotifications = fetchNotifications;

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(userId, notificationId) {
  if (!userId || !notificationId) return;

  const now = new Date().toISOString();

  if (!String(notificationId).startsWith(LOCAL_ID_PREFIX)) {
    try {
      await apiJson(`/notifications/${notificationId}/read`, { method: "PATCH" });
    } catch (err) {
      console.warn("Mark as read DB update warning:", err);
    }
  }

  const list = getLocalNotifications(userId);
  saveLocalNotifications(
    userId,
    list.map((n) => (n.id === notificationId ? { ...n, is_read: true, read_at: now } : n))
  );
}

/**
 * Delete one notification, for good.
 *
 * The local cache is pruned as well as the server copy. A notification that
 * has not reached the server yet (a `LOCAL_ID_PREFIX` id) only exists in that
 * cache, and `syncPendingNotifications` would re-create it on the next poll
 * if it were left behind — so removing it locally *is* the delete.
 *
 * @returns {Promise<boolean>} whether the server copy was removed
 */
export async function deleteNotification(userId, notificationId) {
  if (!userId || !notificationId) return false;

  const pruneLocal = () =>
    saveLocalNotifications(
      userId,
      getLocalNotifications(userId).filter((n) => n.id !== notificationId),
    );

  if (String(notificationId).startsWith(LOCAL_ID_PREFIX)) {
    pruneLocal();
    return true;
  }

  try {
    await apiJson(`/notifications/${notificationId}`, { method: "DELETE" });
  } catch (err) {
    // A 404 means it is already gone, which is the outcome we wanted.
    if (err?.status !== 404) {
      console.warn("Delete notification failed:", err);
      return false;
    }
  }

  pruneLocal();
  return true;
}

/**
 * Delete every notification for the signed-in user.
 *
 * @returns {Promise<{ok: boolean, deleted: number}>} `deleted` is the server's
 * own count, so the UI can report what actually happened rather than the
 * length of the list it happened to be showing.
 */
export async function clearAllNotifications(userId) {
  if (!userId) return { ok: false, deleted: 0 };

  let deleted = 0;
  try {
    const data = await apiJson("/notifications", { method: "DELETE" });
    deleted = Number(data?.deleted) || 0;
  } catch (err) {
    console.warn("Clear all notifications failed:", err);
    return { ok: false, deleted: 0 };
  }

  // Clears the pending queue too, so nothing is re-sent after the clear.
  saveLocalNotifications(userId, []);
  return { ok: true, deleted };
}

/**
 * Mark all notifications as read for the signed-in user
 */
export async function markAllNotificationsAsRead(userId) {
  if (!userId) return;

  const now = new Date().toISOString();

  try {
    await apiJson("/notifications/read-all", { method: "PATCH" });
  } catch (err) {
    console.warn("Mark all read DB update warning:", err);
  }

  const list = getLocalNotifications(userId);
  saveLocalNotifications(
    userId,
    list.map((n) => ({ ...n, is_read: true, read_at: n.read_at || now }))
  );
}

/** POST a notification. Resolves to the server's copy, or null if it was not stored. */
async function postNotification({ eventId, notificationType, title, message, data }) {
  try {
    const result = await apiJson("/notifications", {
      method: "POST",
      body: {
        event_id: eventId,
        notification_type: notificationType,
        title,
        message,
        data,
      },
    });
    return result?.notification?.id ? result.notification : null;
  } catch (err) {
    console.warn("Insert notification DB warning (kept in local cache):", err);
    return null;
  }
}

/**
 * Create a new notification for the signed-in user (client-generated, such as
 * an event-date reminder). Stored on the server when it is reachable, and kept
 * locally with a browser-minted id until it is (see syncPendingNotifications).
 *
 * The returned object has `pending: true` when the server did not store it.
 */
export async function createTeacherNotification(userId, {
  eventId = null,
  notificationType = "reminder",
  title = "",
  message = "",
  data = {},
}) {
  if (!userId) return null;

  const newNotif = {
    id: `${LOCAL_ID_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    user_id: userId,
    event_id: eventId,
    notification_type: notificationType,
    title,
    message,
    data,
    is_read: false,
    created_at: new Date().toISOString(),
    read_at: null,
  };

  const stored = await postNotification({ eventId, notificationType, title, message, data });
  if (stored) {
    newNotif.id = stored.id;
    newNotif.created_at = stored.created_at || newNotif.created_at;
  }

  const list = getLocalNotifications(userId);
  list.unshift(newNotif);
  saveLocalNotifications(userId, list);

  return { ...newNotif, pending: !stored };
}

/**
 * Retry the notifications that never reached the server (created offline).
 * Reminders for a day that has already passed are dropped instead of sent.
 * Returns the number that were stored on the server.
 */
async function syncPendingNotifications(userId, isCancelled = () => false) {
  const today = localDateKey();
  const pending = getLocalNotifications(userId).filter(isLocalOnly);
  if (pending.length === 0) return 0;

  const dropped = new Set();
  const stored = new Map(); // local id -> server copy

  for (const notif of pending) {
    if (isCancelled()) break;

    const eventDate = notif.data?.event_date;
    if (notif.notification_type === "reminder" && eventDate && eventDate < today) {
      dropped.add(notif.id);
      continue;
    }

    const serverCopy = await postNotification({
      eventId: notif.event_id,
      notificationType: notif.notification_type,
      title: notif.title,
      message: notif.message,
      data: notif.data,
    });
    // Still offline: leave the rest for the next evaluation.
    if (!serverCopy) break;
    stored.set(notif.id, serverCopy);
  }

  if (dropped.size > 0 || stored.size > 0) {
    // Re-read: the bell may have written the cache while we were waiting.
    const next = getLocalNotifications(userId)
      .filter((n) => !dropped.has(n.id))
      .map((n) => {
        const serverCopy = stored.get(n.id);
        return serverCopy
          ? { ...n, id: serverCopy.id, created_at: serverCopy.created_at || n.created_at }
          : n;
      });
    saveLocalNotifications(userId, next);
  }
  return stored.size;
}

/**
 * Event Date Reminder Logic
 *
 * Creates one reminder per event for the day before and one for the day
 * itself. Duplicates are ruled out against the reminders the server already
 * holds — not only against this browser's memory — so opening the portal on a
 * second device does not remind the teacher twice.
 *
 * A reminder only counts as sent once the server has accepted it. One created
 * offline stays in the local cache and is retried on the next evaluation.
 *
 * Only one evaluation runs at a time per page: a second call while one is in
 * flight gets the same promise, so quick navigation between pages cannot
 * create duplicates. Pass `isCancelled` to stop early (e.g. on unmount).
 *
 * Returns true when at least one reminder was created or synced.
 */
let evaluationInFlight = null;

export function evaluateEventReminders(userId, events = [], existing = [], { isCancelled } = {}) {
  if (evaluationInFlight) return evaluationInFlight;
  evaluationInFlight = runReminderEvaluation(userId, events, existing, isCancelled || (() => false))
    .finally(() => {
      evaluationInFlight = null;
    });
  return evaluationInFlight;
}

async function runReminderEvaluation(userId, events, existing, isCancelled) {
  if (!userId || !Array.isArray(events)) return false;

  let created = (await syncPendingNotifications(userId, isCancelled)) > 0;
  if (events.length === 0 || isCancelled()) return created;

  // Local calendar dates: toISOString() is UTC and would be a day behind
  // between 00:00 and 05:29 IST.
  const todayStr = localDateKey();
  const tomorrowStr = localDateKeyOffset(1);

  let sentKeys = new Set();
  try {
    const raw = localStorage.getItem(`${REMINDER_STORAGE_PREFIX}${userId}`);
    if (raw) sentKeys = new Set(JSON.parse(raw));
  } catch {
    sentKeys = new Set();
  }

  const keyOf = (n) => `${n.event_id}_${n.data.event_date}_${n.data.when || ""}`;
  const isReminder = (n) => n.notification_type === "reminder" && n.event_id && n.data?.event_date;

  // Reminders the server already has, keyed the same way as sentKeys.
  for (const n of existing) {
    if (isReminder(n) && !isLocalOnly(n)) sentKeys.add(keyOf(n));
  }

  // Reminders created offline and still waiting to be synced: do not create
  // them again, but do not mark them sent either.
  const pendingKeys = new Set(
    getLocalNotifications(userId).filter((n) => isLocalOnly(n) && isReminder(n)).map(keyOf)
  );

  const persistSentKeys = () => {
    try {
      localStorage.setItem(
        `${REMINDER_STORAGE_PREFIX}${userId}`,
        JSON.stringify(Array.from(sentKeys))
      );
    } catch (err) {
      console.error("Failed to save sent reminders:", err);
    }
  };

  for (const event of events) {
    if (isCancelled()) break;

    // Only for events that are going ahead.
    if (event.status === "rejected" || event.status === "draft") continue;

    const eventDate = event.event_date || event.eventDate;
    if (!eventDate) continue;

    const when = eventDate === todayStr ? "today" : eventDate === tomorrowStr ? "tomorrow" : null;
    if (!when) continue;

    const key = `${event.id}_${eventDate}_${when}`;
    if (sentKeys.has(key) || pendingKeys.has(key)) continue;

    const venue = event.location || "Campus Venue";
    const { meta } = decodeEventMetadata(event.description || "");
    const timeStr = meta.startTime ? ` at ${formatTime12h(meta.startTime)}` : "";
    const name = event.event_name || event.eventName;

    const notif = await createTeacherNotification(userId, {
      eventId: event.id,
      notificationType: "reminder",
      title: when === "today" ? "Your event is today" : "Your event is tomorrow",
      message: `"${name}" is scheduled for ${when}${timeStr} in ${venue}.`,
      data: {
        event_name: name,
        venue,
        event_date: eventDate,
        when,
        time: formatTime12h(meta.startTime) || "",
      },
    });

    if (!notif) continue;
    created = true;
    if (notif.pending) {
      pendingKeys.add(key);
    } else {
      sentKeys.add(key);
      persistSentKeys();
    }
  }

  persistSentKeys();
  return created;
}
