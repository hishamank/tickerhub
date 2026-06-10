/**
 * NoopLogger — discards all log output.
 *
 * Useful in tests and in embedding contexts where the host owns logging.
 */

import type { Logger } from "../../ports/logger.js";

export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

export const noopLogger: NoopLogger = new NoopLogger();
