import { describe, it, expect } from "vitest";
import {
  enrichWithCurrencyInfo,
  executeWithAdrFallback,
} from "./adr-fallback.js";
import type { QuoteData } from "../types/index.js";

function quote(over: Partial<QuoteData> = {}): QuoteData {
  return {
    symbol: "AAPL",
    price: 100,
    timestamp: new Date(0),
    currency: "USD",
    ...over,
  } as QuoteData;
}

describe("enrichWithCurrencyInfo", () => {
  it("leaves USD quotes untouched", () => {
    const q = quote();
    expect(enrichWithCurrencyInfo(q, "AAPL")).toBe(q);
  });

  it("converts GBX (pence) to GBP for unmapped .L symbols", () => {
    // An unmapped .L ticker takes the FX-conversion path (mapped tickers
    // short-circuit earlier). 10000 pence → 100 GBP.
    const q = quote({ symbol: "XYZ.L", price: 10000, currency: "GBP" });
    const enriched = enrichWithCurrencyInfo(q, "XYZ.L");
    expect(enriched.nativeCurrency).toBe("GBP");
    expect(enriched.nativePrice).toBe(100);
  });
});

describe("executeWithAdrFallback", () => {
  const isNull = (r: QuoteData | null): boolean => r === null;

  it("returns the primary result when present", async () => {
    const result = await executeWithAdrFallback<QuoteData | null>(
      "AAPL",
      "system",
      async () => quote({ price: 1 }),
      isNull,
      null,
    );
    expect(result?.price).toBe(1);
  });

  it("falls back to the mapped ADR ticker and remaps the symbol", async () => {
    // NOVO-B.CO maps to the US ADR "NVO".
    const result = await executeWithAdrFallback<QuoteData | null>(
      "NOVO-B.CO",
      "system",
      async (sym) => (sym === "NVO" ? quote({ symbol: "NVO", price: 5 }) : null),
      isNull,
      null,
    );
    expect(result?.price).toBe(5);
    expect(result?.symbol).toBe("NOVO-B.CO"); // remapped back to the request
  });

  it("returns the empty value when primary and ADR both yield nothing", async () => {
    const result = await executeWithAdrFallback<QuoteData | null>(
      "NOVO-B.CO",
      "system",
      async () => null,
      isNull,
      null,
    );
    expect(result).toBeNull();
  });
});
