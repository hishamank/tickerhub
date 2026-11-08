# tickerhub

Provider-agnostic market data aggregation with stale-while-revalidate caching,
health monitoring, rate limiting, and a uniform circuit breaker — built on a
**ports & adapters** core so caching, credentials, and storage are all
pluggable. Zero-config out of the box (in-memory + environment credentials),
production-ready with Redis and SQLite.

Extracted and hardened from a monorepo package: dependency-injected throughout,
strict TypeScript, no `any`, dual ESM/CJS build.

## Install

```bash
npm install tickerhub
# optional backends (peer dependencies):
npm install better-sqlite3   # for the SQLite stores
npm install ioredis          # for the Redis cache
```

## Quick start

```ts
import { createAggregator } from "tickerhub";

// Zero-config: in-memory cache, env credentials, in-memory stores, console logs.
const { service } = createAggregator();

const quote = await service.getQuote("AAPL");
console.log(quote.data, quote.metadata.source); // "provider" | "cache"

const dividends = await service.getDividends("MSFT");
const profile = await service.getCompanyProfile("AAPL");
const news = await service.getNews("AAPL");

// Asset-class namespaces — each exposes only the data types valid for it:
const btc = await service.crypto.getQuote("BTC");
const markets = await service.crypto.getMarkets(50);
const eurusd = await service.forex.getRate("EUR", "USD");
```

Every method returns `{ data, metadata }`; data is aggregated across providers
in quality order with automatic fallback and rate-limit-aware skipping. The full
method surface (quotes, dividends, earnings, ratings, events, historical,
options, macro, profile, news, IPO calendar, search, insider, technicals,
movers, plus the `crypto`/`forex` namespaces) lives on `service`.

Provider API keys are read from the environment by default — see
[`.env.example`](./.env.example). Providers without a key are simply skipped;
keyless providers (Yahoo Finance, CoinGecko) always work.

## Architecture: ports & adapters

The core domain (providers, aggregation, SWR cache, health) depends only on
interfaces. Every external concern is a **port** with a zero-config default
**adapter**; override only what you need.

| Port | Default (zero-config) | Optional |
|------|----------------------|----------|
| `Logger` | `ConsoleLogger` | `NoopLogger`, or your own |
| `Cache` | `InMemoryCache` (TTL Map) | `RedisCache` (`/redis`, peer `ioredis`), `SqliteCache` (`/sqlite`) |
| `CredentialProvider` | `EnvCredentialProvider` | `ConfigCredentialProvider`, custom (per-user) |
| `ConfigStore` | `InMemoryConfigStore` | `SqliteConfigStore` (`/sqlite`) |
| `HealthMetricsStore` | `InMemoryHealthStore` | `SqliteHealthStore` (`/sqlite`) |
| `RateLimitStore` | `InMemoryRateLimitStore` | `SqliteRateLimitStore` (`/sqlite`) |

```ts
import { createAggregator, ConfigCredentialProvider } from "tickerhub";
import { RedisCache } from "tickerhub/redis";
import { openSqliteStores } from "tickerhub/sqlite";
import Redis from "ioredis";

const { configStore, healthStore } = await openSqliteStores("./market-data.db");

const { service } = createAggregator({
  cache: new RedisCache(new Redis(process.env.REDIS_URL!)),
  credentials: new ConfigCredentialProvider({
    finnhub: { api_key: "..." },
    alpaca: { api_key: "...", api_secret: "..." },
  }),
  configStore,
  healthStore,
});
```

### Durable cache + rate limits (single SQLite file)

One DB file can back the response cache, rate-limit budgets, config, and health
— so monthly quotas (Marketstack, CoinGecko) and cached responses survive
restarts:

```ts
import { createAggregator } from "tickerhub";
import { openSqliteStores } from "tickerhub/sqlite";

const { cache, rateLimitStore, configStore, healthStore } =
  await openSqliteStores("./market-data.db");

const { service } = createAggregator({
  cache, // SqliteCache — SWR responses persist on disk
  rateLimitStore, // SqliteRateLimitStore — daily/monthly budgets survive restarts
  configStore,
  healthStore,
});
```

