import {
  clearSession,
  getAccessToken,
  readSession,
  writeSession,
} from "./session";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!configuredApiBaseUrl) {
  throw new Error(
    "VITE_API_BASE_URL must be set to the public FastAPI API URL."
  );
}
const resolveApiBaseUrl = () => {
  const url = configuredApiBaseUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.hostname) {
    const currentHost = window.location.hostname;
    // When accessed from another device on the same local network (e.g. 192.168.x.x, 172.16.x.x, 10.x.x.x),
    // map localhost/127.0.0.1 to the current host so other devices can reach the backend.
    // The backend must then listen on 0.0.0.0 (python run.py does), not only on 127.0.0.1.
    if (currentHost !== "localhost" && currentHost !== "127.0.0.1") {
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          parsed.hostname = currentHost;
          return parsed.origin;
        }
      } catch {
        // Fallback to configured URL if parsing fails
      }
    }
  }
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
  `Cannot reach the Campus Capture server at ${API_BASE_URL}. ` +
  "Make sure the backend is running and reachable from this device.";

const toUrl = (path) =>
  /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

/**
 * fetch() that turns a network failure ("Failed to fetch", connection refused,
 * DNS, CORS block) into an ApiError with a message a user can act on.
 */
async function networkFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new ApiError(UNREACHABLE_MESSAGE, 0, err?.message || String(err));
  }
}

/** Pull a readable message out of a parsed FastAPI error body. */
function detailFromBody(body, fallback) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
    // FastAPI validation errors
    return body.detail.map((item) => item.msg.replace(/^Value error, /, "")).join(" ");
  }
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

/**
 * Ask the backend for a fresh token using the current one.
 * Returns the new session or null when the current session is no longer valid.
 */
export async function refreshAccessToken() {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(toUrl("/auth/refresh"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;

    const data = await response.json();
    return writeSession(
      {
        access_token: data.access_token,
        expires_at: Date.now() + (data.expires_in || 0) * 1000,
        user: data.user || readSession()?.user || null,
      },
      "TOKEN_REFRESHED"
    );
  } catch {
    return null;
  }
}

/**
 * fetch() with the login token attached.
 *
 * - `body` may be a plain object (sent as JSON) or FormData (sent as-is).
 * - On a 401 the token is refreshed once and the request retried; if that
 *   fails the session is cleared so the app falls back to the login page.
 * - Throws ApiError(status 0) when the server cannot be reached.
 */
export async function apiFetch(path, options = {}) {
  const { auth = true, body, headers = {}, retryOn401 = true, ...rest } = options;

  const buildInit = (token) => {
    const finalHeaders = { ...headers };
    let finalBody = body;

    if (body !== undefined && body !== null && !(body instanceof FormData)) {
      if (typeof body !== "string") finalBody = JSON.stringify(body);
      if (!finalHeaders["Content-Type"]) finalHeaders["Content-Type"] = "application/json";
    }
    if (token) finalHeaders.Authorization = `Bearer ${token}`;

    return { ...rest, headers: finalHeaders, body: finalBody };
  };

  const token = auth ? getAccessToken() : null;
  let response = await networkFetch(toUrl(path), buildInit(token));

  if (auth && retryOn401 && response.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.access_token) {
      response = await networkFetch(toUrl(path), buildInit(refreshed.access_token));
    }
    if (response.status === 401) {
      clearSession();
    }
  }

  return response;
}

/**
 * apiFetch + JSON parsing. Throws ApiError for non-2xx responses.
 */
export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    const detail = await readErrorDetail(
      response,
      response.status === 401
        ? "Your session has expired. Please login again."
        : `Request failed (${response.status})`
    );
    throw new ApiError(detail, response.status, detail);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Upload a single file and report progress as it goes.
 *
 * `fetch()` cannot report upload progress, so this one call uses
 * XMLHttpRequest. Everything else matches apiFetch: the login token is
 * attached, a 401 refreshes the token once and retries, and a failure throws
 * ApiError.
 *
 * `onProgress` receives a fraction between 0 and 1, or null while the browser
 * cannot measure the total size.
 *
 * Returns the parsed JSON body. Pass `signal` (an AbortSignal) to cancel.
 */
export function apiUpload(path, { file, fieldName = "file", onProgress, signal } = {}) {
  const sendOnce = (token) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ApiError("Upload cancelled", 0, null));
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", toUrl(path), true);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
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
        reject(new ApiError("Upload cancelled", 0, null));
      };

      const form = new FormData();
      form.append(fieldName, file, file.name);
      xhr.send(form);
    });

  return (async () => {
    const token = getAccessToken();
    let { status, body } = await sendOnce(token);

    if (status === 401 && token) {
      const refreshed = await refreshAccessToken();
      if (refreshed?.access_token) {
        ({ status, body } = await sendOnce(refreshed.access_token));
      }
      if (status === 401) {
        clearSession();
      }
    }

    if (status < 200 || status >= 300) {
      const detail = detailFromBody(
        body,
        status === 401
          ? "Your session has expired. Please login again."
          : `Upload failed (${status})`
      );
      throw new ApiError(detail, status, detail);
    }

    return body;
  })();
}
