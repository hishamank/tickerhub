/**
 * Zod Validation Schemas
 *
 * Runtime validation schemas for all provider responses and market data types.
 * Ensures type safety at runtime when receiving data from external providers.
 */

import { z } from "zod";
import { ValidationError } from "../errors/index.js";

/**
 * Quote Data Schema
 */
export const QuoteDataSchema = z.object({
  symbol: z.string().min(1).max(10),
  price: z.number().positive(),
  open: z.number().positive().optional(),
  high: z.number().positive().optional(),
  low: z.number().positive().optional(),
  close: z.number().positive().optional(),
  previousClose: z.number().positive().optional(),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  volume: z.number().nonnegative().optional(),
  timestamp: z.coerce.date(),
  currency: z.string().optional().default("USD"),
  weekHigh52: z.number().positive().optional(),
  weekLow52: z.number().positive().optional(),
  // Extended hours
  preMarketPrice: z.number().positive().optional(),
  preMarketChange: z.number().optional(),
  preMarketChangePercent: z.number().optional(),
  postMarketPrice: z.number().positive().optional(),
  postMarketChange: z.number().optional(),
  postMarketChangePercent: z.number().optional(),
  marketState: z.string().optional(),
});

export type ValidatedQuoteData = z.infer<typeof QuoteDataSchema>;

/**
 * Dividend Data Schema
 */
export const DividendDataSchema = z.object({
  exDate: z.coerce.date(),
  paymentDate: z.coerce.date().optional(),
  recordDate: z.coerce.date().optional(),
  declaredDate: z.coerce.date().optional(),
  amount: z.number().positive(),
  currency: z.string().optional().default("USD"),
  frequency: z
    .enum(["annual", "semi_annual", "quarterly", "monthly"])
    .optional(),
});

export type ValidatedDividendData = z.infer<typeof DividendDataSchema>;

/**
 * Earnings Data Schema
 */
export const EarningsDataSchema = z.object({
  date: z.coerce.date(),
  fiscalQuarter: z.string(),
  fiscalYear: z.number().int().min(1900).max(2100),
  // Confirmation status for quarter-end placeholder dates
  confirmed: z.boolean().optional(),
  tentativeQuarter: z.string().optional(),
  // EPS data
  estimate: z.number().optional(),
  actual: z.number().optional(),
  surprise: z.number().optional(),
  surprisePercent: z.number().optional(),
  // Revenue data
  revenueEstimate: z.number().optional(),
  revenueActual: z.number().optional(),
  revenueSurprise: z.number().optional(),
  revenueSurprisePercent: z.number().optional(),
});

export type ValidatedEarningsData = z.infer<typeof EarningsDataSchema>;

/**
 * Event Data Schema
 */
export const EventDataSchema = z.object({
  type: z.enum([
    "split",
    "reverse_split",
    "merger",
    "acquisition",
    "spinoff",
    "delisting",
    "ipo",
  ]),
  date: z.coerce.date(),
  description: z.string(),
  details: z
    .object({
      ratio: z.string().optional(),
      acquirer: z.string().optional(),
      ticker: z.string().optional(),
    })
    .passthrough() // Allow additional provider-specific properties
    .optional(),
});

export type ValidatedEventData = z.infer<typeof EventDataSchema>;

/**
 * Rating Data Schema
 */
export const RatingDataSchema = z.object({
  consensus: z.enum(["strong_buy", "buy", "hold", "sell", "strong_sell"]),
  targetPrice: z.number().positive().optional(),
  targetPriceHigh: z.number().positive().optional(),
  targetPriceLow: z.number().positive().optional(),
  numberOfAnalysts: z.number().int().nonnegative(),
  ratings: z
    .array(
      z.object({
        firm: z.string().optional(),
        analyst: z.string().optional(),
        rating: z.string(),
        targetPrice: z.number().positive().optional(),
        date: z.coerce.date().optional(),
      }),
    )
    .optional(),
});

export type ValidatedRatingData = z.infer<typeof RatingDataSchema>;

/**
 * Historical Price Data Schema
 */
export const HistoricalPriceSchema = z.object({
  date: z.string(), // ISO date format YYYY-MM-DD
  close: z.number().positive(),
  volume: z.number().nonnegative().optional(),
  open: z.number().positive().optional(),
  high: z.number().positive().optional(),
  low: z.number().positive().optional(),
});

export type ValidatedHistoricalPrice = z.infer<typeof HistoricalPriceSchema>;

/**
 * Option Greeks Schema
 */
export const OptionGreeksSchema = z.object({
  delta: z.number().optional(),
  gamma: z.number().optional(),
  theta: z.number().optional(),
  vega: z.number().optional(),
  rho: z.number().optional(),
  phi: z.number().optional(),
  bidIv: z.number().optional(),
  midIv: z.number().optional(),
  askIv: z.number().optional(),
  smvVol: z.number().optional(),
});

export type ValidatedOptionGreeks = z.infer<typeof OptionGreeksSchema>;

/**
 * Option Contract Schema
 */
export const OptionContractSchema = z.object({
  symbol: z.string().min(1),
  underlyingSymbol: z.string().min(1).max(10),
  expirationDate: z.coerce.date(),
  strike: z.number().nonnegative(),
  optionType: z.enum(["call", "put"]),
  description: z.string().optional(),
  rootSymbol: z.string().optional(),
  bid: z.number().nonnegative().optional(),
  ask: z.number().nonnegative().optional(),
  last: z.number().nonnegative().optional(),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  volume: z.number().int().nonnegative().optional(),
  openInterest: z.number().int().nonnegative().optional(),
  bidSize: z.number().int().nonnegative().optional(),
  askSize: z.number().int().nonnegative().optional(),
  lastVolume: z.number().int().nonnegative().optional(),
  tradeDate: z.coerce.date().optional(),
  quoteDate: z.coerce.date().optional(),
  greeks: OptionGreeksSchema.optional(),
});

export type ValidatedOptionContract = z.infer<typeof OptionContractSchema>;

/**
 * Option Chain Schema
 */
export const OptionChainSchema = z.object({
  underlyingSymbol: z.string().min(1).max(10),
  expirationDate: z.coerce.date(),
  options: z.array(OptionContractSchema),
});

export type ValidatedOptionChain = z.infer<typeof OptionChainSchema>;

/**
 * Response Metadata Schema
 */
export const ResponseMetadataSchema = z.object({
  source: z.enum(["cache", "provider"]),
  provider: z.string(),
  cached: z.boolean(),
  stale: z.boolean(),
  retrievedAt: z.coerce.date(),
  latencyMs: z.number().int().nonnegative(),
  warnings: z.array(z.string()).optional(),
});

export type ValidatedResponseMetadata = z.infer<typeof ResponseMetadataSchema>;

/**
 * Market Data Response Schema (generic)
 */
export const createMarketDataResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
) => {
  return z.object({
    data: dataSchema,
    metadata: ResponseMetadataSchema,
  });
};

/**
 * Helper function to safely parse and validate data
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => i.message).join(", ");
      throw new ValidationError(`Validation failed in ${context}: ${issues}`);
    }
    throw error;
  }
}

/**
 * Helper function to safely parse with default fallback
 */
export function validateDataSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  defaultValue: T,
): T {
  const result = schema.safeParse(data);
  return result.success ? result.data : defaultValue;
}
