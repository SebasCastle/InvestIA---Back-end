import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { IntelligenceService } from '../intelligence/intelligence.service';
import { MarketDataService } from '../market-data/market-data.service';
import { HoldingsService, parsePerformanceRange } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../transactions/transactions.service';
import type { ModelTool } from './gemini.client';

export const AI_TOOLS: ModelTool[] = [
  {
    name: 'list_portfolios',
    description: 'Lista los portafolios del usuario con su resumen ya calculado.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_portfolio',
    description: 'Devuelve el resumen calculado de un portafolio: valor, efectivo, invertido y P/L.',
    parameters: {
      type: 'object',
      properties: { portfolioId: { type: 'string' } },
      required: ['portfolioId'],
    },
  },
  {
    name: 'get_positions',
    description: 'Devuelve las posiciones calculadas de un portafolio.',
    parameters: {
      type: 'object',
      properties: { portfolioId: { type: 'string' } },
      required: ['portfolioId'],
    },
  },
  {
    name: 'get_transactions',
    description: 'Devuelve los movimientos registrados de un portafolio. Solo lectura.',
    parameters: {
      type: 'object',
      properties: { portfolioId: { type: 'string' } },
      required: ['portfolioId'],
    },
  },
  {
    name: 'get_quotes',
    description: 'Cotizaciones actuales. No calcules el valor del portafolio con ellas; usa get_portfolio.',
    parameters: {
      type: 'object',
      properties: { symbols: { type: 'array', items: { type: 'string' } } },
      required: ['symbols'],
    },
  },
  {
    name: 'get_performance',
    description: 'Serie histórica de valor ya calculada. range: 1D, 1W, 1M, 3M, 6M, 1Y o ALL.',
    parameters: {
      type: 'object',
      properties: { portfolioId: { type: 'string' }, range: { type: 'string' } },
      required: ['portfolioId'],
    },
  },
  {
    name: 'get_allocation',
    description: 'Asignación por activo ya calculada.',
    parameters: {
      type: 'object',
      properties: { portfolioId: { type: 'string' } },
      required: ['portfolioId'],
    },
  },
  {
    name: 'get_benchmark',
    description: 'Compara el portafolio contra un índice. Incluye rendimiento, exceso, riesgo y contribuidores ya calculados.',
    parameters: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string' },
        range: { type: 'string' },
        benchmark: { type: 'string' },
      },
    },
  },
  {
    name: 'get_news',
    description: 'Noticias de los activos que el usuario tiene en cartera.',
    parameters: {
      type: 'object',
      properties: { portfolioId: { type: 'string' }, symbol: { type: 'string' } },
    },
  },
  {
    name: 'get_fundamentals',
    description: 'Fundamentales de un activo que el usuario tiene en cartera.',
    parameters: {
      type: 'object',
      properties: { symbol: { type: 'string' }, portfolioId: { type: 'string' } },
      required: ['symbol'],
    },
  },
];

const ALLOWED = new Set(AI_TOOLS.map((tool) => tool.name));

@Injectable()
export class AiToolExecutor {
  constructor(
    private readonly portfolios: PortfolioService,
    private readonly holdings: HoldingsService,
    private readonly transactions: TransactionsService,
    private readonly marketData: MarketDataService,
    private readonly intelligence: IntelligenceService,
    private readonly analytics: AnalyticsService,
  ) {}

  async run(userId: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!ALLOWED.has(name)) {
      return { error: 'Operación no permitida' };
    }
    try {
      return await this.dispatch(userId, name, args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'No se pudo consultar el dato' };
    }
  }

  private async dispatch(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const portfolioId = stringArg(args.portfolioId);
    const range = parsePerformanceRange(typeof args.range === 'string' ? args.range : undefined);

    if (name === 'list_portfolios') {
      const rows = await this.holdings.list(userId);
      return { portfolios: rows };
    }
    if (name === 'get_portfolio') {
      return { summary: await this.holdings.summary(userId, requiredId(portfolioId)) };
    }
    if (name === 'get_positions') {
      const summary = await this.holdings.summary(userId, requiredId(portfolioId));
      return { positions: summary.positions };
    }
    if (name === 'get_transactions') {
      const rows = await this.transactions.list(userId, requiredId(portfolioId));
      return { transactions: rows.slice(0, 30) };
    }
    if (name === 'get_quotes') {
      const symbols = Array.isArray(args.symbols) ? args.symbols.map(String).slice(0, 20) : [];
      return { quotes: await this.marketData.getQuotes(symbols) };
    }
    if (name === 'get_performance') {
      return { performance: await this.holdings.performance(userId, requiredId(portfolioId), range) };
    }
    if (name === 'get_allocation') {
      const summary = await this.holdings.summary(userId, requiredId(portfolioId));
      return { allocation: summary.allocation };
    }
    if (name === 'get_benchmark') {
      const benchmark = stringArg(args.benchmark) || 'SPY';
      return { analytics: await this.analytics.report(userId, portfolioId, range, benchmark) };
    }
    if (name === 'get_news' || name === 'get_fundamentals') {
      const intel = await this.intelligence.forUser(userId, portfolioId);
      const symbol = stringArg(args.symbol)?.toUpperCase();
      const assets = symbol ? intel.assets.filter((item) => item.asset.symbol === symbol) : intel.assets;
      if (symbol && assets.length === 0) {
        return { error: 'Ese símbolo no está entre los activos del usuario' };
      }
      if (name === 'get_fundamentals') {
        return {
          fundamentals: assets.map((item) => ({
            symbol: item.asset.symbol,
            fundamentals: item.fundamentals,
            error: item.error,
          })),
        };
      }
      return {
        news: assets.map((item) => ({
          symbol: item.asset.symbol,
          articles: item.news.slice(0, 5),
          error: item.error,
        })),
      };
    }
    return { error: 'Operación no permitida' };
  }
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredId(portfolioId: string | undefined): string {
  if (!portfolioId) {
    throw new Error('Falta el portafolio');
  }
  return portfolioId;
}
