import { Injectable } from '@nestjs/common';
import { MarketDataService } from '../market-data/market-data.service';
import { HoldingsService, parsePerformanceRange, type PerformanceRange } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { betaToBenchmark, compareToBenchmark, riskMetrics, splitContributors } from './analytics-calculator';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly portfolios: PortfolioService,
    private readonly holdings: HoldingsService,
    private readonly marketData: MarketDataService,
  ) {}

  async report(userId: string, portfolioId: string | undefined, rangeInput: string | undefined, benchmarkSymbol: string) {
    const range = parsePerformanceRange(rangeInput);
    const symbol = benchmarkSymbol.trim().toUpperCase() || 'SPY';

    if (!portfolioId) {
      const overview = await this.holdings.overview(userId);
      if (!overview.aggregated || !overview.summary) {
        return emptyReport(null, null, overview.currency, false, range, symbol);
      }
    return this.build(
      null,
      'Todos',
        overview.summary.currency,
        true,
        range,
        symbol,
        overview.performance,
        overview.summary,
      );
    }

    const portfolio = await this.portfolios.requireOwned(userId, portfolioId);
    const [summary, performance] = await Promise.all([
      this.holdings.summary(userId, portfolioId),
      this.holdings.performance(userId, portfolioId, range),
    ]);
    return this.build(
      portfolio.id,
      portfolio.name,
      portfolio.currency,
      true,
      range,
      symbol,
      performance.points,
      summary,
      performance.pricesStatus,
      performance.pricesError,
    );
  }

  private async build(
    portfolioId: string | null,
    name: string,
    currency: string,
    aggregated: boolean,
    range: PerformanceRange,
    symbol: string,
    points: { date: string; value: number }[],
    summary: {
      allocation: { symbol: string; name: string; value: number; percent: number }[];
      plByAsset: { symbol: string; name: string; pl: number }[];
      pricesStatus: 'ok' | 'partial' | 'unavailable';
      pricesError: string | null;
    },
    pricesStatus = summary.pricesStatus,
    pricesError = summary.pricesError,
  ) {
    const history = await this.marketData.getHistory(
      symbol,
      points[0] ? new Date(`${points[0].date}T00:00:00.000Z`) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      new Date(),
    );
    const benchmark = compareToBenchmark(points, history.prices);
    const split = splitContributors(summary.plByAsset);
    return {
      portfolioId,
      name,
      currency,
      aggregated,
      range,
      benchmarkSymbol: symbol,
      performance: points,
      benchmark: { ...benchmark, error: history.error },
      allocation: summary.allocation.filter((slice) => slice.value > 0),
      contributors: split.contributors,
      detractors: split.detractors,
      risk: { ...riskMetrics(points, summary.allocation), beta: betaToBenchmark(points, history.prices) },
      pricesStatus,
      pricesError,
    };
  }
}

function emptyReport(
  portfolioId: string | null,
  name: string | null,
  currency: string | null,
  aggregated: boolean,
  range: PerformanceRange,
  benchmarkSymbol: string,
) {
  return {
    portfolioId,
    name,
    currency,
    aggregated,
    range,
    benchmarkSymbol,
    performance: [],
    benchmark: {
      available: false,
      portfolioReturn: null,
      benchmarkReturn: null,
      excessReturn: null,
      points: [],
      error: null,
    },
    allocation: [],
    contributors: [],
    detractors: [],
    risk: { ...riskMetrics([], []), beta: null },
    pricesStatus: 'ok' as const,
    pricesError: null,
  };
}
