import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { IntelligenceService } from '../intelligence/intelligence.service';
import { HoldingsService } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../transactions/transactions.service';
import { renderPdf, renderWorkbook } from './report-document';
import { closingNarrative, type PortfolioReport } from './report.types';

@Injectable()
export class ReportsService {
  constructor(
    private readonly portfolios: PortfolioService,
    private readonly holdings: HoldingsService,
    private readonly transactions: TransactionsService,
    private readonly analytics: AnalyticsService,
    private readonly intelligence: IntelligenceService,
  ) {}

  async build(userId: string, portfolioId: string): Promise<PortfolioReport> {
    const portfolio = await this.portfolios.requireOwned(userId, portfolioId);
    const [summary, performance, transactions, analytics, intelligence] = await Promise.all([
      this.holdings.summary(userId, portfolioId),
      this.holdings.performance(userId, portfolioId, '1Y'),
      this.transactions.list(userId, portfolioId),
      this.analytics.report(userId, portfolioId, '1Y', 'SPY'),
      this.intelligence.forUser(userId, portfolioId),
    ]);

    const report: PortfolioReport = {
      generatedAt: new Date().toISOString(),
      portfolio: { id: portfolio.id, name: portfolio.name, currency: portfolio.currency },
      summary,
      performance: performance.points,
      transactions,
      benchmarkSymbol: analytics.benchmarkSymbol,
      portfolioReturn: analytics.benchmark.portfolioReturn,
      benchmarkReturn: analytics.benchmark.benchmarkReturn,
      excessReturn: analytics.benchmark.excessReturn,
      benchmarkError: analytics.benchmark.error,
      contributors: analytics.contributors,
      detractors: analytics.detractors,
      riskReason: analytics.risk.reason,
      annualizedVolatility: analytics.risk.annualizedVolatility,
      maxDrawdownPercent: analytics.risk.maxDrawdownPercent,
      news: intelligence.assets.flatMap((item) =>
        item.news.slice(0, 3).map((article) => ({
          symbol: item.asset.symbol,
          headline: article.headline,
          source: article.source,
        })),
      ),
      narrative: '',
    };
    report.narrative = closingNarrative(report);
    return report;
  }

  async pdf(userId: string, portfolioId: string): Promise<{ filename: string; body: Buffer }> {
    const report = await this.build(userId, portfolioId);
    return { filename: fileName(report.portfolio.name, 'pdf'), body: await renderPdf(report) };
  }

  async xlsx(userId: string, portfolioId: string): Promise<{ filename: string; body: Buffer }> {
    const report = await this.build(userId, portfolioId);
    return { filename: fileName(report.portfolio.name, 'xlsx'), body: await renderWorkbook(report) };
  }
}

function fileName(name: string, extension: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `investai-${slug || 'portafolio'}.${extension}`;
}
