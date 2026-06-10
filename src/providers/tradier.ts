import { Decimal } from "decimal.js";
import { ConfigurationError } from "../errors/index.js";
import { getLogger } from "../logging/index.js";
import { BaseProvider } from "./base-provider.js";
import type {
  DataType,
  HistoricalPrice,
  OptionChain,
  OptionContract,
  QuoteData,
  RateLimitConfig,
} from "../types/index.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import {
  HistoricalPriceSchema,
  OptionChainSchema,
  OptionContractSchema,
  QuoteDataSchema,
  validateData,
} from "../types/validation.js";
import type {
  TradierHistoryResponse,
  TradierOptionPayload,
  TradierOptionsResponse,
  TradierQuoteResponse,
} from "./tradier-types.js";
import {
  normalizeTradierOptionType,
  toTradierArray,
  toTradierIsoDate,
  toTradierNumber,
  toTradierTradeDate,
} from "./tradier-utils.js";

const logger = getLogger(
  "tradier",
  "packages/provider-aggregator/src/providers/tradier.ts",
);

export class TradierProvider extends BaseProvider {
  readonly name = "tradier";
  readonly supportedDataTypes: DataType[] = ["prices", "options"];
  readonly rateLimit: RateLimitConfig = {
    monthlyLimit: 5000,
  };

  private readonly apiKey: string;
  private readonly baseUrl = "https://sandbox.tradier.com/v1";

  constructor(credentials: Record<string, string> | null) {
    super();
    const apiKey = credentials?.api_key;
    if (!apiKey) {
      throw new ConfigurationError("Tradier API key is required");
    }
    this.apiKey = apiKey;
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const response = await this.requestJson<TradierQuoteResponse>(
      "/markets/quotes",
      { symbols: normalizedSymbol, greeks: "false" },
      `fetchQuote(${normalizedSymbol})`,
    );

    const quote = toTradierArray(response.quotes?.quote)[0];
    if (!quote) {
      return null;
    }

    const price = toTradierNumber(quote.last);
    if (price === undefined) return null;
    const previousClose = toTradierNumber(quote.prevclose);
    const change = toTradierNumber(quote.change)
      ?? (previousClose !== undefined
        ? new Decimal(price).minus(previousClose).toNumber()
        : undefined);
    const changePercent = toTradierNumber(quote.change_percentage)
      ?? (change !== undefined && previousClose && previousClose !== 0
        ? new Decimal(change).dividedBy(previousClose).times(100).toNumber()
        : undefined);

    return validateData(
      QuoteDataSchema,
      {
        symbol: normalizedSymbol,
        price,
        open: toTradierNumber(quote.open),
        high: toTradierNumber(quote.high),
        low: toTradierNumber(quote.low),
        previousClose,
        change,
        changePercent,
        volume: toTradierNumber(quote.volume),
        timestamp: toTradierTradeDate(quote.trade_date) ?? new Date(),
        currency: "USD",
      },
      `Tradier quote for ${normalizedSymbol}`,
    );
  }

  async fetchHistoricalPrices(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<HistoricalPrice[]> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const response = await this.requestJson<TradierHistoryResponse>(
      "/markets/history",
      {
        symbol: normalizedSymbol,
        interval: "daily",
        start: toTradierIsoDate(from),
        end: toTradierIsoDate(to),
      },
      `fetchHistoricalPrices(${normalizedSymbol})`,
    );

    return toTradierArray(response.history?.day)
      .filter((day) => toTradierNumber(day.close) !== undefined && day.date)
      .map((day) =>
        validateData(
          HistoricalPriceSchema,
          {
            date: day.date,
            close: toTradierNumber(day.close),
            open: toTradierNumber(day.open),
            high: toTradierNumber(day.high),
            low: toTradierNumber(day.low),
            volume: toTradierNumber(day.volume),
          },
          `Tradier historical price for ${normalizedSymbol}`,
        ),
      );
  }

