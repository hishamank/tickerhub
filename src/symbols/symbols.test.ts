import { describe, it, expect } from "vitest";
import { getCoinGeckoId, isSupportedCryptoSymbol } from "./crypto.js";
import {
  getCurrencyForSymbol,
  getExchangeForSymbol,
  needsFxConversion,
  extractSuffix,
} from "./exchange-currency.js";
import { resolveTickerMapping } from "./ticker-mapping.js";

describe("crypto mapping", () => {
  it("maps known symbols to CoinGecko IDs (case-insensitive)", () => {
    expect(getCoinGeckoId("BTC")).toBe("bitcoin");
    expect(getCoinGeckoId("eth")).toBe("ethereum");
  });
  it("returns null for unknown symbols", () => {
    expect(getCoinGeckoId("NOTACOIN")).toBeNull();
    expect(isSupportedCryptoSymbol("AAPL")).toBe(false);
    expect(isSupportedCryptoSymbol("BTC")).toBe(true);
  });
});

describe("exchange-currency", () => {
  it("extracts known suffixes", () => {
    expect(extractSuffix("NOVO-B.CO")).toBe(".CO");
    expect(extractSuffix("AAPL")).toBeNull();
  });
  it("resolves currency by suffix, defaulting to USD", () => {
    expect(getCurrencyForSymbol("NOVO-B.CO")).toBe("DKK");
    expect(getCurrencyForSymbol("AZN.L")).toBe("GBP");
    expect(getCurrencyForSymbol("AAPL")).toBe("USD");
  });
  it("resolves exchange code by suffix", () => {
    expect(getExchangeForSymbol("NOVO-B.CO")).toBe("CPH");
    expect(getExchangeForSymbol("AAPL")).toBeNull();
  });
  it("flags non-USD currencies for FX conversion", () => {
    expect(needsFxConversion("DKK")).toBe(true);
    expect(needsFxConversion("USD")).toBe(false);
  });
});

describe("ticker mapping", () => {
  it("resolves a mapped international ticker to its ADR", () => {
    const res = resolveTickerMapping("NOVO-B.CO");
    expect(res.isMapped).toBe(true);
    expect(res.resolved).toBe("NVO");
    expect(res.currency).toBe("DKK");
  });
  it("passes through an unmapped ticker unchanged", () => {
    const res = resolveTickerMapping("AAPL");
    expect(res.isMapped).toBe(false);
    expect(res.resolved).toBe("AAPL");
    expect(res.currency).toBe("USD");
  });
});
