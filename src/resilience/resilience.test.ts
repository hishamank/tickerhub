import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry.js";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import { CircuitState } from "./types.js";

describe("withRetry", () => {
  it("returns on first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { maxRetries: 3, baseDelayMs: 0, jitter: false })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxRetries then throws the last error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 0, jitter: false }),
    ).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("eventually succeeds after transient failures", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "done";
    });
    expect(await withRetry(fn, { maxRetries: 5, baseDelayMs: 0, jitter: false })).toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      withRetry(fn, { maxRetries: 5, baseDelayMs: 0, shouldRetry: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("CircuitBreaker", () => {
  it("opens after the failure threshold and rejects with CircuitOpenError", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000 });
    const fail = async () => {
      throw new Error("x");
    };
    await expect(cb.execute(fail)).rejects.toThrow("x");
    await expect(cb.execute(fail)).rejects.toThrow("x");
    expect(cb.getState()).toBe(CircuitState.OPEN);
    await expect(cb.execute(async () => "y")).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("does not count errors excluded by isFailure", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      isFailure: (e) => !(e instanceof RangeError),
    });
    await expect(
      cb.execute(async () => {
        throw new RangeError("ignored");
      }),
    ).rejects.toThrow("ignored");
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("transitions to HALF_OPEN then CLOSED after a successful reset", async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    await expect(
      cb.execute(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    expect(cb.getState()).toBe(CircuitState.OPEN);
    vi.advanceTimersByTime(1001);
    expect(await cb.execute(async () => "recovered")).toBe("recovered");
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    vi.useRealTimers();
  });
});
