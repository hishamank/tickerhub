import { describe, it, expect } from "vitest";
import { HealthMonitor, type RequestResult } from "./health-monitor.js";

const ok = (latencyMs = 10): RequestResult => ({
  success: true,
  latencyMs,
  timestamp: new Date(0),
});
const fail = (): RequestResult => ({
  success: false,
  latencyMs: 0,
  timestamp: new Date(0),
  error: "x",
});

describe("HealthMonitor", () => {
  it("returns null metrics and success rate before any request", () => {
    const hm = new HealthMonitor();
    expect(hm.getMetrics("p")).toBeNull();
    expect(hm.getSuccessRate("p")).toBeNull();
    expect(hm.isHealthy("p")).toBe(true); // no data → assume healthy
  });

  it("records successes and computes average latency from successes", () => {
    const hm = new HealthMonitor();
    hm.recordRequest("p", ok(10));
    hm.recordRequest("p", ok(30));
    const m = hm.getMetrics("p")!;
    expect(m.successCount).toBe(2);
    expect(m.failureCount).toBe(0);
    expect(m.avgLatencyMs).toBe(20);
    expect(hm.getSuccessRate("p")).toBe(1);
  });

  it("tracks consecutive failures and resets them on success", () => {
    const hm = new HealthMonitor();
    hm.recordRequest("p", fail());
    hm.recordRequest("p", fail());
    expect(hm.getMetrics("p")!.consecutiveFailures).toBe(2);
    hm.recordRequest("p", ok());
    expect(hm.getMetrics("p")!.consecutiveFailures).toBe(0);
  });

  it("keeps only the last 10 requests in the sliding window", () => {
    const hm = new HealthMonitor();
    for (let i = 0; i < 10; i++) hm.recordRequest("p", fail());
    for (let i = 0; i < 10; i++) hm.recordRequest("p", ok());
    const m = hm.getMetrics("p")!;
    expect(m.successCount).toBe(10);
    expect(m.failureCount).toBe(0); // failures aged out of the window
  });

  it("computes success rate from the window", () => {
    const hm = new HealthMonitor();
    hm.recordRequest("p", ok());
    hm.recordRequest("p", fail());
    expect(hm.getSuccessRate("p")).toBe(0.5);
  });

  it("updateStatus + isHealthy reflect disabled state", () => {
    const hm = new HealthMonitor();
    hm.recordRequest("p", ok());
    hm.updateStatus("p", "disabled");
    expect(hm.isHealthy("p")).toBe(false);
    hm.updateStatus("p", "degraded");
    expect(hm.isHealthy("p")).toBe(true);
  });

  it("reset clears a provider's metrics", () => {
    const hm = new HealthMonitor();
    hm.recordRequest("p", ok());
    hm.reset("p");
    expect(hm.getMetrics("p")).toBeNull();
  });
});
