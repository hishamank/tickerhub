/**
 * Exchange suffix → currency / exchange mapping.
 *
 * Maps international exchange suffixes (e.g. .CO, .L, .T) to native trading
 * currency (ISO 4217) and exchange code. Vendored from `@repo/markets`.
 *
 * NOTE: suffix-less ADR-mapped symbols (e.g. NOVOBC, ASML) resolve to "USD"
 * because providers return USD-priced quotes via ADR fallback. The native
 * listing currency is available via `resolveTickerMapping(symbol).currency`.
 */

const SUFFIX_TO_CURRENCY: Record<string, string> = {
  ".CO": "DKK",
  ".SW": "CHF",
  ".L": "GBP",
  ".DE": "EUR",
  ".PA": "EUR",
  ".AS": "EUR",
  ".TO": "CAD",
  ".T": "JPY",
  ".KS": "KRW",
  ".NS": "INR",
  ".BO": "INR",
  ".HK": "HKD",
  ".AX": "AUD",
  ".MI": "EUR",
  ".MC": "EUR",
  ".LS": "EUR",
  ".BR": "EUR",
  ".OL": "NOK",
  ".HE": "EUR",
  ".ST": "SEK",
  ".KA": "EUR",
  ".WA": "PLN",
  ".PR": "CZK",
  ".VI": "EUR",
};

const SUFFIX_TO_EXCHANGE: Record<string, string> = {
  ".CO": "CPH",
  ".SW": "SIX",
  ".L": "LSE",
  ".DE": "XETRA",
  ".PA": "EPA",
  ".AS": "AMS",
  ".TO": "TSX",
  ".T": "TSE",
  ".KS": "KRX",
  ".NS": "NSE",
  ".BO": "BSE",
  ".HK": "HKEX",
  ".AX": "ASX",
  ".MI": "BIT",
  ".MC": "BME",
  ".LS": "ELI",
  ".BR": "EBR",
  ".OL": "OSE",
  ".HE": "HEL",
  ".ST": "STO",
  ".KA": "ATH",
  ".WA": "WSE",
  ".PR": "PSE",
  ".VI": "VIE",
};

/** Extract the exchange suffix from a symbol (e.g. "NOVO-B.CO" → ".CO"). */
export function extractSuffix(symbol: string): string | null {
  const normalized = symbol.toUpperCase();
  for (const suffix of Object.keys(SUFFIX_TO_CURRENCY)) {
    if (normalized.endsWith(suffix)) return suffix;
  }
  return null;
}

/**
 * Provider quote currency for a symbol. Returns "USD" for US stocks and
 * suffix-less ADR-mapped symbols.
 */
export function getCurrencyForSymbol(symbol: string): string {
  const suffix = extractSuffix(symbol);
  if (suffix) return SUFFIX_TO_CURRENCY[suffix] ?? "USD";
  return "USD";
}

/** Exchange code for a symbol based on its suffix, or null if domestic. */
export function getExchangeForSymbol(symbol: string): string | null {
  const suffix = extractSuffix(symbol);
  if (suffix) return SUFFIX_TO_EXCHANGE[suffix] ?? null;
  return null;
}

/** True if a currency requires FX conversion (i.e. is not USD). */
export function needsFxConversion(currency: string): boolean {
  return currency !== "USD";
}
