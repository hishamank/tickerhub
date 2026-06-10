/**
 * Rate Limit Configuration
 *
 * Centralized rate limit configurations for all providers (free tier).
 */

import type { RateLimitConfig } from "../types/provider.js";

/**
 * Provider rate limit configurations (free tier)
 */
export const PROVIDER_RATE_LIMITS: Record<string, RateLimitConfig> = {
  "yahoo-finance": {
    requestsPerMinute: 100, // Unofficial, be conservative
    requestsPerHour: 2000,
    requestsPerDay: null, // No daily limit
    burstLimit: 10,
  },
  finnhub: {
    requestsPerMinute: 60,
    requestsPerHour: null,
    requestsPerDay: null,
    burstLimit: 30, // Global 30/sec limit
  },
  fmp: {
    requestsPerMinute: null,
    requestsPerHour: null,
    requestsPerDay: 250, // Very limited free tier
    burstLimit: 5,
  },
  polygon: {
    requestsPerMinute: 5,
    requestsPerHour: null,
    requestsPerDay: null,
    burstLimit: 1,
  },
  "alpha-vantage": {
    requestsPerMinute: 5,
    requestsPerHour: null,
    requestsPerDay: 500,
    burstLimit: 5,
  },
  tiingo: {
    requestsPerMinute: null,
    requestsPerHour: 1000,
    requestsPerDay: null,
    burstLimit: 20,
    monthlyLimit: 50000,
  },
  "twelve-data": {
    requestsPerMinute: 8,
    requestsPerHour: null,
    requestsPerDay: 800,
    burstLimit: 4,
  },
  marketstack: {
    requestsPerMinute: null,
    requestsPerHour: null,
    requestsPerDay: 3,
    burstLimit: 1,
    // The active smart-aggregator path only consumes minute/day metadata.
    monthlyLimit: 100,
  },
  alpaca: {
    requestsPerMinute: 200, // Conservative (actual limit: 10,000/min)
    requestsPerHour: null,
    requestsPerDay: null,
    burstLimit: 50,
  },
  "nasdaq-data-link": {
    requestsPerMinute: 10,
    requestsPerHour: null,
    requestsPerDay: 50, // Free tier: 50 calls/day
    burstLimit: 3,
  },
};

export function getRateLimitConfig(providerId: string): RateLimitConfig | null {
  return PROVIDER_RATE_LIMITS[providerId] || null;
}
