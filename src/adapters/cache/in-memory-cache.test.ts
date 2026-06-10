import { describe, it, expect, vi, afterEach } from "vitest";
import { InMemoryCache } from "./in-memory-cache.js";

describe("InMemoryCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a missing key", async () => {
    const cache = new InMemoryCache();
    expect(await cache.get("nope")).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    const cache = new InMemoryCache();
    await cache.set("k", { a: 1 });
    expect(await cache.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("expires values after their TTL", async () => {
    vi.useFakeTimers();
    const cache = new InMemoryCache();
    await cache.set("k", "v", 10); // 10 seconds
    expect(await cache.get("k")).toBe("v");
    vi.advanceTimersByTime(10_001);
    expect(await cache.get("k")).toBeNull();
  });

  it("never expires when no TTL is given", async () => {
    vi.useFakeTimers();
    const cache = new InMemoryCache();
    await cache.set("k", "v");
    vi.advanceTimersByTime(10_000_000);
    expect(await cache.get("k")).toBe("v");
  });

  it("deletes keys matching a glob pattern and returns the count", async () => {
    const cache = new InMemoryCache();
    await cache.set("p:getQuote:AAPL", 1);
    await cache.set("p:getQuote:MSFT", 2);
    await cache.set("p:getDividends:AAPL", 3);

    const removed = await cache.deletePattern("p:getQuote:*");
    expect(removed).toBe(2);
    expect(await cache.get("p:getQuote:AAPL")).toBeNull();
    expect(await cache.get("p:getDividends:AAPL")).toBe(3);
  });

  it("treats glob special characters literally except '*'", async () => {
    const cache = new InMemoryCache();
    await cache.set("a.b.c", 1);
    await cache.set("axbxc", 2);
    const removed = await cache.deletePattern("a.b.c");
    expect(removed).toBe(1);
    expect(await cache.get("axbxc")).toBe(2);
  });
});
