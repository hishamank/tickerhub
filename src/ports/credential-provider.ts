/**
 * CredentialProvider port.
 *
 * Resolves API credentials for a provider. The default `EnvCredentialProvider`
 * reads a single shared key set from the environment; `ConfigCredentialProvider`
 * takes a static object. The optional `userId` argument lets custom adapters
 * implement per-user (multi-tenant) resolution without changing core code.
 *
 * Credentials are a flat string map — typically `{ api_key }`, or
 * `{ api_key, api_secret }` for providers like Alpaca. Keyless providers (e.g.
 * Yahoo Finance, CoinGecko) resolve to `null`.
 */
export type ProviderCredentials = Record<string, string>;

export interface CredentialProvider {
  resolve(
    providerName: string,
    userId?: string,
  ): Promise<ProviderCredentials | null>;
}
