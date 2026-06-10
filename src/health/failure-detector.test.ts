import { describe, it, expect } from "vitest";
import { FailureDetector } from "./failure-detector.js";
import type { HealthMetrics } from "./health-monitor.js";

function metrics(over: Partial<HealthMetrics> = {}): HealthMetrics {
  return {
    successCount: 0,
    failureCount: 0,
    avgLatencyMs: 0,
    consecutiveFailures: 0,
    status: "enabled",
    ...over,
  };
}

describe("FailureDetector", () => {
  const detector = new FailureDetector();

  it("disables after 3 consecutive failures", () => {
    expect(
      detector.shouldDisableProvider(metrics({ consecutiveFailures: 3 })),
    ).toBe(true);
    expect(
      detector.shouldDisableProvider(metrics({ consecutiveFailures: 2 })),
    ).toBe(false);
  });

  it("disables on >50% failure rate once enough requests exist", () => {
    expect(
      detector.shouldDisableProvider(
        metrics({ successCount: 4, failureCount: 6 }),
      ),
    ).toBe(true);
    // Below the minimum request count → not enough signal
    expect(
      detector.shouldDisableProvider(
        metrics({ successCount: 1, failureCount: 4 }),
      ),
    ).toBe(false);
  });

  it("never disables an already-disabled provider", () => {
    expect(
      detector.shouldDisableProvider(
        metrics({ consecutiveFailures: 5, status: "disabled" }),
      ),
    ).toBe(false);
  });

  it("degrades when failure rate is between 30% and 50%", () => {
    expect(
      detector.shouldDegradeProvider(
        metrics({ successCount: 6, failureCount: 4 }),
      ),
    ).toBe(true);
    expect(
      detector.shouldDegradeProvider(
        metrics({ successCount: 8, failureCount: 2 }),
      ),
    ).toBe(false); // 20% → healthy
  });

  it("respects custom thresholds", () => {
    const strict = new FailureDetector({
      consecutiveFailures: 1,
      failureRateThreshold: 0.5,
      minRequestsForRate: 1,
    });
    expect(
      strict.shouldDisableProvider(metrics({ consecutiveFailures: 1 })),
    ).toBe(true);
  });
});
