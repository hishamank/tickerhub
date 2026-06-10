import { describe, it, expect, vi, afterEach } from "vitest";
import { RecoveryManager } from "./recovery-manager.js";

afterEach(() => vi.useRealTimers());

describe("RecoveryManager", () => {
  it("disables and reports a provider as disabled", () => {
    const rm = new RecoveryManager();
    rm.disableProvider("finnhub", "too many failures");
    expect(rm.isDisabled("finnhub")).toBe(true);
    expect(rm.getDisabledInfo("finnhub")?.disabledReason).toBe(
      "too many failures",
    );
    expect(rm.getDisabledProviders()).toHaveLength(1);
  });

  it("is not ready for recovery until the recovery period elapses", () => {
    vi.useFakeTimers();
    const rm = new RecoveryManager({
      recoveryPeriodMs: 1000,
      maxRecoveryAttempts: -1,
      exponentialBackoff: false,
    });
    rm.disableProvider("p", "x");
    expect(rm.isReadyForRecovery("p")).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rm.isReadyForRecovery("p")).toBe(true);
  });

  it("attemptRecovery increments attempts and applies exponential backoff", () => {
    vi.useFakeTimers();
    const rm = new RecoveryManager({
      recoveryPeriodMs: 1000,
      maxRecoveryAttempts: -1,
      exponentialBackoff: true,
    });
    rm.disableProvider("p", "x");
    vi.advanceTimersByTime(1001);
    expect(rm.attemptRecovery("p")).toBe(true); // attempt 1 (period was 1000)
    // After 1 attempt, backoff doubles → needs 2000ms; 1001 not enough.
    expect(rm.isReadyForRecovery("p")).toBe(false);
    vi.advanceTimersByTime(2001);
    expect(rm.isReadyForRecovery("p")).toBe(true);
  });

  it("stops recovering after maxRecoveryAttempts", () => {
    vi.useFakeTimers();
    const rm = new RecoveryManager({
      recoveryPeriodMs: 1000,
      maxRecoveryAttempts: 1,
      exponentialBackoff: false,
    });
    rm.disableProvider("p", "x");
    vi.advanceTimersByTime(1001);
    expect(rm.attemptRecovery("p")).toBe(true);
    vi.advanceTimersByTime(100000);
    expect(rm.isReadyForRecovery("p")).toBe(false); // hit the cap
  });

  it("enableProvider clears the disabled entry", () => {
    const rm = new RecoveryManager();
    rm.disableProvider("p", "x");
    rm.enableProvider("p");
    expect(rm.isDisabled("p")).toBe(false);
  });
});
