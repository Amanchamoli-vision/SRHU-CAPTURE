/**
 * Authentication against the FastAPI backend (users live in MongoDB).
 *
 * This module replaces the former Supabase Auth client. Pages use:
 *   getSession()         -> { access_token, user } | null   (synchronous)
 *   fetchCurrentUser()   -> latest profile from the API, or null
 *   signIn / signOut / refreshSession
 *   onAuthStateChange(cb) -> unsubscribe function
 */

import { apiFetch, apiJson, refreshAccessToken } from "./api";
import {
  clearSession,
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

  const session = writeSession(
    {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 0) * 1000,
      user: data.user,
    },
    "SIGNED_IN"
  );

  return { user: data.user, session };
}

export async function signOut() {
  try {
    if (readSession()) {
      await apiFetch("/auth/logout", { method: "POST", retryOn401: false });
    }
  } catch {
    /* the server side is stateless; clearing locally is what matters */
  } finally {
    clearSession();
  }
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

export async function verifyEmail(token) {
  return apiJson("/auth/verify-email", { method: "POST", auth: false, body: { token } });
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
