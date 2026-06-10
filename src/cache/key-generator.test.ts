import { describe, it, expect } from "vitest";
import { generateCacheKey, parseCacheKey } from "./key-generator.js";

describe("generateCacheKey", () => {
  it("builds a prefixed key from name and scalar params", () => {
    expect(generateCacheKey("getQuote", "AAPL")).toBe(
      "provider-aggregator:getQuote:AAPL",
    );
  });

  it("serializes object params as sorted key=value pairs", () => {
    expect(generateCacheKey("getDividends", "MSFT", { limit: 12 })).toBe(
      "provider-aggregator:getDividends:MSFT:limit=12",
    );
    expect(generateCacheKey("f", { b: 2, a: 1 })).toBe(
      "provider-aggregator:f:a=1:b=2",
    );
  });

  it("filters out null/undefined params", () => {
    expect(generateCacheKey("f", "X", null, undefined, "Y")).toBe(
      "provider-aggregator:f:X:Y",
    );
  });

  it("handles no params", () => {
    expect(generateCacheKey("ping")).toBe("provider-aggregator:ping");
  });
});

describe("parseCacheKey", () => {
  it("splits a key back into components", () => {
    expect(parseCacheKey("provider-aggregator:getQuote:AAPL")).toEqual({
      prefix: "provider-aggregator",
      functionName: "getQuote",
      params: ["AAPL"],
    });
  });
});
