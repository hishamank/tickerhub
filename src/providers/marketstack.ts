import { ConfigurationError } from "../errors/index.js";
import { BaseProvider } from "./base-provider.js";
import type { DataType, QuoteData, RateLimitConfig } from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { QuoteDataSchema, validateData } from "../types/validation.js";

interface MarketstackEodRecord {
  symbol?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  date?: string;
}

interface MarketstackErrorPayload {
  error?: {
    code?: string | number;
    message?: string;
  };
}

interface MarketstackLatestResponse extends MarketstackErrorPayload {
  data?: MarketstackEodRecord[];
}

export class MarketstackProvider extends BaseProvider {
  readonly name = "marketstack";
  readonly supportedDataTypes: DataType[] = ["prices"];
  readonly rateLimit: RateLimitConfig = {
    requestsPerDay: 3,
    monthlyLimit: 100,
    burstLimit: 1,
  };

  private readonly apiKey: string;
  private readonly baseUrl = "http://api.marketstack.com";

  constructor(credentials: Record<string, string> | null) {
    super();

    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Marketstack API key is required");
    }

    this.apiKey = apiKey;
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);

    const normalizedSymbol = symbol.toUpperCase();
    const url = new URL("/v1/eod/latest", this.baseUrl);
    url.searchParams.set("access_key", this.apiKey);
    url.searchParams.set("symbols", normalizedSymbol);
    url.searchParams.set("limit", "1");

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw this.mapHttpError(response.status);
      }

      const payload = (await response.json()) as MarketstackLatestResponse;
      if (payload.error) {
        throw this.mapPayloadError(payload.error.message);
      }

      const record = payload.data?.find((item) => item.symbol === normalizedSymbol)
        ?? payload.data?.[0];

      if (!record?.close || !record.date) {
        return null;
      }

      return validateData(
        QuoteDataSchema,
        {
          symbol: normalizedSymbol,
          price: record.close,
          open: record.open,
          high: record.high,
          low: record.low,
          close: record.close,
          volume: record.volume,
          timestamp: new Date(record.date),
        },
        `Marketstack quote for ${normalizedSymbol}`,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      return this.handleHttpError(error, `fetchQuote(${normalizedSymbol})`);
    }
  }

  private mapHttpError(status: number): ProviderError {
    if (status === 401 || status === 403) {
      return new ProviderError(
        ProviderErrorCode.AUTHENTICATION_FAILED,
        "Marketstack authentication failed - check API key",
        false,
      );
    }

    if (status === 404) {
      return new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        "Marketstack symbol not found",
        false,
      );
    }

    if (status === 429) {
      return new ProviderError(
        ProviderErrorCode.RATE_LIMIT_EXCEEDED,
        "Marketstack rate limit exceeded",
        true,
        86400,
      );
    }

    return new ProviderError(
      ProviderErrorCode.NETWORK_ERROR,
      `Marketstack API returned ${status}`,
      true,
    );
  }

  private mapPayloadError(message?: string): ProviderError {
    const normalizedMessage = message?.toLowerCase() ?? "";

    if (normalizedMessage.includes("access key")) {
      return new ProviderError(
        ProviderErrorCode.AUTHENTICATION_FAILED,
        message ?? "Marketstack authentication failed",
        false,
      );
    }

    if (
      normalizedMessage.includes("rate limit")
      || normalizedMessage.includes("usage limit")
    ) {
      return new ProviderError(
        ProviderErrorCode.RATE_LIMIT_EXCEEDED,
        message ?? "Marketstack rate limit exceeded",
        true,
        86400,
      );
    }

    if (normalizedMessage.includes("invalid symbol")) {
      return new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        message ?? "Marketstack symbol not found",
        false,
      );
    }

    return new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      message ?? "Marketstack returned an unknown error",
      true,
    );
  }
}
