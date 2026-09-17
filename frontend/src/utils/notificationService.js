/**
 * Notification Service & Event Reminder Engine for Campus Capture
 * Supports real-time notification fetching, read state management, and upcoming event reminders.
 */
import { supabase } from "../services/supabase";
import { decodeEventMetadata } from "./draftStorage";

const STORAGE_PREFIX = "cc_teacher_notifs_";
const REMINDER_STORAGE_PREFIX = "cc_sent_reminders_";

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

/**
 * Get cached local notifications
 */
function getLocalNotifications(userId) {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save cached local notifications
 */
function saveLocalNotifications(userId, list) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(list));
  } catch (err) {
    console.error("Failed to save local notifications:", err);
  }
}

/**
 * Fetch all notifications for the teacher
 * Queries Supabase database and gracefully merges with local cache
 */
export async function fetchTeacherNotifications(userId) {
  if (!userId) return [];

  let dbNotifications = [];
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      dbNotifications = data;
    }
  } catch (err) {
    console.warn("Notifications table query warning (fallback to local cache):", err);
  }

  const localList = getLocalNotifications(userId);

  // Merge db and local by id, avoiding duplicates
  const map = new Map();
  dbNotifications.forEach((n) => map.set(n.id, n));
  localList.forEach((n) => {
    if (!map.has(n.id)) {
      map.set(n.id, n);
    }
  });

  const merged = Array.from(map.values()).sort((a, b) => {
    const tA = new Date(a.created_at || 0).getTime();
    const tB = new Date(b.created_at || 0).getTime();
    return tB - tA;
  });

  saveLocalNotifications(userId, merged);
  return merged;
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(userId, notificationId) {
  if (!userId || !notificationId) return;

  const now = new Date().toISOString();

  // 1. Update Supabase if available
  try {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("id", notificationId)
      .eq("user_id", userId);
  } catch (err) {
    console.warn("Mark as read DB update warning:", err);
  }

  // 2. Update local cache
  const list = getLocalNotifications(userId);
  const updated = list.map((n) =>
    n.id === notificationId ? { ...n, is_read: true, read_at: now } : n
  );
  saveLocalNotifications(userId, updated);
}

/**
 * Mark all notifications as read for a teacher
 */
export async function markAllNotificationsAsRead(userId) {
  if (!userId) return;

  const now = new Date().toISOString();

  // 1. Update Supabase
  try {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("user_id", userId)
      .eq("is_read", false);
  } catch (err) {
    console.warn("Mark all read DB update warning:", err);
  }

  // 2. Update local cache
  const list = getLocalNotifications(userId);
  const updated = list.map((n) => ({ ...n, is_read: true, read_at: now }));
  saveLocalNotifications(userId, updated);
}

/**
 * Create a new notification for a teacher (client or system)
 */
export async function createTeacherNotification(userId, {
  eventId = null,
  notificationType = "approved",
  title = "",
  message = "",
  data = {},
}) {
  if (!userId) return null;

  const newNotif = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
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

  // Try saving to Supabase
  try {
    const { data: dbItem, error } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        event_id: eventId,
        notification_type: notificationType,
        title,
        message,
        data,
      })
      .select()
      .single();

    if (!error && dbItem) {
      newNotif.id = dbItem.id;
    }
  } catch (err) {
    console.warn("Insert notification DB warning (saved to local cache):", err);
  }

  // Update local cache
  const list = getLocalNotifications(userId);
  list.unshift(newNotif);
  saveLocalNotifications(userId, list.slice(0, 100));

  return newNotif;
}

/**
 * Section 9.8: Event Date Reminder Logic
 * Scans upcoming valid events and creates non-duplicate reminders for tomorrow or today
 */
export async function evaluateEventReminders(userId, events = []) {
  if (!userId || !Array.isArray(events) || events.length === 0) return;

  const todayStr = new Date().toISOString().split("T")[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Retrieve sent reminder tracking keys
  let sentKeys = new Set();
  try {
    const raw = localStorage.getItem(`${REMINDER_STORAGE_PREFIX}${userId}`);
    if (raw) sentKeys = new Set(JSON.parse(raw));
  } catch {
    sentKeys = new Set();
  }

  for (const event of events) {
    // Only remind for non-rejected, non-draft events
    if (event.status === "rejected" || event.status === "draft") continue;

    const eventDate = event.event_date || event.eventDate;
    if (!eventDate) continue;

    const isToday = eventDate === todayStr;
    const isTomorrow = eventDate === tomorrowStr;

    if (!isToday && !isTomorrow) continue;

    const reminderCycleKey = `${event.id}_${eventDate}_${isToday ? "today" : "tomorrow"}`;

    if (sentKeys.has(reminderCycleKey)) {
      continue; // Duplicate prevention
    }

    // Extract venue and start time
    const venue = event.location || "Campus Venue";
    const { meta } = decodeEventMetadata(event.description || "");
    const timeStr = meta.startTime ? ` at ${meta.startTime}` : "";

    const title = "Event Reminder";
    const timingDesc = isToday ? "scheduled for today" : "scheduled for tomorrow";
    const message = `Reminder: Your "${event.event_name || event.eventName}" event is ${timingDesc}${timeStr} in ${venue}.`;

    await createTeacherNotification(userId, {
      eventId: event.id,
      notificationType: "reminder",
      title,
      message,
      data: {
        event_name: event.event_name || event.eventName,
        venue,
        event_date: eventDate,
        time: meta.startTime || "",
      },
    });

    sentKeys.add(reminderCycleKey);
  }

  // Persist reminder sent keys
  try {
    localStorage.setItem(
      `${REMINDER_STORAGE_PREFIX}${userId}`,
      JSON.stringify(Array.from(sentKeys))
    );
  } catch (err) {
    console.error("Failed to save sent reminders:", err);
  }
}
