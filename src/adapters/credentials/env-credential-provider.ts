/**
 * EnvCredentialProvider — default CredentialProvider adapter.
 *
 * Resolves a single shared key set from an environment record (defaults to
 * `process.env`). The `userId` argument is accepted but ignored — implement a
 * custom CredentialProvider for per-user resolution.
 */

import type {
  CredentialProvider,
  ProviderCredentials,
} from "../../ports/credential-provider.js";
import {
  PROVIDER_ENV_MAPPING,
  normalizeProviderName,
} from "./provider-key-mapping.js";

export type EnvRecord = Record<string, string | undefined>;

export class EnvCredentialProvider implements CredentialProvider {
  private readonly env: EnvRecord;

  constructor(env: EnvRecord = process.env) {
    this.env = env;
  }

  async resolve(providerName: string): Promise<ProviderCredentials | null> {
    const mapping = PROVIDER_ENV_MAPPING[normalizeProviderName(providerName)];
    if (!mapping) return null;

    const apiKey = this.env[mapping.apiKey];
    if (!apiKey) return null;

    const credentials: ProviderCredentials = { api_key: apiKey };
    if (mapping.apiSecret) {
      const apiSecret = this.env[mapping.apiSecret];
      if (apiSecret) credentials.api_secret = apiSecret;
    }
    return credentials;
  }
}
