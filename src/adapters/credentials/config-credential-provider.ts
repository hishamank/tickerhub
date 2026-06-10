/**
 * ConfigCredentialProvider — static, in-code CredentialProvider adapter.
 *
 * Resolves credentials from a plain object keyed by provider name. Useful when
 * keys come from a secrets manager or are wired explicitly rather than from the
 * environment. Provider-name lookup is alias-insensitive (normalized).
 */

import type {
  CredentialProvider,
  ProviderCredentials,
} from "../../ports/credential-provider.js";
import { normalizeProviderName } from "./provider-key-mapping.js";

export class ConfigCredentialProvider implements CredentialProvider {
  private readonly byName: Map<string, ProviderCredentials>;

  constructor(credentials: Record<string, ProviderCredentials>) {
    this.byName = new Map(
      Object.entries(credentials).map(([name, creds]) => [
        normalizeProviderName(name),
        creds,
      ]),
    );
  }

  async resolve(providerName: string): Promise<ProviderCredentials | null> {
    return this.byName.get(normalizeProviderName(providerName)) ?? null;
  }
}
