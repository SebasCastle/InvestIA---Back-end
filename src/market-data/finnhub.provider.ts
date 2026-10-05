import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataError, type MarketDataProvider } from './market-data.provider';
import type { CompanyProfile, Fundamentals, HistoricalPrice, NewsArticle, Quote, SymbolMatch } from './market-data.types';

type FinnhubQuote = {
  c?: number;
  d?: number | null;
  dp?: number | null;
  t?: number;
};

type FinnhubCandles = {
  c?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  t?: number[];
  s?: string;
};

type FinnhubSearch = {
  result?: { description?: string; displaySymbol?: string; symbol?: string; type?: string }[];
};

type FinnhubProfile = {
  name?: string;
  ticker?: string;
  exchange?: string;
  currency?: string;
  finnhubIndustry?: string;
  weburl?: string;
};

type FinnhubNews = {
  id?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  datetime?: number;
};

type FinnhubMetrics = {
  metric?: Record<string, unknown>;
};

const CANDLE_DENIED =
  'Finnhub denegó las velas históricas. El plan de esta clave no incluye /stock/candle. Las cotizaciones en vivo siguen disponibles.';

@Injectable()
export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub';
  private readonly logger = new Logger(FinnhubProvider.name);
  private candlesDenied = false;

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('FINNHUB_API_KEY')?.trim());
  }

  async getQuote(symbol: string): Promise<Quote> {
    const body = await this.request<FinnhubQuote>('quote', { symbol });
    if (!body.t || body.c === undefined) {
      throw new MarketDataError(`No hay cotización para ${symbol}`, 404);
    }
    return {
      symbol,
      price: body.c,
      change: body.d ?? 0,
      changePercent: body.dp ?? 0,
      lastUpdated: new Date(body.t * 1000).toISOString(),
    };
  }

  async getHistoricalPrices(symbol: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    if (this.candlesDenied) {
      throw new MarketDataError(CANDLE_DENIED, 403);
    }
    const body = await this.request<FinnhubCandles>('stock/candle', {
      symbol,
      resolution: 'D',
      from: String(Math.floor(from.getTime() / 1000)),
      to: String(Math.floor(to.getTime() / 1000)),
    });
    if (body.s === 'no_data' || !body.t || !body.c) {
      return [];
    }
    return body.t.flatMap((timestamp, index) => {
      const close = body.c?.[index];
      if (typeof close !== 'number' || !Number.isFinite(close)) {
        return [];
      }
      return [
        {
          date: new Date(timestamp * 1000).toISOString().slice(0, 10),
          open: finite(body.o?.[index]),
          high: finite(body.h?.[index]),
          low: finite(body.l?.[index]),
          close,
          volume: null,
        },
      ];
    });
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    const body = await this.request<FinnhubSearch>('search', { q: query });
    return (body.result ?? [])
      .map((item) => ({
        symbol: (item.displaySymbol || item.symbol || '').trim().toUpperCase(),
        name: item.description?.trim() || item.symbol || '',
        type: item.type?.trim() || '',
      }))
      .filter((item) => item.symbol)
      .slice(0, 8);
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const body = await this.request<FinnhubProfile>('stock/profile2', { symbol });
    if (!body.ticker && !body.name) {
      throw new MarketDataError(`No hay perfil para ${symbol}`, 404);
    }
    return {
      symbol: body.ticker ?? symbol,
      name: body.name ?? symbol,
      exchange: body.exchange ?? '',
      currency: body.currency ?? '',
      industry: body.finnhubIndustry ?? null,
      weburl: body.weburl ?? null,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getCompanyNews(symbol: string, from: Date, to: Date): Promise<NewsArticle[]> {
    const body = await this.request<FinnhubNews[]>('company-news', {
      symbol,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
    if (!Array.isArray(body)) {
      return [];
    }
    return body.slice(0, 10).map((item) => ({
      id: String(item.id ?? item.headline ?? symbol),
      symbol,
      headline: item.headline ?? '',
      summary: item.summary ?? '',
      source: item.source ?? '',
      url: item.url ?? '',
      publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
    }));
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const body = await this.request<FinnhubMetrics>('stock/metric', { symbol, metric: 'all' });
    const metric = body.metric ?? {};
    const marketCapMillions = finite(metric.marketCapitalization);
    return {
      symbol,
      marketCap: marketCapMillions === null ? null : marketCapMillions * 1_000_000,
      peRatio: finite(metric.peNormalizedAnnual),
      pbRatio: finite(metric.pbAnnual),
      eps: finite(metric.epsNormalizedAnnual),
      dividendYield: finite(metric.dividendYieldIndicatedAnnual),
      beta: finite(metric.beta),
      week52High: finite(metric['52WeekHigh']),
      week52Low: finite(metric['52WeekLow']),
      lastUpdated: new Date().toISOString(),
    };
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const token = this.config.get<string>('FINNHUB_API_KEY');
    if (!token) {
      throw new MarketDataError('Los datos de mercado no están configurados');
    }

    const url = new URL(`https://finnhub.io/api/v1/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('token', token);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      this.logger.warn(`Finnhub no respondió en ${path}: ${timedOut ? 'timeout' : 'red'}`);
      throw new MarketDataError(
        timedOut
          ? 'Finnhub no respondió a tiempo'
          : 'No se pudo conectar con Finnhub',
      );
    }

    if (!response.ok) {
      const detail = await safeProviderMessage(response, token);
      if (response.status === 403 && path === 'stock/candle') {
        this.candlesDenied = true;
      }
      this.logger.warn(`Finnhub ${response.status} en ${path}${params.symbol ? ` (${params.symbol})` : ''}${detail ? `: ${detail}` : ''}`);
      throw new MarketDataError(messageForStatus(response.status, path), statusFor(response.status));
    }
    return (await response.json()) as T;
  }
}

async function safeProviderMessage(response: Response, token: string): Promise<string> {
  try {
    const raw = await response.text();
    const redacted = raw.replaceAll(token, '[redacted]');
    const parsed = JSON.parse(redacted) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error.slice(0, 180) : '';
  } catch {
    return '';
  }
}

function messageForStatus(status: number, path: string): string {
  if (status === 401) {
    return 'La clave de Finnhub fue rechazada';
  }
  if (status === 403) {
    return path === 'stock/candle'
      ? CANDLE_DENIED
      : 'Finnhub denegó el acceso a este recurso';
  }
  if (status === 404) {
    return 'Finnhub no encontró ese recurso';
  }
  if (status === 429) {
    return 'Finnhub limitó las consultas. Espera un momento y vuelve a intentar.';
  }
  if (status >= 500) {
    return 'Finnhub no está disponible en este momento';
  }
  return 'Finnhub respondió con un error inesperado';
}

function statusFor(status: number): number {
  if (status === 401 || status === 403 || status === 404 || status === 429) {
    return status;
  }
  return status >= 500 ? 503 : 502;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
