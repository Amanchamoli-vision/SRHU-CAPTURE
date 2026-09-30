import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiJson } from "../../src/services/api";

/** A fetch that answers each call with `body` once `release()` is called. */
function deferredFetch(body = { items: [1, 2] }) {
  const waiting = [];
  const fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        waiting.push(() => resolve(new Response(JSON.stringify(body), { status: 200 })));
      })
  );
  fetchMock.release = () => waiting.splice(0).forEach((go) => go());
  return fetchMock;
}

describe("apiJson shared reads", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("joins identical GETs that are in flight together", async () => {
    const a = apiJson("/notifications");
    const b = apiJson("/notifications");
    await Promise.resolve();
    fetchMock.release();
    const [first, second] = await Promise.all([a, b]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ items: [1, 2] });
    expect(second).toEqual(first);
    // Each caller has its own copy: changing one cannot change the other.
    first.items.push(3);
    expect(second.items).toEqual([1, 2]);
  });

  it("does not cache: a later call asks again", async () => {
    const a = apiJson("/notifications");
    await Promise.resolve();
    fetchMock.release();
    await a;
    const b = apiJson("/notifications");
    await Promise.resolve();
    fetchMock.release();
    await b;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps different paths, writes and cancellable reads separate", async () => {
    const controller = new AbortController();
    const calls = [
      apiJson("/teacher/events"),
      apiJson("/notifications"),
      apiJson("/notifications", { signal: controller.signal }),
      apiJson("/notifications", { method: "POST", body: { title: "x" } }),
    ];
    await Promise.resolve();
    fetchMock.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fetchMock.release();
    await Promise.all(calls);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("hands the same failure to every joined caller, then forgets it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Nope" }), { status: 500 }))
    );
    const results = await Promise.allSettled([apiJson("/x"), apiJson("/x")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(apiJson("/x")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
