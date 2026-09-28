/**
 * Authentication against the FastAPI backend (users live in MongoDB).
 *
 * Pages use:
 *   getSession()         -> { access_token, user } | null   (synchronous)
 *   fetchCurrentUser()   -> latest profile from the API, or null
 *   signIn / signOut / refreshSession / changePassword
 *   onAuthStateChange(cb) -> unsubscribe function
 */

import { apiFetch, apiJson, refreshAccessToken, sessionFromTokenResponse } from "./api";
import {
  clearSession,
  clearUserCaches,
  getAccessToken,
  readSession,
  subscribe,
  updateSessionUser,
  writeSession,
} from "./session";

export { readSession as getSession };

export function getCurrentUser() {
  return readSession()?.user || null;
}

/**
 * Sign in with email + password. Resolves to { user, session }.
 * Rejects with an ApiError carrying `status` (401 invalid, 403 unverified).
 */
export async function signIn(email, password) {
  const data = await apiJson("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });

  // A session can now end without a sign-out (browser closed, idle), which
  // never ran clearUserCaches; do it here so the next person starts clean.
  clearUserCaches();
  const session = writeSession(sessionFromTokenResponse(data), "SIGNED_IN");

  return { user: data.user, session };
}

/**
 * Sign out: forget the token here at once, along with cached per-user data
 * (drafts are kept on purpose), then ask the server to invalidate it.
 *
 * Local first, so the page is signed out in the same task that asked -- a
 * Back step onto the sign-in page then never renders a signed-in frame while
 * the server answers. The token is sent explicitly because it is no longer
 * stored by then.
 */
export async function signOut() {
  const token = getAccessToken();
  clearUserCaches();
  clearSession();
  if (!token) return;
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      auth: false,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* offline or already invalid: it expires on its own after the idle limit */
  }
}

/**
 * Change the signed-in user's password. The server revokes every existing
 * token (including this one) and hands back a fresh session for this device,
 * which is stored here; the returned user has must_change_password: false.
 */
export async function changePassword(currentPassword, newPassword) {
  const data = await apiJson("/users/me/change-password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });

  if (data?.access_token) {
    writeSession(sessionFromTokenResponse(data, data.user || null), "TOKEN_REFRESHED");
  } else if (data?.user) {
    updateSessionUser(data.user);
  } else {
    const current = readSession()?.user;
    if (current) updateSessionUser({ ...current, must_change_password: false });
  }
  return data;
}

export async function refreshSession() {
  return refreshAccessToken();
}

/**
 * Load the signed-in user's profile from the API.
 * Returns null (and clears the session) when the token is no longer valid,
 * and null when the session ended while the request was in flight.
 */
export async function fetchCurrentUser() {
  if (!readSession()) return null;
  try {
    const data = await apiJson("/auth/me");
    const user = data?.user || null;
    // Signed out, or signed in as someone else, while /auth/me was
    // answering. The profile belongs to a session that is
    // gone; handing it back would sign the page in again with no token.
    const current = readSession();
    if (!user || !current) return null;
    if (current.user?.id && current.user.id !== user.id) return null;
    updateSessionUser(user);
    return user;
  } catch (err) {
    if (err?.status === 401) clearSession();
    throw err;
  }
}

/**
 * Update the signed-in user's profile details (name, phone, department).
 */
export async function updateProfile({ name, phone, department }) {
  const data = await apiJson("/users/me", {
    method: "PATCH",
    body: { name, phone, department },
  });
  const user = data?.user || null;
  if (user) {
    updateSessionUser(user);
  }
  return data;
}

export function onAuthStateChange(callback) {
  return subscribe(callback);
}

// ------------------------------------------------------------------
// Email-based flows (verification + password reset over SMTP)
// ------------------------------------------------------------------

export async function register({ name, email, designation, password }) {
  return apiJson("/auth/register", {
    method: "POST",
    auth: false,
    body: { name, email, designation, password },
  });
}

export async function verifyEmail(token, password = null) {
  const payload = { token };
  if (password) payload.password = password;

  const data = await apiJson("/auth/verify-email", {
    method: "POST",
    auth: false,
    body: payload,
  });

  if (data?.access_token && data?.user) {
    writeSession(sessionFromTokenResponse(data), "SIGNED_IN");
  }

  return data;
}

export async function resendVerification(email) {
  return apiJson("/auth/resend-verification", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function requestPasswordReset(email) {
  return apiJson("/auth/forgot-password", { method: "POST", auth: false, body: { email } });
}

export async function acceptInvite(token, newPassword) {
  return apiJson("/auth/accept-invite", {
    method: "POST",
    auth: false,
    body: { token, new_password: newPassword },
  });
}

export async function resetPassword(token, newPassword) {
  return apiJson("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, new_password: newPassword },
  });
}
