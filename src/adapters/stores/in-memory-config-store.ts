/**
 * InMemoryConfigStore — default ConfigStore adapter.
 *
 * Returns provider-configuration overrides held in process memory. With no
 * seed data it returns an empty list, so the registry uses only its built-in
 * defaults. Pass overrides to the constructor to tweak providers without a DB.
 */

import type {
  ConfigStore,
  ProviderConfigRecord,
} from "../../ports/config-store.js";

export class InMemoryConfigStore implements ConfigStore {
  private readonly configs: ProviderConfigRecord[];

  constructor(configs: ProviderConfigRecord[] = []) {
    this.configs = [...configs];
  }

  async getAllConfigs(): Promise<ProviderConfigRecord[]> {
    return [...this.configs];
  }
}
