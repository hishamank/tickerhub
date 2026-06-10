/**
 * Logger port.
 *
 * Minimal structured-logging contract the package depends on. Consumers may
 * inject any logger (winston, pino, etc.) by adapting it to this shape. The
 * default is `ConsoleLogger`; use `NoopLogger` to silence output.
 *
 * The `context` argument is intentionally `unknown` (not `any`): call sites
 * pass either a structured object or a raw error, and the adapter decides how
 * to render it.
 */
export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}
