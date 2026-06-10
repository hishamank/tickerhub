import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SwrCache } from "./swr-cache.js";
import { InMemoryCache } from "../adapters/cache/in-memory-cache.js";

const OPTS = { staleAfter: 10, maxAge: 60 }; // seconds

describe("SwrCache", () => {
  let cache: InMemoryCache;
  let swr: SwrCache;

  beforeEach(() => {
    cache = new InMemoryCache();
    swr = new SwrCache(cache);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches and caches on a miss (source=provider)", async () => {
    const fetcher = vi.fn(async () => ({ price: 1 }));
    const res = await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    expect(res.data).toEqual({ price: 1 });
    expect(res.metadata.source).toBe("provider");
    expect(res.metadata.cached).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves a fresh hit from cache without re-fetching", async () => {
    const fetcher = vi.fn(async () => ({ price: 1 }));
    await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    const res = await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    expect(res.metadata.source).toBe("cache");
    expect(res.metadata.stale).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves stale data and triggers a background refresh", async () => {
    vi.useFakeTimers();
    let value = 1;
    const fetcher = vi.fn(async () => ({ price: value }));
    await swr.get("getQuote", ["AAPL"], fetcher, OPTS); // value=1 cached

    value = 2;
    vi.advanceTimersByTime(11_000); // past staleAfter, before maxAge
    const res = await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    expect(res.metadata.stale).toBe(true);
    expect(res.data).toEqual({ price: 1 }); // stale value returned immediately
    await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(2); // background refresh fired
  });

  it("coalesces concurrent requests for the same key", async () => {
    let resolve!: (v: { price: number }) => void;
    const deferred = new Promise<{ price: number }>((r) => (resolve = r));
    const fetcher = vi.fn(() => deferred);
    const p1 = swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    const p2 = swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    // Let both requests pass the cache-miss check and reach the (coalesced) fetch.
    await new Promise((r) => setTimeout(r, 0));
    resolve({ price: 9 });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.data).toEqual({ price: 9 });
    expect(r2.data).toEqual({ price: 9 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("throws on fetch error when no cache exists", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(swr.get("getQuote", ["X"], fetcher, OPTS)).rejects.toThrow(
      "boom",
    );
  });

  it("re-throws on fetch error once the cached entry has expired", async () => {
    // The cache backend evicts at maxAge (== the SWR expiry), so past maxAge
    // there is no stale entry to fall back to and the error propagates.
    vi.useFakeTimers();
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error("boom");
      return { price: 1 };
    });
    await swr.get("getQuote", ["AAPL"], fetcher, OPTS);

    fail = true;
    vi.advanceTimersByTime(61_000); // past maxAge → entry evicted → fetch fails
    await expect(swr.get("getQuote", ["AAPL"], fetcher, OPTS)).rejects.toThrow(
      "boom",
    );
  });

  it("forceRefresh bypasses the cache", async () => {
    let value = 1;
    const fetcher = vi.fn(async () => ({ price: value }));
    await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    value = 2;
    const res = await swr.get("getQuote", ["AAPL"], fetcher, {
      ...OPTS,
      forceRefresh: true,
    });
    expect(res.data).toEqual({ price: 2 });
    expect(res.metadata.source).toBe("provider");
  });

  it("invalidates by symbol", async () => {
    const fetcher = vi.fn(async () => ({ price: 1 }));
    await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    await swr.invalidateSymbol("AAPL");
    await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
    expect(fetcher).toHaveBeenCalledTimes(2); // cache cleared → re-fetch
  });
});
