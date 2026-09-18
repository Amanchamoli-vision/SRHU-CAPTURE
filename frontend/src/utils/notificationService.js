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

/**
 * Create a new notification for the signed-in user (client-generated, such as
 * an event-date reminder). Stored on the server when it is reachable, and kept
 * locally with a browser-minted id until it is.
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

    if (result?.notification?.id) {
      newNotif.id = result.notification.id;
      newNotif.created_at = result.notification.created_at || newNotif.created_at;
    }
  } catch (err) {
    console.warn("Insert notification DB warning (saved to local cache):", err);
  }

  const list = getLocalNotifications(userId);
  list.unshift(newNotif);
  saveLocalNotifications(userId, list);

  return newNotif;
}

/**
 * Event Date Reminder Logic
 *
 * Creates one reminder per event for the day before and one for the day
 * itself. Duplicates are ruled out against the reminders the server already
 * holds — not only against this browser's memory — so opening the portal on a
 * second device does not remind the teacher twice.
 *
 * Returns true when at least one reminder was created.
 */
export async function evaluateEventReminders(userId, events = [], existing = []) {
  if (!userId || !Array.isArray(events) || events.length === 0) return false;

  const toKey = (date) => date.toISOString().split("T")[0];
  const todayStr = toKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toKey(tomorrow);

  let sentKeys = new Set();
  try {
    const raw = localStorage.getItem(`${REMINDER_STORAGE_PREFIX}${userId}`);
    if (raw) sentKeys = new Set(JSON.parse(raw));
  } catch {
    sentKeys = new Set();
  }

  // Reminders the server already has, keyed the same way as sentKeys.
  for (const n of existing) {
    if (n.notification_type === "reminder" && n.event_id && n.data?.event_date) {
      sentKeys.add(`${n.event_id}_${n.data.event_date}_${n.data.when || ""}`);
    }
  }

  let created = false;

  for (const event of events) {
    // Only for events that are going ahead.
    if (event.status === "rejected" || event.status === "draft") continue;

    const eventDate = event.event_date || event.eventDate;
    if (!eventDate) continue;

    const when = eventDate === todayStr ? "today" : eventDate === tomorrowStr ? "tomorrow" : null;
    if (!when) continue;

    const key = `${event.id}_${eventDate}_${when}`;
    if (sentKeys.has(key)) continue;

    const venue = event.location || "Campus Venue";
    const { meta } = decodeEventMetadata(event.description || "");
    const timeStr = meta.startTime ? ` at ${meta.startTime}` : "";
    const name = event.event_name || event.eventName;

    await createTeacherNotification(userId, {
      eventId: event.id,
      notificationType: "reminder",
      title: when === "today" ? "Your event is today" : "Your event is tomorrow",
      message: `"${name}" is scheduled for ${when}${timeStr} in ${venue}.`,
      data: {
        event_name: name,
        venue,
        event_date: eventDate,
        when,
        time: meta.startTime || "",
      },
    });

    sentKeys.add(key);
    created = true;
  }

  try {
    localStorage.setItem(
      `${REMINDER_STORAGE_PREFIX}${userId}`,
      JSON.stringify(Array.from(sentKeys))
    );
  } catch (err) {
    console.error("Failed to save sent reminders:", err);
  }

  return created;
}
