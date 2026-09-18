import {
  clearSession,
  getAccessToken,
  readSession,
  writeSession,
} from "./session";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();

/**
 * Set when the build has no usable API URL. main.jsx shows this on a readable
 * error screen instead of letting the import throw (a blank white page).
 */
export const API_CONFIG_ERROR = configuredApiBaseUrl
  ? null
  : "This build of Campus Capture has no server address configured. " +
    "Set VITE_API_BASE_URL to the public FastAPI API URL and rebuild the site.";

const isLoopbackHost = (hostname) => hostname === "localhost" || hostname === "127.0.0.1";

const resolveApiBaseUrl = () => {
  const url = configuredApiBaseUrl.replace(/\/+$/, "");
  if (!url) return "";

  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const currentHost =
    typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "";

  if (!isLoopbackHost(parsed.hostname) || !currentHost || isLoopbackHost(currentHost)) {
    return url;
  }

  if (import.meta.env.DEV) {
    // Dev server opened from another device on the LAN (192.168.x.x etc.):
    // map localhost/127.0.0.1 to this page's host so that device can reach the
    // backend. The backend must then listen on 0.0.0.0 (python run.py does).
    parsed.hostname = currentHost;
    return parsed.origin;
  }

  // A production build baked in a loopback URL. Rewriting it would hide the
  // misconfiguration; say so loudly and use it as configured.
  console.error(
    `VITE_API_BASE_URL points to ${url}, which only works on the developer's machine. ` +
      "Set it to the public API URL in the hosting environment and rebuild."
  );
  return url;
};

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Error thrown by apiJson for non-2xx responses, and by apiFetch when the
 * server cannot be reached at all (status 0). `status` carries the HTTP
 * status code and `detail` the backend's message.
 */
export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export const UNREACHABLE_MESSAGE =
  `Cannot reach the Campus Capture server at ${API_BASE_URL || "(not configured)"}. ` +
  "Make sure the backend is running and reachable from this device.";

const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please login again.";

const toUrl = (path) =>
  /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

/**
 * fetch() that turns a network failure ("Failed to fetch", connection refused,
 * DNS, CORS block) into an ApiError with a message a user can act on.
 * An aborted request is re-thrown as-is (err.name === "AbortError").
 */
async function networkFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(UNREACHABLE_MESSAGE, 0, err?.message || String(err));
  }
}

