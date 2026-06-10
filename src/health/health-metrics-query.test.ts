import { describe, it, expect } from "vitest";
import { HealthMetricsQuery } from "./health-metrics-query.js";
import { HealthMonitor } from "./health-monitor.js";
import { RateLimitTracker } from "../rate-limiting/tracker.js";

function build() {
  const hm = new HealthMonitor();
  const tracker = new RateLimitTracker();
  return { hm, tracker, query: new HealthMetricsQuery(hm, tracker) };
}

describe("HealthMetricsQuery", () => {
  it("summarizes metrics for all providers", async () => {
    const { hm, query } = build();
    hm.recordRequest("finnhub", {
      success: true,
      latencyMs: 10,
      timestamp: new Date(0),
    });
    hm.recordRequest("finnhub", {
      success: false,
      latencyMs: 0,
      timestamp: new Date(0),
      error: "boom",
    });
    const all = await query.getAllProviderMetrics();
    expect(all).toHaveLength(1);
    expect(all[0]?.successRate).toBe(50);
  });

  it("returns null metrics for an unknown provider", async () => {
    const { query } = build();
    expect(await query.getProviderMetrics("nope")).toBeNull();
  });

  it("reports remaining rate-limit budget", async () => {
    const { tracker, query } = build();
    const creds = { api_key: "k" };
    tracker.record(creds, "finnhub", 5, null);
    const status = await query.getRateLimitStatus("finnhub", creds);
    expect(status.remaining.perMinute).toBe(4);
    expect(status.remaining.perDay).toBeUndefined(); // no per-day limit tracked
  });

  it("returns recent errors newest-first", async () => {
    const { hm, query } = build();
    hm.recordRequest("finnhub", {
      success: false,
      latencyMs: 0,
      timestamp: new Date(1000),
      error: "first",
    });
    hm.recordRequest("finnhub", {
      success: true,
      latencyMs: 5,
      timestamp: new Date(2000),
    });
    hm.recordRequest("finnhub", {
      success: false,
      latencyMs: 0,
      timestamp: new Date(3000),
      error: "second",
    });
    const errors = await query.getRecentErrors("finnhub");
    expect(errors.map((e) => e.errorMessage)).toEqual(["second", "first"]);
  });

  it("computes a system health summary", async () => {
    const { hm, query } = build();
    hm.recordRequest("finnhub", {
      success: true,
      latencyMs: 10,
      timestamp: new Date(0),
    });
    const summary = await query.getSystemHealthSummary();
    expect(summary.totalProviders).toBe(1);
    expect(summary.overallSuccessRate).toBe(100);
  });
});
