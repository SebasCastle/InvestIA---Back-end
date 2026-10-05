import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataError, type MarketDataProvider } from './market-data.provider';
import type { CompanyProfile, Fundamentals, HistoricalPrice, NewsArticle, Quote, SymbolMatch } from './market-data.types';
import { finiteNumber, providerRequest } from './provider-http';

type FmpBar = {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

type FmpQuote = {
  symbol?: string;
  price?: number;
  change?: number;
  changePercentage?: number;
  changesPercentage?: number;
  timestamp?: number;
};

type FmpSearch = {
  symbol?: string;
  name?: string;
  currency?: string;
  exchangeShortName?: string;
  exchange?: string;
};

type FmpProfile = {
  symbol?: string;
  companyName?: string;
  exchangeShortName?: string;
  exchange?: string;
  currency?: string;
  industry?: string;
  website?: string;
  mktCap?: number;
  beta?: number;
};

@Injectable()
export class FmpProvider implements MarketDataProvider {
  readonly name = 'fmp';

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('FMP_API_KEY')?.trim());
  }

  async getQuote(symbol: string): Promise<Quote> {
    const rows = await this.get<FmpQuote[]>('quote', { symbol });
    const row = rows[0];
    if (!row || typeof row.price !== 'number') {
      throw new MarketDataError(`No hay cotización para ${symbol}`, 404);
    }
    return {
      symbol,
      price: row.price,
      change: row.change ?? 0,
      changePercent: row.changePercentage ?? row.changesPercentage ?? 0,
      lastUpdated: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : new Date().toISOString(),
    };
  }

  async getHistoricalPrices(symbol: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    const rows = await this.get<FmpBar[]>('historical-price-eod/full', {
      symbol,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows
      .flatMap((row) => {
        if (!row.date || typeof row.close !== 'number') {
          return [];
        }
        return [
          {
            date: row.date.slice(0, 10),
            open: finiteNumber(row.open),
            high: finiteNumber(row.high),
            low: finiteNumber(row.low),
            close: row.close,
            volume: finiteNumber(row.volume),
          },
        ];
      })
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    const rows = await this.get<FmpSearch[]>('search-symbol', { query });
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.slice(0, 8).flatMap((row) => {
      const symbol = row.symbol?.trim().toUpperCase();
      if (!symbol) {
        return [];
      }
      return [{ symbol, name: row.name?.trim() || symbol, type: row.exchangeShortName || row.exchange || 'FMP' }];
    });
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const rows = await this.get<FmpProfile[]>('profile', { symbol });
    const row = rows[0];
    if (!row?.companyName && !row?.symbol) {
      throw new MarketDataError(`No hay perfil para ${symbol}`, 404);
    }
    return {
      symbol: row.symbol ?? symbol,
      name: row.companyName ?? symbol,
      exchange: row.exchangeShortName || row.exchange || '',
      currency: row.currency || '',
      industry: row.industry ?? null,
      weburl: row.website ?? null,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getCompanyNews(_symbol: string, _from?: Date, _to?: Date): Promise<NewsArticle[]> {
    throw new MarketDataError('FMP no es la fuente de noticias', 404);
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const rows = await this.get<FmpProfile[]>('profile', { symbol });
    const row = rows[0];
    return {
      symbol,
      marketCap: finiteNumber(row?.mktCap),
      peRatio: null,
      pbRatio: null,
      eps: null,
      dividendYield: null,
      beta: finiteNumber(row?.beta),
      week52High: null,
      week52Low: null,
      lastUpdated: new Date().toISOString(),
    };
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const key = this.config.get<string>('FMP_API_KEY')?.trim();
    if (!key) {
      throw new MarketDataError('FMP no está configurado');
    }
    const url = new URL(`https://financialmodelingprep.com/stable/${path}`);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    url.searchParams.set('apikey', key);
    return providerRequest<T>({ provider: 'FMP', url, secret: key });
  }
}
