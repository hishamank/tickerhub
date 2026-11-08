/**
 * Per-attempt request budget.
 *
 * One logical provider call can make several HTTP requests, or none. Providers
 * that send requests through `budgetedFetch` have each one checked and counted
 * against the budget installed for the current attempt, without threading it
 * through every fetch signature. With no budget installed (direct provider use)
 * `budgetedFetch` is plain `fetch`.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { ProviderError, ProviderErrorCode } from "../types/provider.js";

/** Claims one request. Throws `RequestBudgetExhaustedError` if none remain. */
export type RequestBudget = () => void;

/** Raised locally when a request was withheld, so it never reached the provider. */
export class RequestBudgetExhaustedError extends ProviderError {
  constructor(providerName: string) {
    super(
      ProviderErrorCode.RATE_LIMIT_EXCEEDED,
      `${providerName} request budget exhausted; request not sent`,
      true,
    );
    this.name = "RequestBudgetExhaustedError";
  }
}

const currentBudget = new AsyncLocalStorage<RequestBudget>();

/** Run `operation` with every `budgetedFetch` inside it claiming from `budget`. */
export function withRequestBudget<T>(
  budget: RequestBudget,
  operation: () => Promise<T>,
): Promise<T> {
  return currentBudget.run(budget, operation);
}

/** `fetch` that first claims one request from the current attempt's budget. */
export async function budgetedFetch(
  ...request: Parameters<typeof fetch>
): Promise<Response> {
  currentBudget.getStore()?.();
  return fetch(...request);
}
