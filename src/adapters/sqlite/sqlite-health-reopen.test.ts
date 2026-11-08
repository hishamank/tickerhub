/**
 * Attempt health written through to SQLite must still be there after the
 * database is closed and reopened. Uses a test-owned temporary file and fake
 * providers; all data is synthetic.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openSqliteStores } from "./index.js";
import { createAggregator } from "../../factory.js";
import { InMemoryConfigStore } from "../stores/in-memory-config-store.js";
import { ProviderFactory } from "../../providers/provider-factory.js";
import { ProviderError, ProviderErrorCode } from "../../types/provider.js";
import type { MarketDataProvider, RatingData } from "../../types/index.js";

const rating: RatingData = { consensus: "buy", numberOfAnalysts: 3 };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let directory: string;
let filename: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tickerhub-health-"));
  filename = join(directory, "health.db");
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

it("restores attempted success, failure and latency after close and reopen", async () => {
  const fetchRatings = vi
    .fn<() => Promise<RatingData | null>>()
    .mockImplementationOnce(async () => {
      await pause(20);
      return rating;
    })
    .mockImplementationOnce(async () => {
      await pause(5);
      throw new Error("down");
    })
    .mockImplementationOnce(async () => {
      await pause(5);
      throw new ProviderError(ProviderErrorCode.ENTITLEMENT_REQUIRED, "denied", false);
    });
  vi.spyOn(ProviderFactory, "create").mockImplementation((name) =>
    name === "p1"
      ? ({
          name,
          supportedDataTypes: ["ratings"],
          rateLimit: {},
          fetchQuote: async () => null,
          fetchRatings,
        } as MarketDataProvider)
      : null,
  );

  const writing = await openSqliteStores(filename);
  const { service } = createAggregator({
    healthStore: writing.healthStore,
    configStore: new InMemoryConfigStore([
      {
        name: "p1",
        providerType: "rest",
        requiresKey: false,
        rateLimitPerMinute: null,
        rateLimitPerHour: null,
        rateLimitPerDay: null,
        rateLimitPerMonth: null,
        reliabilityScore: 5,
        enabled: true,
        paidTier: false,
        supportedDataTypes: ["ratings"],
        priority: 1,
      },
    ]),
    credentials: { resolve: async () => null },
  });
  await service.getRatings("AAPL");
  await service.getRatings("AAPL", "system", { forceRefresh: true });
  await service.getRatings("AAPL", "system", { forceRefresh: true });
  writing.db.close();

  const reopened = await openSqliteStores(filename);
  const [denied, failed, succeeded] = await reopened.healthStore.getRecentMetrics("p1", 5);
  reopened.db.close();

  expect(succeeded).toMatchObject({ successCount: 1, failureCount: 0, consecutiveFailures: 0 });
  expect(succeeded?.avgLatencyMs).toBeGreaterThanOrEqual(15);
  expect(succeeded?.lastSuccessAt).toBeInstanceOf(Date);
  expect(failed).toMatchObject({ successCount: 1, failureCount: 1, consecutiveFailures: 1 });
  expect(failed?.lastFailureAt).toBeInstanceOf(Date);
  expect(denied).toMatchObject({ successCount: 1, failureCount: 2, consecutiveFailures: 1 });
  // Documented limit: durable rows do not say which failures were plan denials.
  expect(denied).not.toHaveProperty("entitlementDenials");
});
