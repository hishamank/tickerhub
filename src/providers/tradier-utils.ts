import type { OptionContract } from "../types/index.js";
import type { TradierArrayOrSingle } from "./tradier-types.js";

export function toTradierArray<T>(value: TradierArrayOrSingle<T>): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function toTradierIsoDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function toTradierTradeDate(value?: number | string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return new Date(parsed * 1000);
}

export function toTradierNumber(value?: number | string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeTradierOptionType(
  optionType?: string,
): OptionContract["optionType"] | null {
  if (!optionType) {
    return null;
  }

  const normalized = optionType.toLowerCase();
  if (normalized === "call") {
    return "call";
  }
  if (normalized === "put") {
    return "put";
  }
  return null;
}
