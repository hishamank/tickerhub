/**
 * Logger factory seam.
 *
 * Internal modules obtain a `Logger` via `getLogger(name)`. By default this
 * returns a namespaced `ConsoleLogger`. The composition root (`createAggregator`)
 * can install a different factory — e.g. to route all internal logging through
 * a user-supplied logger — via `setLoggerFactory`.
 *
 * This is the single logging seam for the package; modules never reach for a
 * global logger from elsewhere.
 */

import type { Logger } from "../ports/logger.js";
import { ConsoleLogger } from "../adapters/logging/console-logger.js";

export type LoggerFactory = (name: string) => Logger;

let factory: LoggerFactory = (name) => new ConsoleLogger(name);

/** Install a custom logger factory (used by the composition root). */
export function setLoggerFactory(next: LoggerFactory): void {
  factory = next;
}

/** Reset the factory to the default namespaced ConsoleLogger. */
export function resetLoggerFactory(): void {
  factory = (name) => new ConsoleLogger(name);
}

/**
 * Get a namespaced logger. The second argument (scope) is accepted for
 * call-site compatibility and folded into the logger name.
 */
export function getLogger(name: string, scope?: string): Logger {
  return factory(scope ? `${name}:${scope}` : name);
}
