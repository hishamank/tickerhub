/**
 * Rate Limit Tracker
 *
 * Tracks per-key rate limit consumption during a worker run.
 * Budget is PER KEY (each user's key gets its own budget), not global.
 * Key = hash of credentials (never store raw keys in memory maps).
 *
 * Supports both per-minute and per-day limits concurrently.
 */

import { createHash } from "node:crypto";
import { getLogger } from "../logging/index.js";

const logger = getLogger("rate-limit-tracker", "packages/provider-aggregator");

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface RateLimitWindow {
  used: number;
  limit: number;
  windowStart: number;
  windowMs: number;
}

interface ProviderLimits {
  minute?: RateLimitWindow;
  day?: RateLimitWindow;
}

export class RateLimitTracker {
  private consumption = new Map<string, Map<string, ProviderLimits>>();

  record(
    credentials: Record<string, string> | null,
    providerName: string,
    minuteLimit: number | null,
    dayLimit: number | null,
  ): void {
    const keyHash = this.hashCredentials(credentials);
    const now = Date.now();

    if (!this.consumption.has(keyHash)) {
      this.consumption.set(keyHash, new Map());
    }

    const providerMap = this.consumption.get(keyHash)!;
    let limits = providerMap.get(providerName);

    if (!limits) {
      limits = {};
      providerMap.set(providerName, limits);
    }

    if (minuteLimit !== null) {
      limits.minute = this.recordWindow(
        limits.minute,
        minuteLimit,
        MINUTE_MS,
        now,
      );
    }

    if (dayLimit !== null) {
      limits.day = this.recordWindow(limits.day, dayLimit, DAY_MS, now);
    }

    logger.debug("Rate limit recorded", {
      provider: providerName,
      minuteUsed: limits.minute?.used ?? 0,
      minuteLimit,
      dayUsed: limits.day?.used ?? 0,
      dayLimit,
    });
  }

  private recordWindow(
    window: RateLimitWindow | undefined,
    limit: number,
    windowMs: number,
    now: number,
  ): RateLimitWindow {
    if (window && now - window.windowStart < windowMs) {
      return {
        ...window,
        used: window.used + 1,
      };
    }

    return {
      used: 1,
      limit,
      windowStart: now,
      windowMs,
    };
  }

  isExhausted(
    credentials: Record<string, string> | null,
    providerName: string,
    minuteLimit: number | null,
    dayLimit: number | null,
  ): boolean {
    const keyHash = this.hashCredentials(credentials);
    const providerMap = this.consumption.get(keyHash);

    if (!providerMap) {
      return false;
    }

    const limits = providerMap.get(providerName);
    if (!limits) {
      return false;
    }

    const now = Date.now();

    if (minuteLimit !== null && limits.minute) {
      if (now - limits.minute.windowStart >= limits.minute.windowMs) {
        return false;
      }
      if (limits.minute.used >= limits.minute.limit) {
        return true;
      }
    }

    if (dayLimit !== null && limits.day) {
      if (now - limits.day.windowStart >= limits.day.windowMs) {
        return false;
      }
      if (limits.day.used >= limits.day.limit) {
        return true;
      }
    }

    return false;
  }

  getRemainingBudget(
    credentials: Record<string, string> | null,
    providerName: string,
  ): { minute: number; day: number } {
    const keyHash = this.hashCredentials(credentials);
    const providerMap = this.consumption.get(keyHash);

    if (!providerMap) {
      return { minute: -1, day: -1 };
    }

    const limits = providerMap.get(providerName);
    if (!limits) {
      return { minute: -1, day: -1 };
    }

    const now = Date.now();

    let minuteRemaining = -1;
    if (limits.minute) {
      if (now - limits.minute.windowStart >= limits.minute.windowMs) {
        minuteRemaining = limits.minute.limit;
      } else {
        minuteRemaining = Math.max(0, limits.minute.limit - limits.minute.used);
      }
    }

    let dayRemaining = -1;
    if (limits.day) {
      if (now - limits.day.windowStart >= limits.day.windowMs) {
        dayRemaining = limits.day.limit;
      } else {
        dayRemaining = Math.max(0, limits.day.limit - limits.day.used);
      }
    }

    return { minute: minuteRemaining, day: dayRemaining };
  }

  reset(): void {
    this.consumption.clear();
    logger.debug("Rate limit tracker reset");
  }

  private hashCredentials(credentials: Record<string, string> | null): string {
    if (!credentials) {
      return "no-key";
    }

    const keyString = JSON.stringify(credentials);
    return createHash("sha256").update(keyString).digest("hex").slice(0, 16);
  }
}

let trackerInstance: RateLimitTracker | null = null;

export function getRateLimitTracker(): RateLimitTracker {
  if (!trackerInstance) {
    trackerInstance = new RateLimitTracker();
  }
  return trackerInstance;
}

export function resetRateLimitTracker(): void {
  if (trackerInstance) {
    trackerInstance.reset();
  }
}
