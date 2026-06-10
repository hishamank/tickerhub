/**
 * ConsoleLogger — default Logger adapter.
 *
 * Writes namespaced, level-tagged lines to the console. Each instance carries
 * a `name` used as a prefix so output is traceable to its source module.
 */

import type { Logger } from "../../ports/logger.js";

/* eslint-disable no-console -- this adapter is the one place console use is intentional */
export class ConsoleLogger implements Logger {
  constructor(private readonly name: string = "market-data-aggregator") {}

  private format(level: string, message: string): string {
    return `[${level}] [${this.name}] ${message}`;
  }

  debug(message: string, context?: unknown): void {
    console.debug(this.format("DEBUG", message), context ?? "");
  }

  info(message: string, context?: unknown): void {
    console.info(this.format("INFO", message), context ?? "");
  }

  warn(message: string, context?: unknown): void {
    console.warn(this.format("WARN", message), context ?? "");
  }

  error(message: string, context?: unknown): void {
    console.error(this.format("ERROR", message), context ?? "");
  }
}
/* eslint-enable no-console */

/** Create a named ConsoleLogger. */
export function createConsoleLogger(name?: string): ConsoleLogger {
  return new ConsoleLogger(name);
}
