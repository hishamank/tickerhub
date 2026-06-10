# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Dual ESM + CJS build with type declarations; 251 tests; CI across Node
  18/20/22.

### Notes

- Repository/homepage/bugs URLs in `package.json` are placeholders — set them
  to the real remote before publishing.
