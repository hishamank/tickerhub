/**
 * Alpha Vantage API response shapes (the subset this provider consumes).
 */

export interface AlphaVantageGlobalQuote {
  "05. price": string;
  "02. open": string;
  "03. high": string;
  "04. low": string;
  "08. previous close": string;
  "09. change": string;
  "10. change percent": string;
  "06. volume": string;
  "07. latest trading day": string;
}

export interface AlphaVantageQuoteResponse {
  "Global Quote"?: AlphaVantageGlobalQuote;
}

export interface AlphaVantageEarningsItem {
  reportedDate?: string;
  fiscalDateEnding: string;
  estimatedEPS: string;
  reportedEPS: string;
  surprise: string;
  surprisePercentage: string;
}

export interface AlphaVantageEarningsResponse {
  quarterlyEarnings?: AlphaVantageEarningsItem[];
}
