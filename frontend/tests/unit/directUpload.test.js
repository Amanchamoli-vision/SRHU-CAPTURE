import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/api", () => {
  class ApiError extends Error {
    constructor(message, status, detail) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    ApiError,
    apiJson: vi.fn(),
    apiUpload: vi.fn(),
    isAbortError: (err) => err?.detail === "aborted",
  };
});

import { apiJson, apiUpload, isAbortError } from "../../src/services/api";
import { PART_CONCURRENCY, uploadEventFile } from "../../src/services/directUpload";

const EVENT = "/teacher/events/e1";
const SESSION = `${EVENT}/uploads/s1`;

/** A stand-in for XMLHttpRequest; `FakeXHR.handler(xhr)` decides each PUT. */
class FakeXHR {
  static handler = (xhr) => xhr.succeed();
  static sent = [];
  static inFlight = 0;
  static maxInFlight = 0;

  upload = {};

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send(body) {
    this.body = body;
    FakeXHR.sent.push(this);
    FakeXHR.inFlight += 1;
    FakeXHR.maxInFlight = Math.max(FakeXHR.maxInFlight, FakeXHR.inFlight);
    // Settle on a later task so several parts are genuinely in flight at once.
    setTimeout(() => FakeXHR.handler(this), 0);
  }

  settle(fn) {
    if (this.done) return;
    this.done = true;
    FakeXHR.inFlight -= 1;
    fn();
  }

  succeed() {
    this.settle(() => {
      this.upload.onprogress?.({ loaded: this.body.size });
      this.status = 200;
      this.onload();
    });
  }

  fail(status) {
    this.settle(() => {
      this.status = status;
      this.onload();
    });
  }

  networkError() {
    this.settle(() => this.onerror());
  }

  abort() {
    this.settle(() => this.onabort());
  }
}

/** The start response for a file cut into parts of `partSize`. */
function started(file, partSize) {
  const count = Math.max(1, Math.ceil(file.size / partSize));
  return {
    success: true,
    direct: true,
    session_id: "s1",
    part_size: partSize,
    part_count: count,
    parts: Array.from({ length: count }, (_, i) => ({
      part_number: i + 1,
      size: Math.min(partSize, file.size - i * partSize),
      url: `https://r2.test/obj?partNumber=${i + 1}&v=1`,
    })),
  };
}

/** apiJson answering start, sign and complete; DELETE is recorded. */
function mockApi(start, { complete = { success: true, media: { id: "m1" } }, sign } = {}) {
  apiJson.mockImplementation(async (path, options = {}) => {
    if (path === `${EVENT}/uploads`) return start;
    if (path === `${SESSION}/complete`) {
      if (complete instanceof Error) throw complete;
      return complete;
    }
    if (path === `${SESSION}/sign`) return sign(options.body.part_numbers);
    if (path === SESSION && options.method === "DELETE") return { aborted: true };
    throw new Error(`unexpected call ${path}`);
  });
}

const deleteCalls = () =>
  apiJson.mock.calls.filter(([path, options]) => path === SESSION && options?.method === "DELETE");

const partOf = (xhr) => Number(new URL(xhr.url).searchParams.get("partNumber"));

