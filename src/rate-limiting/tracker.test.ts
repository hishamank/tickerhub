import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimitTracker } from "./tracker.js";

afterEach(() => vi.useRealTimers());

const creds = { api_key: "k1" };

describe("RateLimitTracker", () => {
  it("is not exhausted before any usage", () => {
    const t = new RateLimitTracker();
    expect(t.isExhausted(creds, "finnhub", 60, null)).toBe(false);
  });

  it("becomes exhausted once the per-minute limit is reached", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 3; i++) t.record(creds, "finnhub", 3, null);
    expect(t.isExhausted(creds, "finnhub", 3, null)).toBe(true);
  });

  it("resets the per-minute window after a minute", () => {
    vi.useFakeTimers();
    const t = new RateLimitTracker();
    for (let i = 0; i < 3; i++) t.record(creds, "finnhub", 3, null);
    expect(t.isExhausted(creds, "finnhub", 3, null)).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(t.isExhausted(creds, "finnhub", 3, null)).toBe(false);
  });

  it("tracks budgets separately per credential set", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 3; i++) t.record(creds, "finnhub", 3, null);
    expect(t.isExhausted(creds, "finnhub", 3, null)).toBe(true);
    expect(t.isExhausted({ api_key: "k2" }, "finnhub", 3, null)).toBe(false);
  });

  it("enforces per-day limits", () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 2; i++) t.record(creds, "fmp", null, 2);
    expect(t.isExhausted(creds, "fmp", null, 2)).toBe(true);
  });

  it("reports remaining budget and resets on clear", () => {
    const t = new RateLimitTracker();
    t.record(creds, "finnhub", 5, null);
    expect(t.getRemainingBudget(creds, "finnhub").minute).toBe(4);
    t.reset();
    expect(t.isExhausted(creds, "finnhub", 1, null)).toBe(false);
  });
});
