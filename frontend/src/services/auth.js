/**
 * Authentication against the FastAPI backend (users live in MongoDB).
 *
 * This module replaces the former Supabase Auth client. Pages use:
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

  const session = writeSession(sessionFromTokenResponse(data), "SIGNED_IN");

  return { user: data.user, session };
}

/**
 * Sign out: ask the server to invalidate the token (best effort), then forget
 * it locally along with cached per-user data. Drafts are kept on purpose.
 */
export async function signOut() {
  try {
    if (getAccessToken()) {
      // refresh: false -- no point renewing a token we are about to revoke.
      await apiFetch("/auth/logout", { method: "POST", refresh: false });
    }
  } catch {
    /* offline or already invalid: clearing locally is what matters here */
  } finally {
    clearUserCaches();
    clearSession();
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
 * Returns null (and clears the session) when the token is no longer valid.
 */
export async function fetchCurrentUser() {
  if (!readSession()) return null;
  try {
    const data = await apiJson("/auth/me");
    const user = data?.user || null;
    if (user) updateSessionUser(user);
    return user;
  } catch (err) {
    if (err?.status === 401) clearSession();
    throw err;
  }
}

export function onAuthStateChange(callback) {
  return subscribe(callback);
}

// ------------------------------------------------------------------
// Email-based flows (verification + password reset over SMTP)
// ------------------------------------------------------------------

export async function register({ name, email, password }) {
  return apiJson("/auth/register", {
    method: "POST",
    auth: false,
    body: { name, email, password },
  });
}

export async function verifyEmail(token, password) {
  return apiJson("/auth/verify-email", {
    method: "POST",
    auth: false,
    body: { token, password },
  });
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

export async function resetPassword(token, newPassword) {
  return apiJson("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, new_password: newPassword },
  });
}
