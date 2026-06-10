import { describe, it, expect } from "vitest";
import { RedisCache, type RedisLike } from "./index.js";

/** Minimal in-memory fake satisfying RedisLike, with EX TTL recording. */
class FakeRedis implements RedisLike {
  store = new Map<string, string>();
  lastEx?: number;

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    _mode?: "EX",
    ttlSeconds?: number,
  ): Promise<unknown> {
    this.store.set(key, value);
    if (ttlSeconds !== undefined) this.lastEx = ttlSeconds;
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async scan(
    _cursor: string,
    _matchToken: "MATCH",
    pattern: string,
    _countToken: "COUNT",
    _count: number,
  ): Promise<[string, string[]]> {
    const re = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    const matches = [...this.store.keys()].filter((k) => re.test(k));
    return ["0", matches];
  }
}

describe("RedisCache", () => {
  it("serializes and deserializes values", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    await cache.set("k", { a: 1, b: "x" });
    expect(redis.store.get("k")).toBe('{"a":1,"b":"x"}');
    expect(await cache.get<{ a: number; b: string }>("k")).toEqual({
      a: 1,
      b: "x",
    });
  });

  it("returns null for a missing key", async () => {
    const cache = new RedisCache(new FakeRedis());
    expect(await cache.get("nope")).toBeNull();
  });

  it("passes TTL via EX when provided", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    await cache.set("k", 1, 30);
    expect(redis.lastEx).toBe(30);
  });

  it("applies a key prefix", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis, "md:");
    await cache.set("k", 1);
    expect(redis.store.has("md:k")).toBe(true);
  });

  it("deletes keys matching a pattern and returns the count", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    await cache.set("p:getQuote:AAPL", 1);
    await cache.set("p:getQuote:MSFT", 2);
    await cache.set("p:getDividends:AAPL", 3);
    const removed = await cache.deletePattern("p:getQuote:*");
    expect(removed).toBe(2);
    expect(await cache.get("p:getDividends:AAPL")).toBe(3);
  });
});
