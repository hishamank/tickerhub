/**
 * Health Module
 *
 * Exports health monitoring functionality.
 */

export {
  HealthMonitor,
  type HealthMetrics,
  type RequestResult,
} from './health-monitor.js';
export {
  FailureDetector,
  DEFAULT_THRESHOLDS,
  type FailureThresholds,
} from './failure-detector.js';
export {
  RecoveryManager,
  DEFAULT_RECOVERY_CONFIG,
  type DisabledProvider,
  type RecoveryConfig,
} from './recovery-manager.js';
