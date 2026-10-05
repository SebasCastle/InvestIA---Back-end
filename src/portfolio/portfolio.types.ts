import { AssetType, TransactionType } from '@prisma/client';
import type { PricesStatus } from '../market-data/market-data.types';

export type AssetResponse = {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  exchange: string;
  currency: string;
};

export type PositionResponse = {
  asset: AssetResponse | null;
  quantity: number;
  averageCost: number;
  investedAmount: number;
  marketPrice: number | null;
  marketValue: number;
  unrealizedPl: number;
  realizedPl: number;
  totalPl: number;
  dailyChange: number | null;
  priceAvailable: boolean;
  lastUpdated: string | null;
};

export type AllocationSlice = {
  symbol: string;
  name: string;
  value: number;
  percent: number;
};

export type PlSlice = {
  symbol: string;
  name: string;
  pl: number;
};

export type SummaryResponse = {
  currency: string;
  cash: number;
  investedAmount: number;
  marketValue: number;
  portfolioValue: number;
  realizedPl: number;
  unrealizedPl: number;
  totalPl: number;
  depositsIn: number;
  returnPercent: number | null;
  dailyChange: number | null;
  dailyChangePercent: number | null;
  pricesStatus: PricesStatus;
  pricesError: string | null;
  positions: PositionResponse[];
  allocation: AllocationSlice[];
  plByAsset: PlSlice[];
};

export type TransactionResponse = {
  id: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  executedAt: string;
  createdAt: string;
  asset: AssetResponse | null;
};
