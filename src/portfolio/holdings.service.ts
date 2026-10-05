import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { MarketDataService } from '../market-data/market-data.service';
import type { QuoteLookup } from '../market-data/market-data.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPerformanceSeries,
  calculatePortfolio,
  dateKey,
  eachDate,
  PortfolioCalculationError,
  type CalcTransaction,
  type MarkPrice,
} from './portfolio-calculator';
import { presentAsset, presentSummary, toNumber } from './portfolio.presenter';
import { PortfolioService } from './portfolio.service';
import type { SummaryResponse } from './portfolio.types';

type TxClient = Prisma.TransactionClient;

type LoadedPortfolio = Awaited<ReturnType<PortfolioService['listOwned']>>[number];

export const PERFORMANCE_RANGES = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 182,
  '1Y': 365,
  ALL: 0,
} as const;

export type PerformanceRange = keyof typeof PERFORMANCE_RANGES;

export function parsePerformanceRange(range?: string): PerformanceRange {
  if (range && range in PERFORMANCE_RANGES) {
    return range as PerformanceRange;
  }
  return '1Y';
}

@Injectable()
export class HoldingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: PortfolioService,
    private readonly marketData: MarketDataService,
  ) {}

  async rebuild(db: TxClient, portfolioId: string): Promise<void> {
    const transactions = await db.transaction.findMany({
      where: { portfolioId },
      orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
    });

    let calculation;
    try {
      calculation = calculatePortfolio(transactions.map(toCalcTransaction));
    } catch (error) {
      if (error instanceof PortfolioCalculationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await db.position.deleteMany({ where: { portfolioId } });
    const open = calculation.positions.filter((position) => position.quantity.gt(0));
    if (open.length > 0) {
      await db.position.createMany({
        data: open.map((position) => ({
          portfolioId,
          assetId: position.assetId,
          quantity: position.quantity,
          averageCost: position.averageCost,
        })),
      });
    }
  }

  async summary(userId: string, portfolioId: string): Promise<SummaryResponse> {
    const portfolio = await this.portfolios.requireOwned(userId, portfolioId);
    const [loaded] = await this.withTransactions([portfolio.id]);
    const lookup = await this.quotesFor([loaded]);
    return this.summarize(loaded, lookup);
  }

  async list(userId: string) {
    const portfolios = await this.portfolios.listOwned(userId);
    const lookup = await this.quotesFor(portfolios);
    return portfolios.map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
      summary: this.summarize(portfolio, lookup),
    }));
  }

  async overview(userId: string, range: PerformanceRange = '1Y') {
    const portfolios = await this.list(userId);
    const currencies = new Set(portfolios.map((portfolio) => portfolio.currency));
    const aggregated = portfolios.length > 0 && currencies.size === 1;
    return {
      currency: aggregated ? portfolios[0].currency : null,
      aggregated,
      portfolios,
      summary: aggregated ? this.mergeSummaries(portfolios.map((item) => item.summary)) : null,
      performance: aggregated
        ? await this.combinedPerformance(
            portfolios.map((item) => item.id),
            range,
          )
        : [],
    };
  }

  async performance(userId: string, portfolioId: string, range: PerformanceRange = '1Y') {
    await this.portfolios.requireOwned(userId, portfolioId);
    const [loaded] = await this.withTransactions([portfolioId]);
    const series = await this.seriesFor(loaded, range);
    return {
      range,
      pricesStatus: series.pricesStatus,
      pricesError: series.pricesError,
      points: series.points,
    };
  }

  private async combinedPerformance(portfolioIds: string[], range: PerformanceRange) {
    const loaded = await this.withTransactions(portfolioIds);
    const series = await Promise.all(loaded.map((portfolio) => this.seriesFor(portfolio, range)));
    const totals = new Map<string, number>();
    for (const item of series) {
      for (const point of item.points) {
        totals.set(point.date, (totals.get(point.date) ?? 0) + point.value);
      }
    }
    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({ date, value }));
  }

  private async seriesFor(portfolio: LoadedPortfolio, range: PerformanceRange) {
    const transactions = portfolio.transactions.map(toCalcTransaction);
    const today = dateKey(new Date());
    const first = transactions[0] ? dateKey(transactions[0].executedAt) : today;
    const from = range === 'ALL' ? first : shiftDate(today, PERFORMANCE_RANGES[range]);
    const start = from < first ? first : from;
    const dates = eachDate(start, today);
    const assets = new Map(
      portfolio.transactions
        .filter((transaction) => transaction.asset)
        .map((transaction) => [transaction.assetId as string, transaction.asset!]),
    );

    let pricesStatus: SummaryResponse['pricesStatus'] = 'ok';
    let pricesError: string | null = null;
    const closes: Record<string, Record<string, number>> = {};

    await Promise.all(
      [...assets.entries()].map(async ([assetId, asset]) => {
        const history = await this.marketData.getHistory(
          asset.symbol,
          new Date(`${start}T00:00:00.000Z`),
          new Date(`${today}T23:59:59.999Z`),
        );
        if (history.error) {
          pricesStatus = 'unavailable';
          pricesError = history.error;
          return;
        }
        closes[assetId] = Object.fromEntries(history.prices.map((price) => [price.date, price.close]));
      }),
    );

    const points = buildPerformanceSeries(transactions, closes, dates).map((point) => ({
      date: point.date,
      value: toNumber(point.value) ?? 0,
    }));
    return { points, pricesStatus, pricesError };
  }

  private summarize(portfolio: LoadedPortfolio, lookup: QuoteLookup): SummaryResponse {
    const assets = new Map<string, ReturnType<typeof presentAsset>>();
    const prices: Record<string, MarkPrice> = {};
    for (const transaction of portfolio.transactions) {
      if (!transaction.asset || !transaction.assetId) {
        continue;
      }
      assets.set(transaction.assetId, presentAsset(transaction.asset));
      const quote = lookup.quotes[transaction.asset.symbol];
      if (quote) {
        prices[transaction.assetId] = { price: quote.price, change: quote.change };
      }
    }

    const calculation = calculatePortfolio(
      portfolio.transactions.map(toCalcTransaction),
      prices,
      portfolio.currency,
    );
    return presentSummary(
      portfolio.currency,
      calculation,
      assets,
      lookup.quotes,
      lookup.pricesStatus,
      lookup.error,
    );
  }

  private mergeSummaries(summaries: SummaryResponse[]): SummaryResponse {
    const first = summaries[0];
    const positions = summaries.flatMap((summary) => summary.positions);
    const portfolioValue = sum(summaries.map((summary) => summary.portfolioValue));
    const dailyValues = summaries.map((summary) => summary.dailyChange);
    const dailyChange = dailyValues.every((value) => value !== null)
      ? sum(dailyValues as number[])
      : null;
    const previous = dailyChange === null ? null : portfolioValue - dailyChange;
    const allocationBase = positions
      .filter((position) => position.quantity > 0)
      .reduce((total, position) => total + position.marketValue, 0);

    return {
      currency: first.currency,
      cash: sum(summaries.map((summary) => summary.cash)),
      investedAmount: sum(summaries.map((summary) => summary.investedAmount)),
      marketValue: sum(summaries.map((summary) => summary.marketValue)),
      portfolioValue,
      realizedPl: sum(summaries.map((summary) => summary.realizedPl)),
      unrealizedPl: sum(summaries.map((summary) => summary.unrealizedPl)),
      totalPl: sum(summaries.map((summary) => summary.totalPl)),
      depositsIn: sum(summaries.map((summary) => summary.depositsIn)),
      returnPercent:
        sum(summaries.map((summary) => summary.depositsIn)) > 0
          ? (sum(summaries.map((summary) => summary.totalPl)) /
              sum(summaries.map((summary) => summary.depositsIn))) *
            100
          : null,
      dailyChange,
      dailyChangePercent:
        dailyChange !== null && previous !== null && previous !== 0
          ? (dailyChange / previous) * 100
          : null,
      pricesStatus: summaries.some((summary) => summary.pricesStatus === 'unavailable')
        ? 'unavailable'
        : summaries.some((summary) => summary.pricesStatus === 'partial')
          ? 'partial'
          : 'ok',
      pricesError: summaries.find((summary) => summary.pricesError)?.pricesError ?? null,
      positions,
      allocation: positions
        .filter((position) => position.quantity > 0)
        .map((position) => ({
          symbol: position.asset?.symbol ?? 'N/A',
          name: position.asset?.name ?? 'Activo',
          value: position.marketValue,
          percent: allocationBase > 0 ? (position.marketValue / allocationBase) * 100 : 0,
        })),
      plByAsset: positions.map((position) => ({
        symbol: position.asset?.symbol ?? 'N/A',
        name: position.asset?.name ?? 'Activo',
        pl: position.totalPl,
      })),
    };
  }

  private async withTransactions(ids: string[]): Promise<LoadedPortfolio[]> {
    return this.prisma.portfolio.findMany({
      where: { id: { in: ids } },
      include: {
        transactions: {
          orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
          include: { asset: true },
        },
      },
    });
  }

  private quotesFor(portfolios: LoadedPortfolio[]): Promise<QuoteLookup> {
    const symbols = portfolios.flatMap((portfolio) =>
      portfolio.transactions.flatMap((transaction) =>
        transaction.asset ? [transaction.asset.symbol] : [],
      ),
    );
    return this.marketData.getQuotes(symbols);
  }
}

function toCalcTransaction(transaction: {
  assetId: string | null;
  type: TransactionType;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  fees: Prisma.Decimal;
  currency: string;
  executedAt: Date;
  createdAt: Date;
}): CalcTransaction {
  return {
    assetId: transaction.assetId,
    type: transaction.type,
    quantity: transaction.quantity,
    price: transaction.price,
    fees: transaction.fees,
    currency: transaction.currency,
    executedAt: transaction.executedAt,
    createdAt: transaction.createdAt,
  };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return dateKey(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
