/**
 * Upload an event's photo, video or document straight to Cloudflare R2.
 *
 * Posting a file through the API sends it through the Cloudflare proxy in
 * front of the backend, which caps the request size. Here the API only
 * authorises and verifies (backend app/services/direct_upload.py):
 *
 *   1. POST {event}/uploads            -- validated like a posted file; returns
 *                                         a pre-signed PUT URL per part
 *   2. PUT each part to R2             -- in parallel, with progress, each part
 *                                         retried on its own
 *   3. POST {event}/uploads/{id}/complete -- the API checks what arrived and
 *                                         records it, answering exactly like
 *                                         the posted-file route
 *
 * A URL that expired mid-upload is re-issued by POST .../sign; a failed or
 * cancelled upload is freed with DELETE .../{id}. When the deployment has no
 * R2 (or direct uploads are switched off) step 1 answers `direct: false` and
 * the file is posted through the API as before.
 */

import { ApiError, apiJson, apiUpload, isAbortError } from "./api";

// Parts in flight at once. Enough to fill a typical uplink without starving
// the rest of the page.
export const PART_CONCURRENCY = 3;
// Tries per part, backing off RETRY_BASE_MS, 2x, 4x ... in between.
export const MAX_ATTEMPTS = 4;
export const RETRY_BASE_MS = 1000;
// The API signs at most this many part URLs per request.
const SIGN_BATCH = 100;

const STORAGE_UNREACHABLE =
  "Could not reach file storage. Check your connection and try again.";

const cancelled = () => new ApiError("Upload cancelled", 0, "aborted");

/**
 * `eventPath` is the event's API path, e.g. `/teacher/events/{id}`.
 * `kind` is "image", "video" or "document"; `onProgress` receives a fraction
 * between 0 and 1. Resolves with the API's `{ media }` or `{ document }`
 * body; rejects with an ApiError (isAbortError() when `signal` aborted it).
 */
export async function uploadEventFile(eventPath, { kind, file, category, onProgress, signal } = {}) {
  const uploadKind = kind === "document" ? "documents" : "media";
  // Notice / Report applies to documents only; photos and videos carry none.
  if (uploadKind !== "documents") category = undefined;

  const startBody = {
    kind: uploadKind,
    file_name: file.name,
    content_type: file.type || "",
    size: file.size,
  };
  if (category) {
    startBody.category = category;
  }

  const started = await apiJson(`${eventPath}/uploads`, {
    method: "POST",
    body: startBody,
    signal,
  });

  if (!started?.direct) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return apiUpload(`${eventPath}/${uploadKind}${query}`, {
      file,
      extraFields: category ? { category } : undefined,
      onProgress,
      signal,
    });
  }

  const sessionPath = `${eventPath}/uploads/${started.session_id}`;
  try {
    await sendParts(file, started, sessionPath, onProgress, signal);
    return await apiJson(`${sessionPath}/complete`, { method: "POST", signal });
  } catch (err) {
    // Free whatever reached storage. Deliberately not tied to `signal`: an
    // upload cancelled by leaving the page must still be cleaned up. The API
    // ignores this for an upload it already recorded or refused.
    apiJson(sessionPath, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

async function sendParts(file, started, sessionPath, onProgress, signal) {
  const { part_size: partSize, part_count: partCount } = started;
  const urls = new Map(started.parts.map((part) => [part.part_number, part.url]));
  const sent = new Array(partCount + 1).fill(0);
  const report = () => {
    if (!onProgress || signal?.aborted) return;
    const total = sent.reduce((sum, bytes) => sum + bytes, 0);
    onProgress(file.size ? Math.min(1, total / file.size) : 1);
  };

  // One failed part stops the others, as does the caller's signal.
  const stop = new AbortController();
  const onOuterAbort = () => stop.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  const sign = async (first) => {
    const numbers = [];
    for (let n = first; n <= partCount && numbers.length < SIGN_BATCH; n += 1) numbers.push(n);
    const signed = await apiJson(`${sessionPath}/sign`, {
      method: "POST",
      body: { part_numbers: numbers },
      signal: stop.signal,
    });
    for (const part of signed?.parts || []) urls.set(part.part_number, part.url);
  };

  const sendPart = async (n) => {
    const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
    for (let attempt = 1; ; attempt += 1) {
      if (!urls.has(n)) await sign(n);
      try {
        await putBlob(urls.get(n), blob, stop.signal, (loaded) => {
          sent[n] = loaded;
          report();
        });
        sent[n] = blob.size;
        report();
        return;
      } catch (err) {
        sent[n] = 0;
        report();
        if (isAbortError(err) || attempt >= MAX_ATTEMPTS) throw err;
        // 403: the URL expired (or the clock drifted) -- sign it again.
        // Any other 4xx will not get better by retrying.
        if (err.status === 403) urls.delete(n);
        else if (err.status >= 400 && err.status < 500) throw err;
        await wait(RETRY_BASE_MS * 2 ** (attempt - 1), stop.signal);
      }
    }
  };

  let next = 1;
  const worker = async () => {
    while (next <= partCount) {
      const n = next;
      next += 1;
      await sendPart(n);
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, () =>
        worker().catch((err) => {
          stop.abort();
          throw err;
        })
      )
    );
  } finally {
    signal?.removeEventListener("abort", onOuterAbort);
  }
  if (signal?.aborted) throw cancelled();
}

/** PUT one part to its pre-signed URL. No login token: R2 checks the URL. */
function putBlob(url, blob, signal, onLoaded) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (event) => onLoaded(event.loaded);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(`File storage refused the upload (${xhr.status}).`, xhr.status, null));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(STORAGE_UNREACHABLE, 0, null));
    };
    xhr.onabort = () => {
      cleanup();
      reject(cancelled());
    };

    xhr.send(blob);
  });
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
