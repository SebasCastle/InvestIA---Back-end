import { renderPdf, renderWorkbook } from './report-document';
import { closingNarrative, type PortfolioReport } from './report.types';

function sample(): PortfolioReport {
  const report: PortfolioReport = {
    generatedAt: '2026-10-01T00:00:00.000Z',
    portfolio: { id: 'p1', name: 'Largo plazo', currency: 'USD' },
    summary: {
      currency: 'USD',
      cash: 500,
      investedAmount: 500,
      marketValue: 500,
      portfolioValue: 1000,
      realizedPl: 0,
      unrealizedPl: 0,
      totalPl: 0,
      depositsIn: 1000,
      returnPercent: 0,
      dailyChange: null,
      dailyChangePercent: null,
      pricesStatus: 'unavailable',
      pricesError: null,
      positions: [],
      allocation: [{ symbol: 'AAPL', name: 'Apple', value: 500, percent: 100 }],
      plByAsset: [],
    },
    performance: [{ date: '2026-10-01', value: 1000 }],
    transactions: [],
    benchmarkSymbol: 'SPY',
    portfolioReturn: null,
    benchmarkReturn: null,
    excessReturn: null,
    benchmarkError: null,
    contributors: [],
    detractors: [],
    riskReason: 'Hacen falta al menos cinco variaciones diarias',
    annualizedVolatility: null,
    maxDrawdownPercent: null,
    news: [],
    narrative: '',
  };
  report.narrative = closingNarrative(report);
  return report;
}

describe('report documents', () => {
  it('states only calculated figures and renders pdf and excel', async () => {
    const report = sample();
    expect(report.narrative).toContain('1000.00 USD');
    expect(report.narrative).toContain('cambio diario no está disponible');

    const pdf = await renderPdf(report);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(400);

    const workbook = await renderWorkbook(report);
    expect(workbook.subarray(0, 2).toString()).toBe('PK');
  });
});
