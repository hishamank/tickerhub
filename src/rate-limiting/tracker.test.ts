import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimitTracker } from "./tracker.js";
import { InMemoryRateLimitStore } from "../adapters/rate-limit/in-memory-rate-limit-store.js";

afterEach(() => vi.useRealTimers());

const creds = { api_key: "k1" };

describe("RateLimitTracker", () => {
  it("is not exhausted before any usage", () => {
    const t = new RateLimitTracker();
    expect(t.isExhausted(creds, "finnhub", { perMinute: 60 })).toBe(false);
  });

  it("becomes exhausted once the per-minute limit is reached", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 3; i++) t.record(creds, "finnhub", { perMinute: 3 });
    expect(t.isExhausted(creds, "finnhub", { perMinute: 3 })).toBe(true);
  });

  it("resets the per-minute window after a minute", () => {
    vi.useFakeTimers();
    const t = new RateLimitTracker();
    for (let i = 0; i < 3; i++) t.record(creds, "finnhub", { perMinute: 3 });
    expect(t.isExhausted(creds, "finnhub", { perMinute: 3 })).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(t.isExhausted(creds, "finnhub", { perMinute: 3 })).toBe(false);
  });

  it("tracks budgets separately per credential set", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 3; i++) t.record(creds, "finnhub", { perMinute: 3 });
    expect(t.isExhausted(creds, "finnhub", { perMinute: 3 })).toBe(true);
    expect(t.isExhausted({ api_key: "k2" }, "finnhub", { perMinute: 3 })).toBe(
      false,
    );
  });

  it("enforces per-day limits", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 2; i++) t.record(creds, "fmp", { perDay: 2 });
    expect(t.isExhausted(creds, "fmp", { perDay: 2 })).toBe(true);
  });

  it("enforces per-hour limits and resets after an hour", () => {
    vi.useFakeTimers();
    const t = new RateLimitTracker();
    for (let i = 0; i < 2; i++) t.record(creds, "tiingo", { perHour: 2 });
    expect(t.isExhausted(creds, "tiingo", { perHour: 2 })).toBe(true);
    vi.advanceTimersByTime(61 * 60_000);
    expect(t.isExhausted(creds, "tiingo", { perHour: 2 })).toBe(false);
  });

  it("enforces per-month limits", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 100; i++)
      t.record(creds, "marketstack", { perMonth: 100 });
    expect(t.isExhausted(creds, "marketstack", { perMonth: 100 })).toBe(true);
  });

  it("a monthly budget persists when a store is shared across trackers", () => {
    // Simulates a restart: a fresh tracker over the same store sees prior usage
    // (the durability the SQLite store provides in production).
    const store = new InMemoryRateLimitStore();
    const t1 = new RateLimitTracker(store);
    for (let i = 0; i < 100; i++)
      t1.record(creds, "marketstack", { perMonth: 100 });
    const t2 = new RateLimitTracker(store);
    expect(t2.isExhausted(creds, "marketstack", { perMonth: 100 })).toBe(true);
  });

  it("reports remaining budget and resets on clear", () => {
    const t = new RateLimitTracker();
    t.record(creds, "finnhub", { perMinute: 5 });
    expect(t.getRemainingBudget(creds, "finnhub").minute).toBe(4);
    t.reset();
    expect(t.isExhausted(creds, "finnhub", { perMinute: 1 })).toBe(false);
  });
});