const fileOf = (size, name = "talk.mp4", type = "video/mp4") =>
  new File([new Uint8Array(size).map((_, i) => i % 251)], name, { type });

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  FakeXHR.handler = (xhr) => xhr.succeed();
  FakeXHR.sent = [];
  FakeXHR.inFlight = 0;
  FakeXHR.maxInFlight = 0;
  apiJson.mockReset();
  apiUpload.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("uploadEventFile", () => {
  it("posts the file through the API when direct uploads are unavailable", async () => {
    mockApi({ success: true, direct: false });
    apiUpload.mockResolvedValue({ media: { id: "posted" } });
    const file = fileOf(10, "a.png", "image/png");

    const result = await uploadEventFile(EVENT, { kind: "image", file });

    expect(result).toEqual({ media: { id: "posted" } });
    expect(apiUpload).toHaveBeenCalledWith(`${EVENT}/media`, expect.objectContaining({ file }));
    expect(FakeXHR.sent).toHaveLength(0);
  });

  it("declares the file, PUTs it to storage and completes", async () => {
    const file = fileOf(10, "a.png", "image/png");
    mockApi(started(file, 10));
    const progress = [];

    const result = await uploadEventFile(EVENT, {
      kind: "image",
      file,
      onProgress: (fraction) => progress.push(fraction),
    });

    expect(apiJson.mock.calls[0]).toEqual([
      `${EVENT}/uploads`,
      expect.objectContaining({
        method: "POST",
        body: { kind: "media", file_name: "a.png", content_type: "image/png", size: 10 },
      }),
    ]);
    expect(FakeXHR.sent).toHaveLength(1);
    expect(FakeXHR.sent[0].method).toBe("PUT");
    expect(FakeXHR.sent[0].body.size).toBe(10);
    expect(progress.at(-1)).toBe(1);
    expect(result).toEqual({ success: true, media: { id: "m1" } });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("sends documents as the documents kind", async () => {
    const file = fileOf(5, "notes.docx", "");
    mockApi(started(file, 5), { complete: { document: { id: "d1" } } });
    await uploadEventFile(EVENT, { kind: "document", file });
    expect(apiJson.mock.calls[0][1].body.kind).toBe("documents");
    expect(apiJson.mock.calls[0][1].body.content_type).toBe("");
  });

  it("slices a large file into its parts and sends a few at a time", async () => {
    const file = fileOf(10 * 8 + 3);
    mockApi(started(file, 8));

    await uploadEventFile(EVENT, { kind: "video", file });

    const sizes = Object.fromEntries(FakeXHR.sent.map((xhr) => [partOf(xhr), xhr.body.size]));
    expect(Object.keys(sizes)).toHaveLength(11);
    expect(sizes[1]).toBe(8);
    expect(sizes[11]).toBe(3);
    expect(FakeXHR.maxInFlight).toBeGreaterThan(1);
    expect(FakeXHR.maxInFlight).toBeLessThanOrEqual(PART_CONCURRENCY);

    // The bytes of each part are the right slice of the file.
    const part3 = new Uint8Array(await FakeXHR.sent.find((x) => partOf(x) === 3).body.arrayBuffer());
    expect(Array.from(part3)).toEqual(Array.from({ length: 8 }, (_, i) => (16 + i) % 251));
  });

  it("retries a part after a network error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    const file = fileOf(16);
    mockApi(started(file, 8));
    let failures = 0;
    FakeXHR.handler = (xhr) => {
      if (partOf(xhr) === 2 && failures < 2) {
        failures += 1;
        xhr.networkError();
      } else xhr.succeed();
    };

    const upload = uploadEventFile(EVENT, { kind: "video", file });
    await vi.runAllTimersAsync();
    await expect(upload).resolves.toEqual({ success: true, media: { id: "m1" } });

    expect(FakeXHR.sent.filter((xhr) => partOf(xhr) === 2)).toHaveLength(3);
    expect(deleteCalls()).toHaveLength(0);
  });

  it("asks for a fresh URL when storage says the old one expired", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    const file = fileOf(16);
    const sign = vi.fn((numbers) => ({
      parts: numbers.map((n) => ({ part_number: n, url: `https://r2.test/obj?partNumber=${n}&v=2` })),
    }));
    mockApi(started(file, 8), { sign });
    FakeXHR.handler = (xhr) =>
      partOf(xhr) === 2 && xhr.url.endsWith("v=1") ? xhr.fail(403) : xhr.succeed();

    const upload = uploadEventFile(EVENT, { kind: "video", file });
    await vi.runAllTimersAsync();
    await upload;

    expect(sign).toHaveBeenCalledWith([2]);
    expect(FakeXHR.sent.filter((xhr) => partOf(xhr) === 2).map((xhr) => xhr.url)).toEqual([
      "https://r2.test/obj?partNumber=2&v=1",
      "https://r2.test/obj?partNumber=2&v=2",
    ]);
  });

  it("gives up on a refusal, stops the other parts and frees the upload", async () => {
    const file = fileOf(8 * 6);
    mockApi(started(file, 8));
    FakeXHR.handler = (xhr) => (partOf(xhr) === 1 ? xhr.fail(400) : null); // others hang

    await expect(uploadEventFile(EVENT, { kind: "video", file })).rejects.toMatchObject({ status: 400 });

    expect(FakeXHR.sent.filter((xhr) => partOf(xhr) === 1)).toHaveLength(1);
    // The parts still in flight were cancelled, and nothing new was started.
    expect(FakeXHR.sent.every((xhr) => xhr.done)).toBe(true);
    expect(FakeXHR.sent.length).toBeLessThanOrEqual(PART_CONCURRENCY);
    expect(deleteCalls()).toHaveLength(1);
  });

  it("gives up after repeated failures", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    const file = fileOf(8);
    mockApi(started(file, 8));
    FakeXHR.handler = (xhr) => xhr.fail(503);

    const upload = uploadEventFile(EVENT, { kind: "video", file });
    const outcome = expect(upload).rejects.toMatchObject({ status: 503 });
    await vi.runAllTimersAsync();
    await outcome;
    expect(FakeXHR.sent).toHaveLength(4);
    expect(deleteCalls()).toHaveLength(1);
  });

  it("cancels when the page aborts, and still frees the upload", async () => {
    const file = fileOf(8 * 4);
    mockApi(started(file, 8));
    FakeXHR.handler = () => {}; // never settles on its own
    const controller = new AbortController();

    const upload = uploadEventFile(EVENT, { kind: "video", file, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();

    const err = await upload.catch((error) => error);
    expect(isAbortError(err)).toBe(true);
    expect(FakeXHR.sent.every((xhr) => xhr.done)).toBe(true);
    // The DELETE must not carry the aborted signal, or it would never be sent.
    expect(deleteCalls()).toHaveLength(1);
    expect(deleteCalls()[0][1].signal).toBeUndefined();
  });

  it("frees the upload when completion is refused", async () => {
    const file = fileOf(8);
    const refused = Object.assign(new Error("An event can have at most 10 photos."), { status: 400 });
    mockApi(started(file, 8), { complete: refused });

    await expect(uploadEventFile(EVENT, { kind: "image", file })).rejects.toBe(refused);
    expect(deleteCalls()).toHaveLength(1);
  });

  it("surfaces a refusal to start without touching storage", async () => {
    const tooBig = Object.assign(new Error("You have exceeded the limit."), { status: 400 });
    apiJson.mockRejectedValue(tooBig);

    await expect(uploadEventFile(EVENT, { kind: "video", file: fileOf(8) })).rejects.toBe(tooBig);
    expect(FakeXHR.sent).toHaveLength(0);
    expect(apiJson).toHaveBeenCalledTimes(1);
  });
});
