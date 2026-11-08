/**
 * Per-request record of provider failures.
 *
 * The aggregator's public methods resolve to null/[] when every provider fails,
 * so the reasons would otherwise stop at the log. This carries them up to the
 * SWR layer for `metadata.warnings` without threading a collector through every
 * fetch signature, and stays correct under concurrent requests.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const currentRequest = new AsyncLocalStorage<string[]>();

/** Run `fetcher`, returning its value and any failures reported during it. */
export async function collectProviderFailures<T>(
  fetcher: () => Promise<T>,
): Promise<{ value: T; failures: string[] }> {
  const failures: string[] = [];
  const value = await currentRequest.run(failures, fetcher);
  return { value, failures: [...new Set(failures)] };
}

/** Note a failed provider attempt. Callers must sanitize `message` first. */
export function reportProviderFailure(message: string): void {
  currentRequest.getStore()?.push(message);
}
