/**
 * Regression tests: a null/empty aggregate is never negative-cached.
 */
import { describe, expect, it, vi } from "vitest";
import { SwrCache } from "./swr-cache.js";
import { InMemoryCache } from "../adapters/cache/in-memory-cache.js";

const OPTS = { staleAfter: 10, maxAge: 60 };
const newCache = () => new SwrCache(new InMemoryCache());

it("does not cache a null result, so the next invocation retries", async () => {
  const swr = newCache();
  const fetcher = vi
    .fn<() => Promise<{ price: number } | null>>()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ price: 7 });

  const first = await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
  const second = await swr.get("getQuote", ["AAPL"], fetcher, OPTS);

  expect(first.data).toBeNull();
  expect(second.data).toEqual({ price: 7 });
  expect(second.metadata.source).toBe("provider");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not cache an empty list, so the next invocation retries", async () => {
  const swr = newCache();
  const fetcher = vi
    .fn<() => Promise<number[]>>()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([1]);

  await swr.get("getDividends", ["AAPL"], fetcher, OPTS);
  const second = await swr.get("getDividends", ["AAPL"], fetcher, OPTS);

  expect(second.data).toEqual([1]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("a null refresh does not overwrite good cached data", async () => {
  const swr = newCache();
  const fetcher = vi
    .fn<() => Promise<{ price: number } | null>>()
    .mockResolvedValueOnce({ price: 7 })
    .mockResolvedValueOnce(null);

  await swr.get("getQuote", ["AAPL"], fetcher, OPTS);
  await swr.get("getQuote", ["AAPL"], fetcher, { ...OPTS, forceRefresh: true });
  const after = await swr.get("getQuote", ["AAPL"], fetcher, OPTS);

  expect(after.data).toEqual({ price: 7 });
  expect(after.metadata.source).toBe("cache");
});

describe("background refresh of a stale entry", () => {
  const STALE_AT_ONCE = { staleAfter: 0, maxAge: 60 };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it.each([
    ["a null result", async () => null],
    ["an empty list", async () => []],
    [
      "a failure",
      async () => {
        throw new Error("all providers down");
      },
    ],
  ])("%s leaves the good cached value in place", async (_label, refresh) => {
    const swr = newCache();
    const good = { price: 7 };
    const fetcher = vi.fn<() => Promise<unknown>>().mockResolvedValueOnce(good);
    await swr.get("getQuote", ["AAPL"], fetcher, STALE_AT_ONCE);
    await settle();
    fetcher.mockImplementation(refresh);

    const triggering = await swr.get("getQuote", ["AAPL"], fetcher, STALE_AT_ONCE);
    await settle();
    const after = await swr.get("getQuote", ["AAPL"], fetcher, STALE_AT_ONCE);

    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(triggering.data).toEqual(good);
    expect(after.data).toEqual(good);
    expect(after.metadata).toMatchObject({ source: "cache", stale: true });
    expect(after.metadata.retrievedAt).toEqual(triggering.metadata.retrievedAt);
    await settle();
  });
});
