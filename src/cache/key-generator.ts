/**
 * Cache Key Generator
 *
 * Auto-generates cache keys from function name and parameters.
 * Ensures consistent, predictable cache keys across the application.
 */

/**
 * Auto-generate cache key from function name and parameters
 *
 * Examples:
 * - generateCacheKey('getQuote', 'AAPL') → 'provider-aggregator:getQuote:AAPL'
 * - generateCacheKey('getDividends', 'MSFT', { limit: 12 }) → 'provider-aggregator:getDividends:MSFT:limit=12'
 * - generateCacheKey('getEarnings', 'GOOGL', '2024-01-15') → 'provider-aggregator:getEarnings:GOOGL:2024-01-15'
 */
export function generateCacheKey(
  functionName: string,
  ...params: unknown[]
): string {
  const prefix = 'provider-aggregator';

  const paramString = params
    .map((p) => {
      if (p === null || p === undefined) return '';
      if (typeof p === 'object') {
        // Sort keys for consistent cache keys
        return Object.entries(p as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join(':');
      }
      return String(p);
    })
    .filter(Boolean)
    .join(':');

  return paramString ? `${prefix}:${functionName}:${paramString}` : `${prefix}:${functionName}`;
}

/**
 * Parse cache key back to components (for debugging/logging)
 */
export function parseCacheKey(key: string): {
  prefix: string;
  functionName: string;
  params: string[];
} {
  const parts = key.split(':');
  return {
    prefix: parts[0] || '',
    functionName: parts[1] || '',
    params: parts.slice(2),
  };
}