  async fetchOptionChain(
    symbol: string,
    expirationDate: Date,
  ): Promise<OptionChain | null> {
    this.validateSymbol(symbol);
    const normalizedSymbol = symbol.toUpperCase();
    const response = await this.requestJson<TradierOptionsResponse>(
      "/markets/options/chains",
      {
        symbol: normalizedSymbol,
        expiration: toTradierIsoDate(expirationDate),
        greeks: "true",
      },
      `fetchOptionChain(${normalizedSymbol}, ${toTradierIsoDate(expirationDate)})`,
    );

    const contracts = toTradierArray(response.options?.option)
      .map((option) => this.toOptionContract(normalizedSymbol, option))
      .filter((contract): contract is OptionContract => contract !== null)
      .map((contract) =>
        validateData(
          OptionContractSchema,
          contract,
          `Tradier option contract for ${normalizedSymbol}`,
        ),
      );

    if (contracts.length === 0) return null;
    return validateData(
      OptionChainSchema,
      {
        underlyingSymbol: normalizedSymbol,
        expirationDate,
        options: contracts,
      },
      `Tradier option chain for ${normalizedSymbol}`,
    );
  }

  private async requestJson<T>(
    path: string,
    params: Record<string, string>,
    context: string,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw this.mapHttpError(response.status);
      }

      return await response.json() as T;
    } catch (error) {
      logger.error("Tradier request failed", {
        context,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.handleHttpError(error, context);
    }
  }

  private mapHttpError(status: number): ProviderError {
    if (status === 400) {
      return new ProviderError(
        ProviderErrorCode.INVALID_REQUEST,
        "Tradier request was invalid",
        false,
      );
    }

    if (status === 401 || status === 403) {
      return new ProviderError(
        ProviderErrorCode.AUTHENTICATION_FAILED,
        "Tradier authentication failed - check API key",
        false,
      );
    }

    if (status === 404) {
      return new ProviderError(
        ProviderErrorCode.SYMBOL_NOT_FOUND,
        "Tradier symbol not found",
        false,
      );
    }

    if (status === 429) {
      return new ProviderError(
        ProviderErrorCode.RATE_LIMIT_EXCEEDED,
        "Tradier rate limit exceeded",
        true,
        60,
      );
    }

    return new ProviderError(
      ProviderErrorCode.PROVIDER_ERROR,
      `Tradier API returned ${status}`,
      status >= 500,
    );
  }

  private toOptionContract(
    underlyingSymbol: string,
    option: TradierOptionPayload,
  ): OptionContract | null {
    const optionSymbol = option.symbol;
    const expirationDate = option.expiration_date;
    const strike = toTradierNumber(option.strike);
    const optionType = normalizeTradierOptionType(option.option_type);

    if (!optionSymbol || !expirationDate || strike === undefined || !optionType) return null;
    return {
      symbol: optionSymbol,
      underlyingSymbol,
      expirationDate: new Date(expirationDate),
      strike,
      optionType,
      description: option.description,
      rootSymbol: option.root_symbol,
      bid: toTradierNumber(option.bid),
      ask: toTradierNumber(option.ask),
      last: toTradierNumber(option.last),
      change: toTradierNumber(option.change),
      changePercent: toTradierNumber(option.change_percentage),
      volume: toTradierNumber(option.volume),
      openInterest: toTradierNumber(option.open_interest),
      bidSize: toTradierNumber(option.bid_size),
      askSize: toTradierNumber(option.ask_size),
      lastVolume: toTradierNumber(option.last_volume),
      tradeDate: toTradierTradeDate(option.trade_date),
      quoteDate: toTradierTradeDate(option.trade_date),
      greeks: option.greeks
        ? {
            delta: toTradierNumber(option.greeks.delta),
            gamma: toTradierNumber(option.greeks.gamma),
            theta: toTradierNumber(option.greeks.theta),
            vega: toTradierNumber(option.greeks.vega),
            rho: toTradierNumber(option.greeks.rho),
            phi: toTradierNumber(option.greeks.phi),
            bidIv: toTradierNumber(option.greeks.bid_iv),
            midIv: toTradierNumber(option.greeks.mid_iv),
            askIv: toTradierNumber(option.greeks.ask_iv),
            smvVol: toTradierNumber(option.greeks.smv_vol),
          }
        : undefined,
    };
  }
}
