/**
 * Browser-side session storage for the API-issued login token.
 *
 * The token is a JWT signed by the FastAPI backend (MongoDB holds the users).
 * It is kept in localStorage so a page refresh keeps the user signed in, and a
 * small subscription mechanism lets the AuthContext react to changes made in
 * this tab or another one.
 *
 * Known limitation: a token in localStorage is readable by any script running
 * on the page, so an XSS bug would expose it. Moving to an httpOnly cookie
 * needs backend support (cookie issuance + CSRF protection) and is out of scope
 * for now. The server can revoke tokens (logout, password change), which limits
 * the damage of a leaked one.
 */

export const SESSION_STORAGE_KEY = "cc_auth_session";

/**
 * Per-user caches that must not outlive a sign-out on a shared machine.
 * Drafts (cc_teacher_drafts_*) are deliberately NOT listed: they are the
 * teacher's unsaved work, keyed by user id, and only readable by that user.
 */
const USER_CACHE_PREFIXES = ["cc_teacher_notifs_", "cc_sent_reminders_"];

const listeners = new Set();

/** The user id this tab is currently running as (for cross-tab checks). */
let tabUserId = null;

function emit(event, session) {
  tabUserId = session?.user?.id ?? null;
  for (const listener of listeners) {
    try {
      listener(event, session);
    } catch (err) {
      console.error("Auth listener error:", err);
    }
  }
}

function isExpired(session) {
  return Boolean(session?.expires_at) && Date.now() >= session.expires_at;
}

/**
 * Read the stored session, or null when there is none or it has expired.
 * Shape: { access_token, expires_at, issued_at, user }
 *
 * An expired session is removed and SIGNED_OUT is announced, so the
 * AuthContext drops the user and protected pages send them to /login instead
 * of rendering and then failing every request.
 */
export function readSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token) return null;
    if (isExpired(session)) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      // readSession can run during a React render; announce it afterwards so
      // listeners do not set state in the middle of another component's render.
      setTimeout(() => emit("SIGNED_OUT", null), 0);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function writeSession(session, event = "SIGNED_IN") {
  if (typeof window === "undefined") return session;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("Failed to persist session:", err);
  }
  emit(event, session);
  return session;
}

export function updateSessionUser(user) {
  const current = readSession();
  if (!current) return null;
  return writeSession({ ...current, user }, "USER_UPDATED");
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  emit("SIGNED_OUT", null);
}

/**
 * Remove cached notification/reminder data for every user on this browser.
 * Called on sign-out; drafts are kept (see USER_CACHE_PREFIXES).
 */
export function clearUserCaches() {
  if (typeof window === "undefined") return;
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && USER_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

export function getAccessToken() {
  return readSession()?.access_token || null;
}

/**
 * Subscribe to session changes. Returns an unsubscribe function.
 * Events: SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, SIGNED_OUT
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Keep tabs in sync: a login or logout in one tab is mirrored in the others.
if (typeof window !== "undefined") {
  tabUserId = readSession()?.user?.id ?? null;

  window.addEventListener("storage", (e) => {
    if (e.key !== SESSION_STORAGE_KEY && e.key !== null) return;
    const session = readSession();
    const nextUserId = session?.user?.id ?? null;

    // Another tab signed in as a different person. Swapping the user under an
    // open page would save drafts as one user while API calls run as another,
    // so reload from a clean state instead.
    if (tabUserId && nextUserId && nextUserId !== tabUserId) {
      window.location.assign("/login");
      return;
    }

    if (!session) {
      emit("SIGNED_OUT", null);
    } else {
      emit(tabUserId ? "TOKEN_REFRESHED" : "SIGNED_IN", session);
    }
  });
}
