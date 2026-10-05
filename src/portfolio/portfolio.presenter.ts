import { Prisma } from '@prisma/client';
import type { PricesStatus, Quote } from '../market-data/market-data.types';
import type { PortfolioCalculation } from './portfolio-calculator';
import type { AssetResponse, SummaryResponse, TransactionResponse } from './portfolio.types';

export function toNumber(value: Prisma.Decimal | null): number | null {
  if (!value) {
    return null;
  }
  return Number(value.toFixed(8));
}

export function presentTransaction(transaction: {
  id: string;
  type: TransactionResponse['type'];
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  fees: Prisma.Decimal;
  currency: string;
  executedAt: Date;
  createdAt: Date;
  asset: Parameters<typeof presentAsset>[0] | null;
}): TransactionResponse {
  return {
    id: transaction.id,
    type: transaction.type,
    quantity: toNumber(transaction.quantity) ?? 0,
    price: toNumber(transaction.price) ?? 0,
    fees: toNumber(transaction.fees) ?? 0,
    currency: transaction.currency,
    executedAt: transaction.executedAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
    asset: transaction.asset ? presentAsset(transaction.asset) : null,
  };
}

export function presentAsset(asset: {
  id: string;
  symbol: string;
  name: string;
  type: AssetResponse['type'];
  exchange: string;
  currency: string;
}): AssetResponse {
  return {
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    type: asset.type,
    exchange: asset.exchange,
    currency: asset.currency,
  };
}

export function presentSummary(
  currency: string,
  calculation: PortfolioCalculation,
  assets: Map<string, AssetResponse>,
  quotes: Record<string, Quote>,
  pricesStatus: PricesStatus,
  pricesError: string | null,
): SummaryResponse {
  const positions = calculation.positions.map((position) => {
    const asset = assets.get(position.assetId) ?? null;
    const quote = asset ? quotes[asset.symbol] : undefined;
    return {
      asset,
      quantity: toNumber(position.quantity) ?? 0,
      averageCost: toNumber(position.averageCost) ?? 0,
      investedAmount: toNumber(position.investedAmount) ?? 0,
      marketPrice: toNumber(position.marketPrice),
      marketValue: toNumber(position.marketValue) ?? 0,
      unrealizedPl: toNumber(position.unrealizedPl) ?? 0,
      realizedPl: toNumber(position.realizedPl) ?? 0,
      totalPl: toNumber(position.totalPl) ?? 0,
      dailyChange: toNumber(position.dailyChange),
      priceAvailable: position.priceAvailable,
      lastUpdated: quote?.lastUpdated ?? null,
    };
  });

  const open = positions.filter((position) => position.quantity > 0);
  const allocationBase = open.reduce((sum, position) => sum + position.marketValue, 0);
  const allocation = open.map((position) => ({
    symbol: position.asset?.symbol ?? 'N/A',
    name: position.asset?.name ?? 'Activo',
    value: position.marketValue,
    percent: allocationBase > 0 ? (position.marketValue / allocationBase) * 100 : 0,
  }));
  const portfolioValue = toNumber(calculation.portfolioValue) ?? 0;
  const dailyChange = toNumber(calculation.dailyChange);
  const previous = dailyChange === null ? null : portfolioValue - dailyChange;

  return {
    currency,
    cash: toNumber(calculation.cash) ?? 0,
    investedAmount: toNumber(calculation.investedAmount) ?? 0,
    marketValue: toNumber(calculation.marketValue) ?? 0,
    portfolioValue,
    realizedPl: toNumber(calculation.realizedPl) ?? 0,
    unrealizedPl: toNumber(calculation.unrealizedPl) ?? 0,
    totalPl: toNumber(calculation.totalPl) ?? 0,
    depositsIn: toNumber(calculation.depositsIn) ?? 0,
    returnPercent: toNumber(calculation.returnPercent),
    dailyChange,
    dailyChangePercent:
      dailyChange !== null && previous !== null && previous !== 0
        ? (dailyChange / previous) * 100
        : null,
    pricesStatus: calculation.pricesComplete ? 'ok' : pricesStatus === 'ok' ? 'partial' : pricesStatus,
    pricesError: calculation.pricesComplete ? null : pricesError,
    positions,
    allocation,
    plByAsset: positions.map((position) => ({
      symbol: position.asset?.symbol ?? 'N/A',
      name: position.asset?.name ?? 'Activo',
      pl: position.totalPl,
    })),
  };
}