### Multi-tenant credentials

`CredentialProvider.resolve(providerName, userId?)` receives an optional
`userId`. The built-in providers ignore it (single shared key set); implement
the interface to resolve per-user keys without touching core code:

```ts
class MyKeyVault implements CredentialProvider {
  async resolve(provider: string, userId?: string) {
    return userId ? this.lookup(userId, provider) : null;
  }
}
```

## Providers

Yahoo Finance, Finnhub, FMP, Polygon, Alpha Vantage, Tiingo, Twelve Data,
Marketstack, Alpaca, Nasdaq Data Link, CoinGecko (crypto), Tradier (options).
Selection is priority-ordered per data type with automatic fallback; see
`DEFAULT_PROVIDER_PRIORITIES` and override per provider via the `ConfigStore`.

The researched free-tier capability matrix and per-provider rate limits live in
[`docs/PROVIDERS.md`](./docs/PROVIDERS.md). Adding a provider **or a new data
type** is documented step-by-step in [GUIDE.md](./GUIDE.md). Keys for the
built-in providers are listed in [`.env.example`](./.env.example).

## Resilience

- **SWR cache** — fresh hits served instantly; stale entries served immediately
  while refreshed in the background; concurrent requests for the same key are
  coalesced.
- **No negative caching** — a `null` or empty aggregate is never cached, so the
  next call retries. It is returned with `metadata.warnings` explaining what each
  provider reported (keys redacted), and never replaces good cached data.
- **Circuit breaker** — applied uniformly to every provider call; trips after
  repeated failures and short-circuits, excluding rate-limit and plan-denial
  errors. Recovers via half-open probing.
- **Rate limiting** — per-key quota tracking across per-minute/hour/day/month
  windows skips exhausted providers before calling them. FMP, Finnhub and
  Polygon spend one unit per HTTP request, failed requests included, and stop
  before a request that would exceed the quota. Other providers count one unit
  per call. Use the `SqliteRateLimitStore` to make daily/monthly budgets durable
  across restarts.
- **Cross-provider fallback** — the aggregator tries the next provider when one
  returns nothing or errors.
- **Plan denials** — a provider refusing data outside your subscription raises a
  non-retryable `ENTITLEMENT_REQUIRED`, distinct from `AUTHENTICATION_FAILED`
  for a bad key. Polygon quotes denied this way fall back to the previous
  session's close; check `quote.priceBasis === "end_of_day"` and `asOfDate`
  before treating a price as live.

## Health monitoring

Every real provider attempt updates a live per-provider snapshot and is written
through to the configured `HealthMetricsStore`, recording success or failure and
elapsed latency. Skipped providers (no key, exhausted quota, open circuit) are
not attempts and are not recorded.

```ts
const { service, healthRepository } = createAggregator({
  /* configStore, healthStore, ... */
});

service.getProviderHealth("finnhub");
// { status, successRate, avgLatency, provenance }
// provenance: "observed", or "registry-default" before any attempt in this
// process, when the figures are placeholders.

// The durable history, newest first:
await healthRepository.getRecentMetrics("finnhub", 20);

// The store gains a row per attempt, so prune it (e.g. from a daily job):
await healthRepository.deleteOlderThan(new Date(Date.now() - 7 * 864e5));
```

`flushHealthMetrics()` remains available to snapshot on demand. Plan denials
count as failed attempts but do not trip the breaker or raise
`consecutiveFailures`.

Stored rows are summaries for inspection and do not restore live state.
`getProviderHealth` covers the current process only, and rows do not record which
failures were plan denials, so a stored row cannot be fed to `FailureDetector`
with the same result as live metrics.

## Development

```bash
npm run check-types    # tsc --noEmit (strict)
npm run lint           # eslint (no-explicit-any, max-lines enforced)
npm test               # vitest
npm run test:coverage  # vitest with coverage thresholds
npm run build          # tsup → dist (ESM + CJS + d.ts)
npm run docs:api       # typedoc → docs/api (generated, gitignored)
npm run verify:package # pack + install + smoke test the tarball
```

## License

MIT
