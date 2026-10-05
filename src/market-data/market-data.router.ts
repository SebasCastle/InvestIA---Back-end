import { Injectable, Logger } from '@nestjs/common';
import { DatabursatilProvider } from './databursatil.provider';
import { FinnhubProvider } from './finnhub.provider';
import { FmpProvider } from './fmp.provider';
import { MarketDataError, type MarketDataProvider } from './market-data.provider';
import type { CompanyProfile, Fundamentals, HistoricalPrice, NewsArticle, Quote, SymbolMatch } from './market-data.types';
import { isMexicanListing } from './symbol-market';

@Injectable()
export class MarketDataRouter implements MarketDataProvider {
  readonly name = 'composite';
  private readonly logger = new Logger(MarketDataRouter.name);

  constructor(
    private readonly finnhub: FinnhubProvider,
    private readonly fmp: FmpProvider,
    private readonly mexico: DatabursatilProvider,
  ) {}

  getQuote(symbol: string): Promise<Quote> {
    if (isMexicanListing(symbol) && this.mexico.configured()) {
      return this.firstAvailable([() => this.mexico.getQuote(symbol), () => this.quoteAbroad(symbol)]);
    }
    return this.quoteAbroad(symbol);
  }

  getHistoricalPrices(symbol: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    if (isMexicanListing(symbol)) {
      if (!this.mexico.configured()) {
        return Promise.reject(new MarketDataError('Las emisoras mexicanas requieren DataBursátil', 503));
      }
      return this.mexico.getHistoricalPrices(symbol, from, to);
    }
    const attempts: Array<() => Promise<HistoricalPrice[]>> = [];
    if (this.fmp.configured()) {
      attempts.push(() => this.fmp.getHistoricalPrices(symbol, from, to));
    }
    if (this.finnhub.configured()) {
      attempts.push(() => this.finnhub.getHistoricalPrices(symbol, from, to));
    }
    if (attempts.length === 0) {
      return Promise.reject(new MarketDataError('El histórico no está configurado', 503));
    }
    return this.firstAvailable(attempts);
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    const tasks: Promise<SymbolMatch[]>[] = [];
    if (this.finnhub.configured()) {
      tasks.push(this.finnhub.searchSymbols(query).catch(() => []));
    }
    if (this.fmp.configured()) {
      tasks.push(this.fmp.searchSymbols(query).catch(() => []));
    }
    if (this.mexico.configured()) {
      tasks.push(this.mexico.searchSymbols(query).catch(() => []));
    }
    const groups = await Promise.all(tasks);
    const seen = new Set<string>();
    return groups.flat().filter((item) => {
      if (seen.has(item.symbol)) {
        return false;
      }
      seen.add(item.symbol);
      return true;
    }).slice(0, 8);
  }

  getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    if (isMexicanListing(symbol) && this.mexico.configured()) {
      return this.mexico.getCompanyProfile(symbol);
    }
    return this.firstAvailable([
      () => this.finnhub.getCompanyProfile(symbol),
      () => this.fmp.getCompanyProfile(symbol),
    ]);
  }

  getCompanyNews(symbol: string, from: Date, to: Date): Promise<NewsArticle[]> {
    if (isMexicanListing(symbol) && this.mexico.configured()) {
      return this.mexico.getCompanyNews(symbol, from, to);
    }
    return this.finnhub.getCompanyNews(symbol, from, to);
  }

  getFundamentals(symbol: string): Promise<Fundamentals> {
    if (isMexicanListing(symbol) && this.mexico.configured()) {
      return this.mexico.getFundamentals(symbol);
    }
    return this.firstAvailable([
      () => this.finnhub.getFundamentals(symbol),
      () => this.fmp.getFundamentals(symbol),
    ]);
  }

  private quoteAbroad(symbol: string): Promise<Quote> {
    const attempts: Array<() => Promise<Quote>> = [];
    if (this.finnhub.configured()) {
      attempts.push(() => this.finnhub.getQuote(symbol));
    }
    if (this.fmp.configured()) {
      attempts.push(() => this.fmp.getQuote(symbol));
    }
    if (attempts.length === 0) {
      return Promise.reject(new MarketDataError('Las cotizaciones no están configuradas', 503));
    }
    return this.firstAvailable(attempts);
  }

  private async firstAvailable<T>(attempts: Array<() => Promise<T>>): Promise<T> {
    let last: unknown;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (error) {
        last = error;
        const status = error instanceof MarketDataError ? error.statusCode : 'n/a';
        const technical = error instanceof Error ? error.message : 'error';
        this.logger.warn(`Intento de mercado fallido (${status}): ${technical}`);
        if (!canFallback(error)) {
          throw error;
        }
      }
    }
    if (last instanceof Error) {
      throw last;
    }
    throw new MarketDataError('No se pudo consultar el mercado');
  }
}

function canFallback(error: unknown): boolean {
  if (!(error instanceof MarketDataError)) {
    return true;
  }
  return error.statusCode !== 401;
}
