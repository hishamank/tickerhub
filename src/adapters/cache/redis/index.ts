/**
 * Redis cache adapter subpath entry (`tickerhub/redis`).
 *
 * Implements the Cache port over a Redis client. To avoid a hard dependency on
 * any specific client's types, it accepts a minimal `RedisLike` interface — an
 * `ioredis` instance satisfies it directly. Values are JSON-serialized.
 */

import type { Cache } from "../../../ports/cache.js";

/** Minimal subset of the ioredis client surface this adapter relies on. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchToken: "MATCH",
    pattern: string,
    countToken: "COUNT",
    count: number,
  ): Promise<[string, string[]]>;
}

export class RedisCache implements Cache {
  constructor(
    private readonly redis: RedisLike,
    private readonly keyPrefix = "",
  ) {}

  private prefixed(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.prefixed(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    const fullKey = this.prefixed(key);
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.redis.set(fullKey, raw, "EX", ttlSeconds);
    } else {
      await this.redis.set(fullKey, raw);
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    const fullPattern = this.prefixed(pattern);
    let cursor = "0";
    let removed = 0;
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        fullPattern,
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        removed += await this.redis.del(...keys);
      }
    } while (cursor !== "0");
    return removed;
  }
}
