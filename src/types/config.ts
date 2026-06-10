/**
 * Configuration Types
 *
 * Defines configuration types for provider aggregator.
 */

import type { DataType } from './provider.js';

/**
 * Provider configuration
 */
export interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  reliability?: number;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Provider priority configuration by data type
 */
export type ProviderPriorityConfig = Record<DataType, string[]>;

/**
 * Provider reliability scores
 */
export type ProviderReliabilityScores = Record<string, number>;
