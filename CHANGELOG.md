# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-12

Free-tier correctness pass plus a large coverage expansion: more normalized data
types, asset-class namespaces, and durable SQLite persistence.

### Added

- **New data types** aggregated across providers in priority order:
  `profile` (company fundamentals), `news`, `ipo` (calendar), `search`
  (symbol lookup), `insider` (transactions), `technicals` (indicators), and
  `movers` (gainers/losers/actives). New service methods: `getCompanyProfile`,
  `getNews`, `getIpoCalendar`, `searchSymbols`, `getInsiderTransactions`,
  `getTechnicalIndicator`, `getMarketMovers`.
- **Asset-class namespaces** on the service: `service.crypto.*`
  (`getQuote`/`getHistorical`/`getMarkets`) and `service.forex.*`
  (`getRate`/`getHistorical`). Each exposes only the data types valid for it,
  backed by the same selection/fallback engine and SWR cache.
- **Durable SQLite persistence**: `SqliteCache` (a `Cache`-port adapter for
  response caching) and `SqliteRateLimitStore` (a new `RateLimitStore` port) so
  daily/monthly budgets survive restarts. `openSqliteStores()` now returns
  `{ cache, rateLimitStore }` alongside the config/health stores, and
  `createAggregator` accepts a `rateLimitStore` option.
- **Per-hour and per-month rate-limit windows** (in addition to minute/day).
  `RateLimitConfig`'s `requestsPerHour`/`monthlyLimit` are now enforced via the
  registry and tracker. Tiingo (50/hr), Marketstack (100/mo), and CoinGecko
  (10k/mo) limits are now represented and honored.
- **CoinGecko Demo key** support (optional `COINGECKO_API_KEY`, sent as
  `x-cg-demo-api-key`); CoinGecko still works keyless (throttled harder).
- `docs/PROVIDERS.md`: a researched free-tier capability & rate-limit reference.

### Changed

- **Corrected free-tier rate limits** (these change provider-skip behavior):
  Alpha Vantage `500/day` → **`25/day`**, Nasdaq Data Link `50/day` →
  **`50,000/day`** (the authenticated free limit), Marketstack `100/day` →
  **`100/month`**.
- `service.getQuote()` is now **equities-only**; crypto symbols route through
  `service.crypto.getQuote()` (the old auto-detection special-case was removed).
- `SmartAggregator`'s generic provider-iteration loop was extracted into a
  shared `ProviderQueryEngine`.

### Removed

- **`PROVIDER_RATE_LIMITS` / `getRateLimitConfig`** (`rate-limiting/rate-limit-config`)
  — a second, drifted copy of the limits the aggregator never read.
  `BUILTIN_PROVIDERS` (via `ProviderRegistry`) is the single source of truth.

## [0.1.0] - 2026-06-11

Initial release — extracted from a monorepo into a standalone, dependency-
injected library.

### Added

- **Ports & adapters core**: `Logger`, `Cache`, `CredentialProvider`,
  `ConfigStore`, and `HealthMetricsStore` ports with zero-config in-memory /
  environment defaults.
- **`createAggregator()`** composition root wiring the full service graph.
- **12 providers**: Yahoo Finance, Finnhub, FMP, Polygon, Alpha Vantage,
  Tiingo, Twelve Data, Marketstack, Alpaca, Nasdaq Data Link, CoinGecko,
  Tradier — priority-ordered selection with automatic fallback.
- **SWR cache** with background refresh, request coalescing, and
  stale-on-error degradation.
- **Uniform resilience**: a per-provider circuit breaker on every call, plus
  per-key rate-limit quota tracking.
- **Health monitoring** with `flushHealthMetrics()` for durable time series.
- **Optional backends** via subpath exports: `/sqlite` (better-sqlite3) and
  `/redis` (ioredis), lazily loaded so the core install is dependency-free.
- Dual ESM + CJS build with type declarations; CI across Node 18/20/22.

### Security

- The Finnhub provider calls the REST API via native `fetch` instead of
  `finnhub-ts`, which transitively pinned an EOL `axios@0.27` with unpatched
  high-severity advisories. The package now has **zero** production dependency
  vulnerabilities (`npm audit --omit=dev`).

### Notes

- Repository/homepage/bugs URLs in `package.json` are placeholders — set them
  to the real remote before publishing.
