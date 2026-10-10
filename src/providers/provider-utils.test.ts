import { describe, expect, it } from "vitest";
import { validateSymbol } from "./provider-utils.js";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";
import { QuoteDataSchema } from "../types/validation.js";

describe("validateSymbol", () => {
  it.each([
    "^GSPC", "^VIX", "AED=X", "GC=F",
    "^gspc", "^vix", "aed=x", "gc=f",
    "AAPL", "NOVO-B.CO", "BTC-USD", "123456789012345",
  ])("accepts %s", (symbol) => {
    expect(() => validateSymbol(symbol)).not.toThrow();
  });

  it.each([
    "", " ", "\t", "\n", " AAPL", "AAPL ", "AA PL", "AA\tPL", "AA\nPL",
    "1234567890123456", "EUR/USD", "../AAPL", "AA\\PL",
    "AA:PL", "AA;PL", "AA<PL", "AA>PL", "AA@PL", "AA_PL",
    "AA?PL", "AA&PL", "AA#PL", "AA%PL", "AA$PL", "AA|PL",
    "AA*PL", "AA+PL", "AA(PL", "AA)PL", "AA[PL", "AA]PL",
    "AA{PL", "AA}PL", "AA!PL", "AA'PL", 'AA"PL', "AA`PL", "AA,PL", "ÄAPL",
  ])("rejects %j with a nonretryable INVALID_REQUEST", (symbol) => {
    expect(() => validateSymbol(symbol)).toThrow(ProviderError);
    try {
      validateSymbol(symbol);
    } catch (error) {
      expect(error).toMatchObject({
        code: ProviderErrorCode.INVALID_REQUEST,
        retryable: false,
      });
    }
  });
});

describe("QuoteDataSchema symbol length", () => {
  it.each([1, 10, 11, 15])("accepts %i characters", (length) => {
    expect(QuoteDataSchema.safeParse({
      symbol: "A".repeat(length), price: 1, timestamp: new Date(0),
    }).success).toBe(true);
  });

  it.each([0, 16])("rejects %i characters", (length) => {
    expect(QuoteDataSchema.safeParse({
      symbol: "A".repeat(length), price: 1, timestamp: new Date(0),
    }).success).toBe(false);
  });
});
