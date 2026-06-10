export interface TradierQuotePayload {
  symbol?: string;
  description?: string;
  last?: number | string;
  prevclose?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  volume?: number | string;
  change?: number | string;
  change_percentage?: number | string;
  bid?: number | string;
  ask?: number | string;
  trade_date?: number | string;
}

export interface TradierGreeksPayload {
  delta?: number | string;
  gamma?: number | string;
  theta?: number | string;
  vega?: number | string;
  rho?: number | string;
  phi?: number | string;
  bid_iv?: number | string;
  mid_iv?: number | string;
  ask_iv?: number | string;
  smv_vol?: number | string;
}

export interface TradierOptionPayload extends TradierQuotePayload {
  option_type?: string;
  expiration_date?: string;
  strike?: number | string;
  root_symbol?: string;
  open_interest?: number | string;
  bid_size?: number | string;
  ask_size?: number | string;
  last_volume?: number | string;
  greeks?: TradierGreeksPayload;
}

export interface TradierHistoryDayPayload {
  date?: string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string;
}

export type TradierArrayOrSingle<T> = T | T[] | null | undefined;

export interface TradierQuoteResponse {
  quotes?: {
    quote?: TradierArrayOrSingle<TradierQuotePayload>;
  };
}

export interface TradierHistoryResponse {
  history?: {
    day?: TradierArrayOrSingle<TradierHistoryDayPayload>;
  };
}

export interface TradierOptionsResponse {
  options?: {
    option?: TradierArrayOrSingle<TradierOptionPayload>;
  };
}
