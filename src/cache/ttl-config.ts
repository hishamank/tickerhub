/**
 * TTL Configuration
 *
 * Defines Time-To-Live configurations for different operations.
 *
 * Philosophy:
 * - Quotes: Short TTL, real-time data
 * - Dividends/Earnings: Long TTL, infrequent changes
 * - Historical: Very long TTL, immutable data
 */

import type { TTLConfig } from '../types/cache.js';

/**
 * TTL configuration per operation
 */
const TTL_CONFIG: Record<string, TTLConfig> = {
  // Quotes - real-time data
  getQuote: { staleAfter: 60, maxAge: 300 }, // 1 min stale, 5 min max
  getBatchQuotes: { staleAfter: 60, maxAge: 300 }, // 1 min stale, 5 min max

  // Dividends - infrequent changes
  getDividends: { staleAfter: 3600, maxAge: 86400 }, // 1 hour stale, 24 hours max
  getDividendCalendar: { staleAfter: 3600, maxAge: 86400 },

  // Earnings - infrequent changes
  getEarnings: { staleAfter: 3600, maxAge: 86400 }, // 1 hour stale, 24 hours max
  getEarningsCalendar: { staleAfter: 3600, maxAge: 86400 },

  // Ratings - daily updates
  getRatings: { staleAfter: 3600, maxAge: 86400 }, // 1 hour stale, 24 hours max
  getPriceTargets: { staleAfter: 3600, maxAge: 86400 },

  // Events - infrequent
  getEvents: { staleAfter: 3600, maxAge: 86400 }, // 1 hour stale, 24 hours max
  getSplits: { staleAfter: 3600, maxAge: 86400 },

  // Historical - immutable
  getHistoricalPrices: { staleAfter: 86400, maxAge: 604800 }, // 24 hours stale, 7 days max

  // Options - delayed but more dynamic than dividends
  getOptionChain: { staleAfter: 900, maxAge: 3600 }, // 15 min stale, 1 hour max

  // Company info - rarely changes
  getCompanyProfile: { staleAfter: 86400, maxAge: 604800 }, // 24 hours stale, 7 days max

  // Macro indicators - infrequent updates (monthly/quarterly)
  getMacroIndicator: { staleAfter: 3600, maxAge: 86400 }, // 1 hour stale, 24 hours max
};

const DEFAULT_TTL: TTLConfig = { staleAfter: 300, maxAge: 3600 }; // 5 min stale, 1 hour max

/**
 * Get TTL configuration for a function
 */
export function getTTL(functionName: string): TTLConfig {
  return TTL_CONFIG[functionName] || DEFAULT_TTL;
}

/**
 * Set TTL configuration for a function (for testing or runtime config)
 */
export function setTTL(functionName: string, config: TTLConfig): void {
  TTL_CONFIG[functionName] = config;
}

export { TTL_CONFIG };
