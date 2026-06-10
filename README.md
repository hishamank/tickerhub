# market-data-aggregator

Provider-agnostic market data aggregation with stale-while-revalidate caching,
health monitoring, rate limiting, and a uniform circuit breaker — built on a
**ports & adapters** core so caching, credentials, and storage are all
pluggable. Zero-config out of the box (in-memory + environment credentials),
production-ready with Redis and SQLite.

Extracted and hardened from a monorepo package: dependency-injected throughout,
strict TypeScript, no `any`, dual ESM/CJS build.

## Install

```bash
npm install market-data-aggregator
# optional backends (peer dependencies):
npm install better-sqlite3   # for the SQLite stores
npm install ioredis          # for the Redis cache
```

## Quick start

```ts
import { createAggregator } from "market-data-aggregator";

// Zero-config: in-memory cache, env credentials, in-memory stores, console logs.
const { service } = createAggregator();

const quote = await service.getQuote("AAPL");
console.log(quote.data, quote.metadata.source); // "provider" | "cache"

const dividends = await service.getDividends("MSFT");
const history = await service.getHistoricalPrices(
  "AAPL",
  "system",
  new Date("2024-01-01"),
  new Date("2024-06-01"),
);
```

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
| `Cache` | `InMemoryCache` (TTL Map) | `RedisCache` (`/redis`, peer `ioredis`) |
| `CredentialProvider` | `EnvCredentialProvider` | `ConfigCredentialProvider`, custom (per-user) |
| `ConfigStore` | `InMemoryConfigStore` | `SqliteConfigStore` (`/sqlite`) |
| `HealthMetricsStore` | `InMemoryHealthStore` | `SqliteHealthStore` (`/sqlite`) |

```ts
import { createAggregator, ConfigCredentialProvider } from "market-data-aggregator";
import { RedisCache } from "market-data-aggregator/redis";
import { openSqliteStores } from "market-data-aggregator/sqlite";
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

## Resilience

- **SWR cache** — fresh hits served instantly; stale entries served immediately
  while refreshed in the background; concurrent requests for the same key are
  coalesced.
- **Circuit breaker** — applied uniformly to every provider call; trips after
  repeated failures and short-circuits, excluding rate-limit errors. Recovers
  via half-open probing.
- **Rate limiting** — per-key, per-minute/per-day quota tracking skips exhausted
  providers before calling them.
- **Cross-provider fallback** — the aggregator tries the next provider when one
  returns nothing or errors.

## Health monitoring

```ts
const { service, healthRepository } = createAggregator({ /* ... */ });

service.getProviderHealth("finnhub"); // { status, successRate, avgLatency }

// Persist/prune metrics (e.g. from a scheduled job) via the injected store:
await healthRepository.deleteOlderThan(new Date(Date.now() - 7 * 864e5));
```

## Development

```bash
npm run check-types   # tsc --noEmit (strict)
npm run lint          # eslint (no-explicit-any enforced)
npm test              # vitest (186 tests)
npm run build         # tsup → dist (ESM + CJS + d.ts)
```

## License

MIT
