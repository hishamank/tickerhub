import { describe, it, expect } from "vitest";
import {
  BUILTIN_PROVIDERS,
  DEFAULT_PROVIDER_PRIORITIES,
} from "./default-priorities.js";

const byName = (name: string) =>
  BUILTIN_PROVIDERS.find((p) => p.name === name);

describe("BUILTIN_PROVIDERS rate limits", () => {
  // Guards against re-introducing the stale values fixed in the P1 correctness
  // pass (see docs/PROVIDERS.md for the researched figures).
  it("alpha-vantage free tier is 25/day (was wrongly 500)", () => {
    expect(byName("alpha-vantage")?.rateLimitPerDay).toBe(25);
  });

  it("nasdaq-data-link authenticated free tier is 50k/day (was wrongly 50)", () => {
    expect(byName("nasdaq-data-link")?.rateLimitPerDay).toBe(50000);
  });

  it("marketstack uses a real monthly limit (100/month)", () => {
    expect(byName("marketstack")?.rateLimitPerMonth).toBe(100);
    expect(byName("marketstack")?.rateLimitPerDay).toBeNull();
  });

  it("tiingo tracks its hourly limit (50/hour)", () => {
    expect(byName("tiingo")?.rateLimitPerHour).toBe(50);
  });

  it("coingecko tracks its monthly Demo limit (10k/month)", () => {
    expect(byName("coingecko")?.rateLimitPerMonth).toBe(10000);
  });
});

describe("DEFAULT_PROVIDER_PRIORITIES integrity", () => {
  it("every provider named in a priority list exists in BUILTIN_PROVIDERS", () => {
    const known = new Set(BUILTIN_PROVIDERS.map((p) => p.name));
    for (const [dataType, providers] of Object.entries(
      DEFAULT_PROVIDER_PRIORITIES,
    )) {
      for (const name of providers) {
        expect(known.has(name), `${name} (in ${dataType}) is unknown`).toBe(
          true,
        );
      }
    }
  });

  it("a provider only appears in priority lists for data types it supports", () => {
    for (const [dataType, providers] of Object.entries(
      DEFAULT_PROVIDER_PRIORITIES,
    )) {
      for (const name of providers) {
        const meta = byName(name);
        expect(
          meta?.supportedDataTypes.includes(
            dataType as (typeof meta.supportedDataTypes)[number],
          ),
          `${name} is in ${dataType} priority but doesn't support it`,
        ).toBe(true);
      }
    }
  });
});
