import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataError, type MarketDataProvider } from './market-data.provider';
import type { CompanyProfile, Fundamentals, HistoricalPrice, NewsArticle, Quote, SymbolMatch } from './market-data.types';
import { finiteNumber, providerRequest } from './provider-http';
import { isIndexSymbol, mexicanSeries } from './symbol-market';

@Injectable()
export class DatabursatilProvider implements MarketDataProvider {
  readonly name = 'databursatil';

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('DATABURSATIL_TOKEN')?.trim());
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (isIndexSymbol(symbol)) {
      return this.indexQuote(symbol);
    }
    const series = mexicanSeries(symbol);
    const body = await this.get<unknown>('cotizaciones', {
      emisora_serie: series,
      concepto: 'U,C,M,A',
      bolsa: 'BMV,BIVA',
    });
    const quote = readListingQuote(body, series);
    if (!quote) {
      throw new MarketDataError(`No hay cotización para ${symbol}`, 404);
    }
    return { symbol: series, ...quote };
  }

  async getHistoricalPrices(symbol: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    const series = mexicanSeries(symbol);
    const body = await this.get<unknown>('historicos', {
      emisora_serie: series,
      inicio: from.toISOString().slice(0, 10),
      final: to.toISOString().slice(0, 10),
    });
    return readHistory(body);
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    const body = await this.get<unknown>('emisoras', { letra: query.trim().toUpperCase() });
    return readIssuers(body).slice(0, 8);
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const series = mexicanSeries(symbol);
    return {
      symbol: series,
      name: series,
      exchange: 'BMV',
      currency: 'MXN',
      industry: null,
      weburl: null,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getCompanyNews(symbol: string, _from?: Date, _to?: Date): Promise<NewsArticle[]> {
    const body = await this.get<unknown>('noticias', {});
    return readNews(body, mexicanSeries(symbol)).slice(0, 8);
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    return {
      symbol: mexicanSeries(symbol),
      marketCap: null,
      peRatio: null,
      pbRatio: null,
      eps: null,
      dividendYield: null,
      beta: null,
      week52High: null,
      week52Low: null,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async indexQuote(symbol: string): Promise<Quote> {
    const body = await this.get<Record<string, { u?: number; m?: number; c?: number; f?: string }>>('indices', {
      ticker: 'IPC',
    });
    const row = body.IPC ?? Object.values(body)[0];
    if (!row || typeof row.u !== 'number') {
      throw new MarketDataError('No hay cotización para IPC', 404);
    }
    return {
      symbol,
      price: row.u,
      change: row.m ?? 0,
      changePercent: row.c ?? 0,
      lastUpdated: row.f ? new Date(row.f.replace(' ', 'T')).toISOString() : new Date().toISOString(),
    };
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const token = this.config.get<string>('DATABURSATIL_TOKEN')?.trim();
    if (!token) {
      throw new MarketDataError('DataBursátil no está configurado');
    }
    const url = new URL(`https://api.databursatil.com/v2/${path}`);
    url.searchParams.set('token', token);
    for (const [name, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(name, value);
      }
    }
    return providerRequest<T>({ provider: 'DataBursátil', url, secret: token });
  }
}

function readListingQuote(body: unknown, series: string): Omit<Quote, 'symbol'> | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const entry = (body as Record<string, unknown>)[series] ?? Object.values(body as Record<string, unknown>)[0];
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const venues = entry as Record<string, { u?: number; c?: number; m?: number; f?: string }>;
  const venue = venues.BMV ?? venues.BIVA ?? Object.values(venues)[0];
  if (!venue || typeof venue.u !== 'number') {
    return null;
  }
  return {
    price: venue.u,
    change: venue.m ?? 0,
    changePercent: venue.c ?? 0,
    lastUpdated: venue.f ? new Date(String(venue.f).replace(' ', 'T')).toISOString() : new Date().toISOString(),
  };
}

export function readHistory(body: unknown): HistoricalPrice[] {
  if (Array.isArray(body)) {
    return body.flatMap((row) => barFrom(row));
  }
  if (!body || typeof body !== 'object') {
    return [];
  }
  return Object.entries(body as Record<string, unknown>)
    .flatMap(([date, value]) => barFrom(value, date))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function barFrom(value: unknown, fallbackDate?: string): HistoricalPrice[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const row = value as { fecha?: string; date?: string; precio?: number; close?: number; importe?: number };
  const date = (row.fecha || row.date || fallbackDate || '').slice(0, 10);
  const close = finiteNumber(row.precio) ?? finiteNumber(row.close);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || close === null) {
    return [];
  }
  return [{ date, open: null, high: null, low: null, close, volume: finiteNumber(row.importe) }];
}

function readIssuers(body: unknown): SymbolMatch[] {
  const rows = Array.isArray(body) ? body : Object.values((body ?? {}) as Record<string, unknown>);
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return [];
    }
    const item = row as { emisora_serie?: string; emisora?: string; serie?: string; nombre?: string; name?: string };
    const symbol = (item.emisora_serie || `${item.emisora ?? ''}${item.serie ?? ''}`).trim().toUpperCase();
    if (!symbol) {
      return [];
    }
    return [{ symbol, name: item.nombre || item.name || symbol, type: 'BMV' }];
  });
}

function readNews(body: unknown, symbol: string): NewsArticle[] {
  const rows = Array.isArray(body) ? body : [];
  return rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object') {
      return [];
    }
    const item = row as { titulo?: string; headline?: string; fuente?: string; url?: string; fecha?: string };
    const headline = item.titulo || item.headline || '';
    if (!headline) {
      return [];
    }
    return [
      {
        id: `${symbol}-${index}`,
        symbol,
        headline,
        summary: '',
        source: item.fuente || 'DataBursátil',
        url: item.url || '',
        publishedAt: item.fecha ? new Date(item.fecha).toISOString() : new Date().toISOString(),
      },
    ];
  });
}
