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
- **Circuit breaker** — applied uniformly to every provider call; trips after
  repeated failures and short-circuits, excluding rate-limit errors. Recovers
  via half-open probing.
- **Rate limiting** — per-key quota tracking across per-minute/hour/day/month
  windows skips exhausted providers before calling them. Use the
  `SqliteRateLimitStore` to make daily/monthly budgets durable across restarts.
- **Cross-provider fallback** — the aggregator tries the next provider when one
  returns nothing or errors.

## Health monitoring

The aggregator records a live in-memory health snapshot per provider. To build
a durable time series, flush it to the configured `HealthMetricsStore` on an
interval (and prune old rows):

```ts
const { service, flushHealthMetrics, healthRepository } = createAggregator({
  /* configStore, healthStore, ... */
});

service.getProviderHealth("finnhub"); // { status, successRate, avgLatency }

// Persist a snapshot every 30s (use the SQLite store for durability):
setInterval(() => void flushHealthMetrics(), 30_000);

// Prune metrics older than 7 days (e.g. from a daily job):
await healthRepository.deleteOlderThan(new Date(Date.now() - 7 * 864e5));
```

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
