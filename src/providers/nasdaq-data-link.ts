/**
 * Nasdaq Data Link Provider
 *
 * Implements macroeconomic data fetching via the Nasdaq Data Link API
 * (formerly Quandl). Primary value is FRED datasets: GDP, CPI, interest
 * rates, treasury yields, and unemployment data.
 */

import { getLogger } from "../logging/index.js";
import { ConfigurationError } from "../errors/index.js";
import { BaseProvider } from "./base-provider.js";
import type {
  QuoteData,
  MacroIndicatorData,
  DataType,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { MacroIndicatorDataSchema } from "../types/macro.js";
import { validateData } from "../types/validation.js";

const logger = getLogger(
  "nasdaq-data-link",
  "packages/provider-aggregator/src/providers/nasdaq-data-link.ts",
);

const FRED_SERIES_METADATA: Record<
  string,
  { name: string; unit: string; frequency: MacroIndicatorData["frequency"]; seasonallyAdjusted: boolean }
> = {
  GDP: { name: "Gross Domestic Product", unit: "Billions of Dollars", frequency: "quarterly", seasonallyAdjusted: true },
  CPIAUCSL: { name: "Consumer Price Index for All Urban Consumers", unit: "Index 1982-1984=100", frequency: "monthly", seasonallyAdjusted: true },
  FEDFUNDS: { name: "Federal Funds Effective Rate", unit: "Percent", frequency: "monthly", seasonallyAdjusted: false },
  DGS10: { name: "10-Year Treasury Constant Maturity Rate", unit: "Percent", frequency: "daily", seasonallyAdjusted: false },
  DGS2: { name: "2-Year Treasury Constant Maturity Rate", unit: "Percent", frequency: "daily", seasonallyAdjusted: false },
  UNRATE: { name: "Unemployment Rate", unit: "Percent", frequency: "monthly", seasonallyAdjusted: true },
  T10Y2Y: { name: "10-Year Treasury Minus 2-Year Treasury Yield Spread", unit: "Percent", frequency: "daily", seasonallyAdjusted: false },
};

const BASE_URL = "https://data.nasdaq.com/api/v3/datasets/FRED";

export class NasdaqDataLinkProvider extends BaseProvider {
  readonly name = "nasdaq-data-link";
  readonly supportedDataTypes: DataType[] = ["macro"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerMinute: 10,
    requestsPerDay: 50,
    burstLimit: 3,
  };

  private apiKey: string;

  constructor(credentials: Record<string, string> | null) {
    super();

    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Nasdaq Data Link API key is required");
    }

    this.apiKey = apiKey;
  }

  async fetchQuote(_symbol: string): Promise<QuoteData | null> {
    return null;
  }

  async fetchMacroIndicator(
    indicator: string,
  ): Promise<MacroIndicatorData | null> {
    const seriesId = indicator.toUpperCase();

    try {
      const url = this.buildUrl(seriesId);
      const response = await fetch(url);

      if (!response.ok) {
        return this.handleApiError(response, seriesId);
      }

      const data: unknown = await response.json();
      return this.parseResponse(data, seriesId);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      return this.handleHttpError(error, `fetchMacroIndicator(${seriesId})`);
    }
  }

  async fetchMultipleIndicators(
    indicators: string[],
  ): Promise<MacroIndicatorData[]> {
    const results: MacroIndicatorData[] = [];

    for (const indicator of indicators) {
      try {
        const data = await this.fetchMacroIndicator(indicator);
        if (data) {
          results.push(data);
        }
      } catch (error: unknown) {
        logger.warn(`Failed to fetch indicator ${indicator}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  override async healthCheck(): Promise<boolean> {
    try {
      const url = `${BASE_URL}/GDP.json?api_key=${this.apiKey}&rows=1`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      logger.error("[nasdaq-data-link] Health check failed");
      return false;
    }
  }

  private buildUrl(seriesId: string): string {
    return `${BASE_URL}/${seriesId}.json?api_key=${this.apiKey}&rows=2&order=desc`;
  }

  private handleApiError(
    response: Response,
    seriesId: string,
  ): never | null {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new ProviderError(
        ProviderErrorCode.AUTHENTICATION_FAILED,
        "Nasdaq Data Link API key is invalid or expired",
        false,
      );
    }

    if (response.status === 429) {
      throw new ProviderError(
        ProviderErrorCode.RATE_LIMIT_EXCEEDED,
        "Nasdaq Data Link rate limit exceeded",
        true,
        60,
      );
    }

    if (response.status === 404) {
      logger.warn(`[nasdaq-data-link] Series ${seriesId} not found`);
      return null;
    }

    throw new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      `Nasdaq Data Link API returned ${response.status} for ${seriesId}`,
      true,
    );
  }

  private parseResponse(
    raw: unknown,
    seriesId: string,
  ): MacroIndicatorData | null {
    const body = raw as {
      dataset?: {
        name?: string;
        frequency?: string;
        data?: Array<Array<string | number>>;
        newest_available_date?: string;
      };
    };

    const dataset = body?.dataset;
    if (!dataset?.data || dataset.data.length === 0) {
      logger.warn(`[nasdaq-data-link] No data for series ${seriesId}`);
      return null;
    }

    const latestRow = dataset.data[0];
    if (!latestRow || latestRow.length < 2) {
      return null;
    }

    const period = String(latestRow[0]);
    const value = Number(latestRow[1]);

    if (Number.isNaN(value)) {
      logger.warn(`[nasdaq-data-link] Non-numeric value for ${seriesId}`);
      return null;
    }

    let previousValue: number | undefined;
    let changePercent: number | undefined;
    const previousRow = dataset.data[1];
    if (previousRow && previousRow.length >= 2) {
      const prev = Number(previousRow[1]);
      if (!Number.isNaN(prev)) {
        previousValue = prev;
        if (prev !== 0) {
          changePercent = ((value - prev) / Math.abs(prev)) * 100;
        }
      }
    }

    const meta = FRED_SERIES_METADATA[seriesId];
    const frequency = meta?.frequency ?? this.mapFrequency(dataset.frequency);

    return validateData(
      MacroIndicatorDataSchema,
      {
        indicator: seriesId,
        name: meta?.name ?? dataset.name ?? seriesId,
        value,
        previousValue,
        changePercent,
        unit: meta?.unit ?? "Units",
        frequency,
        releaseDate: new Date(dataset.newest_available_date ?? period),
        period,
        seasonallyAdjusted: meta?.seasonallyAdjusted ?? false,
        source: "nasdaq-data-link",
      },
      `Nasdaq Data Link macro for ${seriesId}`,
    );
  }

  private mapFrequency(
    freq?: string,
  ): MacroIndicatorData["frequency"] {
    switch (freq?.toLowerCase()) {
      case "daily":
        return "daily";
      case "weekly":
        return "weekly";
      case "monthly":
        return "monthly";
      case "quarterly":
        return "quarterly";
      default:
        return "monthly";
    }
  }
}
