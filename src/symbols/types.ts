/**
 * Symbol-mapping types.
 *
 * `TickerMapping` is vendored from the source monorepo's `@repo/types`.
 */

/** International ticker → US ADR mapping entry. */
export interface TickerMapping {
  /** Original international ticker symbol. */
  original: string;
  /** US ADR equivalent ticker symbol. */
  adr: string;
  /** Original exchange. */
  originalExchange: string;
  /** US exchange where the ADR trades. */
  adrExchange: string;
  /** Company name. */
  companyName: string;
  /** Country of origin. */
  country: string;
  /** Native currency of the original exchange (ISO 4217). */
  currency?: string;
}

/** Result of resolving a ticker to its US-traded equivalent. */
export interface TickerResolution {
  original: string;
  resolved: string;
  isMapped: boolean;
  mapping?: TickerMapping;
  /** Native currency of the ticker's exchange (ISO 4217). */
  currency: string;
  /** Exchange code (e.g. CPH, LSE, TSE). */
  exchange: string | null;
}
