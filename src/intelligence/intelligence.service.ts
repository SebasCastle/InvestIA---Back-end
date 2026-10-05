import { Injectable } from '@nestjs/common';
import { PortfolioService } from '../portfolio/portfolio.service';
import { presentAsset } from '../portfolio/portfolio.presenter';
import type { AssetResponse } from '../portfolio/portfolio.types';
import { MarketDataError } from '../market-data/market-data.provider';
import { MarketDataService } from '../market-data/market-data.service';
import type { CompanyProfile, Fundamentals, NewsArticle } from '../market-data/market-data.types';

export type AssetIntelligence = {
  asset: AssetResponse;
  profile: CompanyProfile | null;
  fundamentals: Fundamentals | null;
  news: NewsArticle[];
  error: string | null;
  lastUpdated: string | null;
};

const ASSET_LIMIT = 15;

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly portfolios: PortfolioService,
    private readonly marketData: MarketDataService,
  ) {}

  async forUser(userId: string, portfolioId?: string): Promise<{ assets: AssetIntelligence[] }> {
    const owned = portfolioId
      ? [await this.ownedWithAssets(userId, portfolioId)]
      : await this.portfolios.listOwned(userId);
    const assets = uniqueAssets(owned);
    const items = await Promise.all(assets.slice(0, ASSET_LIMIT).map((asset) => this.enrich(asset)));
    return { assets: items };
  }

  private async ownedWithAssets(userId: string, portfolioId: string) {
    await this.portfolios.requireOwned(userId, portfolioId);
    const [portfolio] = await this.portfolios.listOwned(userId).then((rows) =>
      rows.filter((row) => row.id === portfolioId),
    );
    if (!portfolio) {
      return { transactions: [] };
    }
    return portfolio;
  }

  private async enrich(asset: AssetResponse): Promise<AssetIntelligence> {
    const errors: string[] = [];
    const [profile, fundamentals, news] = await Promise.all([
      this.marketData.getProfile(asset.symbol).catch((error: unknown) => {
        errors.push(messageOf(error));
        return null;
      }),
      this.marketData.getFundamentals(asset.symbol).catch((error: unknown) => {
        errors.push(messageOf(error));
        return null;
      }),
      this.marketData.getNews(asset.symbol).catch((error: unknown) => {
        errors.push(messageOf(error));
        return [] as NewsArticle[];
      }),
    ]);

    const stamps = [profile?.lastUpdated, fundamentals?.lastUpdated, news[0]?.publishedAt].filter(
      (value): value is string => Boolean(value),
    );
    return {
      asset,
      profile,
      fundamentals,
      news,
      error: errors[0] ?? null,
      lastUpdated: stamps.sort().at(-1) ?? null,
    };
  }
}

function uniqueAssets(
  portfolios: { transactions: { asset: Parameters<typeof presentAsset>[0] | null }[] }[],
): AssetResponse[] {
  const bySymbol = new Map<string, AssetResponse>();
  for (const portfolio of portfolios) {
    for (const transaction of portfolio.transactions) {
      if (!transaction.asset || bySymbol.has(transaction.asset.symbol)) {
        continue;
      }
      bySymbol.set(transaction.asset.symbol, presentAsset(transaction.asset));
    }
  }
  return [...bySymbol.values()];
}

function messageOf(error: unknown): string {
  if (error instanceof MarketDataError || error instanceof Error) {
    return error.message;
  }
  return 'No se pudo consultar el activo';
}
