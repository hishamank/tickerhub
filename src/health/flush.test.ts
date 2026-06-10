import { describe, it, expect } from "vitest";
import { flushHealthMetrics } from "./flush.js";
import { HealthMonitor } from "./health-monitor.js";
import { InMemoryHealthStore } from "../adapters/stores/in-memory-health-store.js";

describe("flushHealthMetrics", () => {
  it("snapshots every tracked provider into the store", async () => {
    const monitor = new HealthMonitor();
    const store = new InMemoryHealthStore();
    monitor.recordRequest("finnhub", {
      success: true,
      latencyMs: 10,
      timestamp: new Date(0),
    });
    monitor.recordRequest("polygon", {
      success: false,
      latencyMs: 0,
      timestamp: new Date(0),
      error: "x",
    });

    const written = await flushHealthMetrics(monitor, store, new Date(1000));
    expect(written).toBe(2);

    const finnhub = await store.getRecentMetrics("finnhub", 10);
    expect(finnhub).toHaveLength(1);
    expect(finnhub[0]?.successCount).toBe(1);
    expect(finnhub[0]?.timestamp.getTime()).toBe(1000);

    const polygon = await store.getRecentMetrics("polygon", 10);
    expect(polygon[0]?.failureCount).toBe(1);
  });

  it("writes nothing when no providers have been seen", async () => {
    const written = await flushHealthMetrics(
      new HealthMonitor(),
      new InMemoryHealthStore(),
    );
    expect(written).toBe(0);
  });
});
