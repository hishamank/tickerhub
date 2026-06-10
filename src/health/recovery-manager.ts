/**
 * Recovery Manager
 *
 * Manages automatic provider disable/re-enable logic with recovery periods.
 * Implements 15-minute recovery period before attempting to re-enable failed providers.
 *
 * Migrated from @repo/market-data
 */

import { getLogger } from "../logging/index.js";

const logger = getLogger(
  'recovery-manager',
  'packages/provider-aggregator/health'
);

export interface DisabledProvider {
  name: string;
  disabledAt: Date;
  disabledReason: string;
  recoveryAttempts: number;
}

export interface RecoveryConfig {
  recoveryPeriodMs: number; // Time to wait before re-enabling (default: 15 minutes)
  maxRecoveryAttempts: number; // Maximum automatic recovery attempts (default: unlimited)
  exponentialBackoff: boolean; // Use exponential backoff for recovery attempts
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  recoveryPeriodMs: 15 * 60 * 1000, // 15 minutes
  maxRecoveryAttempts: -1, // Unlimited
  exponentialBackoff: true,
};

export class RecoveryManager {
  private disabledProviders: Map<string, DisabledProvider> = new Map();

  constructor(private config: RecoveryConfig = DEFAULT_RECOVERY_CONFIG) {}

  /**
   * Disable a provider
   * @param providerName - Name of the provider
   * @param reason - Reason for disabling
   */
  disableProvider(providerName: string, reason: string): void {
    const existing = this.disabledProviders.get(providerName);
    const isNewDisable = !existing;
    const previousAttempts = existing ? existing.recoveryAttempts : 0;

    this.disabledProviders.set(providerName, {
      name: providerName,
      disabledAt: new Date(),
      disabledReason: reason,
      recoveryAttempts: previousAttempts,
    });

    // Log provider being disabled
    if (isNewDisable) {
      logger.warn(`Provider disabled: ${providerName}`, {
        reason,
        previousRecoveryAttempts: previousAttempts,
      });
    }
  }

  /**
   * Check if provider is disabled
   * @param providerName - Name of the provider
   * @returns true if provider is currently disabled
   */
  isDisabled(providerName: string): boolean {
    return this.disabledProviders.has(providerName);
  }

  /**
   * Check if provider is ready for recovery attempt
   * @param providerName - Name of the provider
   * @returns true if recovery period has elapsed
   */
  isReadyForRecovery(providerName: string): boolean {
    const disabled = this.disabledProviders.get(providerName);
    if (!disabled) {
      return false;
    }

    // Check if max recovery attempts reached
    if (
      this.config.maxRecoveryAttempts > 0 &&
      disabled.recoveryAttempts >= this.config.maxRecoveryAttempts
    ) {
      return false;
    }

    const now = Date.now();
    const disabledAt = disabled.disabledAt.getTime();
    const recoveryPeriod = this.getRecoveryPeriod(disabled.recoveryAttempts);

    return now - disabledAt >= recoveryPeriod;
  }

  /**
   * Get recovery period based on attempt number (with exponential backoff if enabled)
   * @param attemptNumber - Recovery attempt number
   * @returns Recovery period in milliseconds
   */
  private getRecoveryPeriod(attemptNumber: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.recoveryPeriodMs;
    }

    // Exponential backoff: 15min, 30min, 1hr, 2hr, 4hr, max 4hr
    const baseMs = this.config.recoveryPeriodMs;
    const backoffMultiplier = Math.min(Math.pow(2, attemptNumber), 16); // Max 16x
    return baseMs * backoffMultiplier;
  }

  /**
   * Attempt recovery for a provider
   * @param providerName - Name of the provider
   * @returns true if recovery was initiated
   */
  attemptRecovery(providerName: string): boolean {
    if (!this.isReadyForRecovery(providerName)) {
      return false;
    }

    const disabled = this.disabledProviders.get(providerName);
    if (!disabled) {
      return false;
    }

    // Increment recovery attempts
    disabled.recoveryAttempts++;
    logger.info(`Attempting recovery for provider: ${providerName}`, {
      attempt: disabled.recoveryAttempts,
      disabledReason: disabled.disabledReason,
    });

    return true;
  }

  /**
   * Re-enable a provider (after successful recovery)
   * @param providerName - Name of the provider
   */
  enableProvider(providerName: string): void {
    const disabled = this.disabledProviders.get(providerName);
    if (disabled) {
      logger.info(`Provider re-enabled: ${providerName}`, {
        wasDisabledFor:
          Date.now() - disabled.disabledAt.getTime() + 'ms',
        recoveryAttempts: disabled.recoveryAttempts,
      });
      this.disabledProviders.delete(providerName);
    }
  }

  /**
   * Get all disabled providers
   * @returns Array of disabled provider info
   */
  getDisabledProviders(): DisabledProvider[] {
    return Array.from(this.disabledProviders.values());
  }

  /**
   * Get disabled provider info
   * @param providerName - Name of the provider
   * @returns Disabled provider info or null
   */
  getDisabledInfo(providerName: string): DisabledProvider | null {
    return this.disabledProviders.get(providerName) || null;
  }

  /**
   * Reset all disabled providers (useful for testing)
   */
  reset(): void {
    this.disabledProviders.clear();
  }
}
