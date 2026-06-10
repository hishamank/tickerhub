/**
 * Macro Indicator Data Types
 *
 * Defines data structures for macroeconomic indicators fetched from
 * providers like Nasdaq Data Link (FRED datasets).
 */

import { z } from "zod";

/**
 * Macroeconomic indicator data returned by macro data providers.
 * Note: Optional properties use `| undefined` for exactOptionalPropertyTypes compatibility.
 */
export interface MacroIndicatorData {
  /** FRED series ID (e.g., "GDP", "CPIAUCSL", "FEDFUNDS") */
  indicator: string;
  /** Human-readable name (e.g., "Gross Domestic Product") */
  name: string;
  /** Latest observed value */
  value: number;
  /** Previous period value */
  previousValue?: number | undefined;
  /** Percent change from previous period */
  changePercent?: number | undefined;
  /** Unit of measurement (e.g., "Percent", "Billions of Dollars", "Index") */
  unit: string;
  /** Observation frequency */
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  /** Date the data was released/published */
  releaseDate: Date;
  /** ISO date string of the observation period (e.g., "2026-01-01") */
  period: string;
  /** Whether the data is seasonally adjusted */
  seasonallyAdjusted: boolean;
  /** Data source identifier */
  source: string;
}

/**
 * Zod schema for runtime validation of macro indicator data
 */
export const MacroIndicatorDataSchema = z.object({
  indicator: z.string().min(1).max(50),
  name: z.string().min(1),
  value: z.number(),
  previousValue: z.number().optional(),
  changePercent: z.number().optional(),
  unit: z.string().min(1),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  releaseDate: z.coerce.date(),
  period: z.string().min(1),
  seasonallyAdjusted: z.boolean(),
  source: z.string().min(1),
});