/** Pull a readable message out of a parsed FastAPI error body. */
function detailFromBody(body, fallback) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail) && body.detail.length > 0) {
    // FastAPI validation errors (422): a list of {loc, msg, type}
    const messages = body.detail
      .map((item) => (typeof item?.msg === "string" ? item.msg.replace(/^Value error, /, "") : ""))
      .filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

async function readErrorDetail(response, fallback) {
  try {
    return detailFromBody(await response.json(), fallback);
  } catch {
    /* non-JSON body */
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Proactive token refresh                                             */
/* ------------------------------------------------------------------ */

const REFRESH_WITHIN_MS = 24 * 60 * 60 * 1000; // refresh in the last 24h
const REFRESH_RETRY_BACKOFF_MS = 60 * 1000; // after a failed (non-401) attempt
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;

let refreshPromise = null;
let lastRefreshFailureAt = 0;
// A token the server declined to renew (e.g. the 30-day absolute session
// limit). It stays usable until it expires or a request gets a 401.
let refreshDeclinedFor = null;

/** A session is due for refresh within 24h of expiry, or past half its lifetime. */
function isRefreshDue(session) {
  if (!session?.access_token || !session.expires_at) return false;
  const now = Date.now();
  const remaining = session.expires_at - now;
  if (remaining <= REFRESH_WITHIN_MS) return true;
  if (session.issued_at && session.expires_at > session.issued_at) {
    const lifetime = session.expires_at - session.issued_at;
    return now - session.issued_at >= lifetime / 2;
  }
  return false;
}

/** Build the stored session from a login/refresh response. */
export function sessionFromTokenResponse(data, fallbackUser = null) {
  const now = Date.now();
  return {
    access_token: data.access_token,
    issued_at: now,
    expires_at: now + (data.expires_in || 0) * 1000,
    user: data.user || fallbackUser,
  };
}

/**
 * Ask the backend for a fresh token using the current, still-valid one.
 * Single-flight: concurrent callers share one request.
 * Resolves to the new session, or null when it could not be refreshed.
 * A 401 here does not sign the user out by itself: the server may refuse to
 * renew a token that is still valid (absolute session limit). The next real
 * request decides -- if the token is revoked it gets a 401 and is cleared.
 */
export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const token = getAccessToken();
  if (!token) return Promise.resolve(null);

  refreshPromise = (async () => {
    try {
      const response = await fetch(toUrl("/auth/refresh"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 403) {
        refreshDeclinedFor = token;
        return null;
      }
      if (!response.ok) {
        lastRefreshFailureAt = Date.now();
        return null;
      }

      const data = await response.json();
      if (!data?.access_token) {
        lastRefreshFailureAt = Date.now();
        return null;
      }
      lastRefreshFailureAt = 0;
      // Signed out (or signed in as someone else) while this was in flight:
      // do not bring the old session back.
      if (getAccessToken() !== token) return readSession();
      return writeSession(
        sessionFromTokenResponse(data, readSession()?.user || null),
        "TOKEN_REFRESHED"
      );
    } catch {
      lastRefreshFailureAt = Date.now();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Refresh the token if it is close to expiry. Cheap when nothing is due, so it
 * runs before every authenticated request. Never throws.
 */
export async function ensureFreshToken() {
  const session = readSession();
  if (!isRefreshDue(session)) return;
  if (session.access_token === refreshDeclinedFor) return;
  if (refreshPromise) {
    await refreshPromise;
    return;
  }
  if (Date.now() - lastRefreshFailureAt < REFRESH_RETRY_BACKOFF_MS) return;
  await refreshAccessToken();
}

/**
 * Keep the session fresh while the app is open: check on an interval and
 * whenever the tab becomes visible again. Returns a stop function.
 */
export function startSessionKeepAlive() {
  if (typeof window === "undefined") return () => {};
  const check = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    ensureFreshToken();
  };
  const interval = setInterval(check, KEEPALIVE_INTERVAL_MS);
  document.addEventListener("visibilitychange", check);
  check();
  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", check);
  };
}

/**
 * A 401 on an authenticated request means the server no longer accepts the
 * token (expired, signed out elsewhere, password changed). Drop the session;
 * SIGNED_OUT makes the AuthContext forget the user and ProtectedRoute sends
 * them to /login.
 */
function handleUnauthorized(tokenUsed) {
  const current = getAccessToken();
  // If another tab already put a different token in place, keep it.
  if (!current || current === tokenUsed || !tokenUsed) clearSession();
}

/**
 * fetch() with the login token attached.
 *
 * - `body` may be a plain object (sent as JSON) or FormData (sent as-is).
 * - The token is refreshed beforehand when it is close to expiry.
 * - A 401 on an authenticated request clears the session (back to /login).
 * - Throws ApiError(status 0) when the server cannot be reached.
 * - Pass `signal` (an AbortSignal) to cancel; an aborted call rejects with
 *   an AbortError.
 */
export async function apiFetch(path, options = {}) {
  const { auth = true, body, headers = {}, refresh = true, ...rest } = options;

  if (auth && refresh) await ensureFreshToken();

  const finalHeaders = { ...headers };
  let finalBody = body;

  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    if (typeof body !== "string") finalBody = JSON.stringify(body);
    if (!finalHeaders["Content-Type"]) finalHeaders["Content-Type"] = "application/json";
  }

  const token = auth ? getAccessToken() : null;
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const response = await networkFetch(toUrl(path), {
    ...rest,
    headers: finalHeaders,
    body: finalBody,
  });

  if (auth && response.status === 401) handleUnauthorized(token);

  return response;
}

/**
 * apiJson's error for a failed Response: ApiError with the backend's detail.
 * Exported for pages that use apiFetch directly (e.g. file downloads).
 */
export async function errorFromResponse(response, fallback) {
  const detail = await readErrorDetail(
    response,
    response.status === 401
      ? SESSION_EXPIRED_MESSAGE
      : fallback || `Request failed (${response.status})`
  );
  return new ApiError(detail, response.status, detail);
}

/**
 * apiFetch + JSON parsing. Throws ApiError for non-2xx responses.
 */
export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(
      `The server sent an unexpected response (${response.status}).`,
      response.status,
      null
    );
  }
}

/** True for the error an aborted apiFetch/apiJson/apiUpload call rejects with. */
export function isAbortError(err) {
  return err?.name === "AbortError" || (err instanceof ApiError && err.detail === "aborted");
}

/**
 * Upload a single file and report progress as it goes.
 *
 * `fetch()` cannot report upload progress, so this one call uses
 * XMLHttpRequest. Everything else matches apiFetch: the login token is
 * attached (refreshed first when due), a 401 clears the session, and a
 * failure throws ApiError.
 *
 * `onProgress` receives a fraction between 0 and 1, or null while the browser
 * cannot measure the total size.
 *
 * Returns the parsed JSON body. Pass `signal` (an AbortSignal) to cancel; a
 * cancelled upload rejects with an ApiError for which isAbortError() is true.
 */
export function apiUpload(path, { file, fieldName = "file", onProgress, signal } = {}) {
  const sendOnce = (token) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ApiError("Upload cancelled", 0, "aborted"));
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", toUrl(path), true);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (signal?.aborted) return;
          onProgress(event.lengthComputable ? event.loaded / event.total : null);
        };
      }

      const onAbort = () => xhr.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      const cleanup = () => signal?.removeEventListener("abort", onAbort);

      xhr.onload = () => {
        cleanup();
        let body = null;
        try {
          body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          /* non-JSON body */
        }
        resolve({ status: xhr.status, body });
      };

      xhr.onerror = () => {
        cleanup();
        reject(new ApiError("Network error. Check your connection and try again.", 0, null));
      };

      xhr.onabort = () => {
        cleanup();
        reject(new ApiError("Upload cancelled", 0, "aborted"));
      };

      const form = new FormData();
      form.append(fieldName, file, file.name);
      xhr.send(form);
    });

  return (async () => {
    await ensureFreshToken();
    const token = getAccessToken();
    const { status, body } = await sendOnce(token);

    if (status === 401) handleUnauthorized(token);

    if (status < 200 || status >= 300) {
      const detail = detailFromBody(
        body,
        status === 401 ? SESSION_EXPIRED_MESSAGE : `Upload failed (${status})`
      );
      throw new ApiError(detail, status, detail);
    }

    return body;
  })();
}
