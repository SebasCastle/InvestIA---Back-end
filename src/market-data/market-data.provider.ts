import type {
  CompanyProfile,
  Fundamentals,
  HistoricalPrice,
  NewsArticle,
  Quote,
  SymbolMatch,
} from './market-data.types';

export const MARKET_DATA_PROVIDER = Symbol('MARKET_DATA_PROVIDER');

export const MARKET_DATA_UNAVAILABLE =
  'Por ahora no fue posible obtener los datos de mercado. Intenta de nuevo en unos minutos.';

export function publicMarketMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('no están configurados') || message.includes('no está configurado')) {
    return message;
  }
  return MARKET_DATA_UNAVAILABLE;
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly statusCode = 503,
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<Quote>;
  getHistoricalPrices(symbol: string, from: Date, to: Date): Promise<HistoricalPrice[]>;
  searchSymbols(query: string): Promise<SymbolMatch[]>;
  getCompanyProfile(symbol: string): Promise<CompanyProfile>;
  getCompanyNews(symbol: string, from: Date, to: Date): Promise<NewsArticle[]>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
}
