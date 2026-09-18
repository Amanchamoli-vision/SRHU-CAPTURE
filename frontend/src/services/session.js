/**
 * Browser-side session storage for the API-issued login token.
 *
 * The token is a JWT signed by the FastAPI backend (MongoDB holds the users).
 * It is kept in localStorage so a page refresh keeps the user signed in, and a
 * small subscription mechanism lets the AuthContext react to changes made in
 * this tab or another one.
 */

export const SESSION_STORAGE_KEY = "cc_auth_session";

const listeners = new Set();

function emit(event, session) {
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
 * Shape: { access_token, expires_at, user }
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
  window.addEventListener("storage", (e) => {
    if (e.key !== SESSION_STORAGE_KEY) return;
    const session = readSession();
    emit(session ? "SIGNED_IN" : "SIGNED_OUT", session);
  });
}
