import { Inject, Injectable, Logger } from '@nestjs/common';
import { MarketDataCache } from './market-data.cache';
import { MARKET_DATA_PROVIDER, MarketDataError, publicMarketMessage, type MarketDataProvider } from './market-data.provider';
import { resolveSession } from './session';
import type {
  CompanyProfile,
  Fundamentals,
  HistoricalPrice,
  NewsArticle,
  Quote,
  QuoteLookup,
  SymbolSearchHit,
  TradingSession,
} from './market-data.types';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
    private readonly cache: MarketDataCache,
  ) {}

  async getQuotes(symbols: string[]): Promise<QuoteLookup> {
    const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const quotes: Record<string, Quote> = {};
    const errors: string[] = [];

    await Promise.all(
      unique.map(async (symbol) => {
        try {
          quotes[symbol] = await this.cache.getOrSet(`quote:${symbol}`, () =>
            this.provider.getQuote(symbol),
          );
        } catch (error) {
          errors.push(this.describe(symbol, error));
        }
      }),
    );

    return {
      quotes,
      pricesStatus: this.status(unique.length, Object.keys(quotes).length, errors.length),
      error: errors[0] ?? null,
    };
  }

  async getHistory(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<{ prices: HistoricalPrice[]; error: string | null }> {
    const normalized = symbol.trim().toUpperCase();
    const key = `history:${normalized}:${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
    try {
      const prices = await this.cache.getOrSet(key, () =>
        this.provider.getHistoricalPrices(normalized, from, to),
      );
      return { prices, error: null };
    } catch (error) {
      return { prices: [], error: this.describe(normalized, error) };
    }
  }

  async search(query: string): Promise<SymbolSearchHit[]> {
    const normalized = query.trim();
    if (normalized.length < 1) {
      return [];
    }
    const matches = await this.cache.getOrSet(`search:${normalized.toUpperCase()}`, () =>
      this.provider.searchSymbols(normalized),
    );
    const limited = matches.slice(0, 6);
    const quotes = await this.getQuotes(limited.map((match) => match.symbol));
    const profiles = await Promise.all(
      limited.map(async (match) => {
        try {
          return await this.getProfile(match.symbol);
        } catch {
          return null;
        }
      }),
    );
    return limited.map((match, index) => {
      const quote = quotes.quotes[match.symbol];
      const profile = profiles[index];
      return {
        ...match,
        exchange: profile?.exchange || null,
        currency: profile?.currency || null,
        price: quote?.price ?? null,
        change: quote?.change ?? null,
        changePercent: quote?.changePercent ?? null,
      };
    });
  }

  async session(symbol: string, date: string): Promise<TradingSession> {
    const start = new Date(`${date}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 10);
    const end = new Date(`${date}T23:59:59.999Z`);
    const history = await this.getHistory(symbol, start, end);
    if (history.error) {
      throw new MarketDataError(history.error, 503);
    }
    return resolveSession(symbol.trim().toUpperCase(), date, history.prices);
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const normalized = symbol.trim().toUpperCase();
    return this.cache.getOrSet(`profile:${normalized}`, () =>
      this.provider.getCompanyProfile(normalized),
    );
  }

  async getNews(symbol: string, from = daysAgo(14), to = new Date()): Promise<NewsArticle[]> {
    const normalized = symbol.trim().toUpperCase();
    const key = `news:${normalized}:${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
    return this.cache.getOrSet(key, () => this.provider.getCompanyNews(normalized, from, to));
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const normalized = symbol.trim().toUpperCase();
    return this.cache.getOrSet(`fundamentals:${normalized}`, () =>
      this.provider.getFundamentals(normalized),
    );
  }

  private status(
    requested: number,
    received: number,
    errors: number,
  ): QuoteLookup['pricesStatus'] {
    if (requested === 0 || errors === 0) {
      return 'ok';
    }
    return received === 0 ? 'unavailable' : 'partial';
  }

  private describe(symbol: string, error: unknown): string {
    const technical = error instanceof Error ? error.message : 'No se pudo consultar el mercado';
    const status = error instanceof MarketDataError ? error.statusCode : 'n/a';
    this.logger.warn(`Market data failed for ${symbol}: status=${status} ${technical}`);
    return publicMarketMessage(error);
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
