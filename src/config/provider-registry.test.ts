import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "./provider-registry.js";
import { InMemoryConfigStore } from "../adapters/stores/in-memory-config-store.js";
import type { ProviderConfigRecord } from "../ports/config-store.js";

function override(
  name: string,
  patch: Partial<ProviderConfigRecord> = {},
): ProviderConfigRecord {
  return {
    name,
    providerType: "rest",
    requiresKey: false,
    rateLimitPerMinute: null,
    rateLimitPerHour: null,
    rateLimitPerDay: null,
    rateLimitPerMonth: null,
    reliabilityScore: 5,
    enabled: true,
    paidTier: false,
    supportedDataTypes: ["prices"],
    priority: 1,
    ...patch,
  };
}

describe("ProviderRegistry", () => {
  it("loads built-in defaults when the store is empty", async () => {
    const registry = new ProviderRegistry(new InMemoryConfigStore());
    await registry.load();
    const enabled = await registry.getEnabledProviders();
    expect(enabled).toContain("yahoo-finance");
    expect(enabled).toContain("finnhub");
    expect(enabled.length).toBeGreaterThanOrEqual(12);
  });

  it("returns providers for a data type, sorted and enabled only", async () => {
    const registry = new ProviderRegistry(new InMemoryConfigStore());
    await registry.load();
    const priceProviders = registry.getProvidersForDataType("prices");
    expect(priceProviders.length).toBeGreaterThan(0);
    expect(priceProviders.every((p) => p.enabled)).toBe(true);
    expect(
      priceProviders.every((p) => p.supportedDataTypes.includes("prices")),
    ).toBe(true);
  });

  it("lets a store override disable a built-in provider", async () => {
    const store = new InMemoryConfigStore([
      override("finnhub", { enabled: false, supportedDataTypes: ["prices"] }),
    ]);
    const registry = new ProviderRegistry(store);
    await registry.load();
    expect(registry.isProviderEnabled("finnhub")).toBe(false);
    expect(
      registry.getProvidersForDataType("prices").map((p) => p.name),
    ).not.toContain("finnhub");
  });

  it("includes a store-only provider not present in built-ins", async () => {
    const store = new InMemoryConfigStore([override("custom-provider")]);
    const registry = new ProviderRegistry(store);
    await registry.load();
    expect(await registry.getEnabledProviders()).toContain("custom-provider");
  });

  it("returns an empty list for a data type before load()", () => {
    const registry = new ProviderRegistry(new InMemoryConfigStore());
    expect(registry.getProvidersForDataType("prices")).toEqual([]);
  });
});
