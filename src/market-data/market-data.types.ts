export type PricesStatus = 'ok' | 'partial' | 'unavailable';

export type Quote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
};

export type HistoricalPrice = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

export type SymbolMatch = {
  symbol: string;
  name: string;
  type: string;
};

export type SymbolSearchHit = SymbolMatch & {
  exchange: string | null;
  currency: string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
};

export type TradingSession = {
  symbol: string;
  requestedDate: string;
  sessionDate: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  usedPreviousClose: boolean;
  message: string | null;
};

export type CompanyProfile = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  industry: string | null;
  weburl: string | null;
  lastUpdated: string;
};

export type QuoteLookup = {
  quotes: Record<string, Quote>;
  pricesStatus: PricesStatus;
  error: string | null;
};

export type NewsArticle = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
};

export type Fundamentals = {
  symbol: string;
  marketCap: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  lastUpdated: string;
};
