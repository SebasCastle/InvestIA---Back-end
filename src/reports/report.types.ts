import type { SummaryResponse, TransactionResponse } from '../portfolio/portfolio.types';

export type ReportNews = {
  symbol: string;
  headline: string;
  source: string;
};

export type PortfolioReport = {
  generatedAt: string;
  portfolio: { id: string; name: string; currency: string };
  summary: SummaryResponse;
  performance: { date: string; value: number }[];
  transactions: TransactionResponse[];
  benchmarkSymbol: string;
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  benchmarkError: string | null;
  contributors: { symbol: string; name: string; pl: number }[];
  detractors: { symbol: string; name: string; pl: number }[];
  riskReason: string | null;
  annualizedVolatility: number | null;
  maxDrawdownPercent: number | null;
  news: ReportNews[];
  narrative: string;
};

export function closingNarrative(report: Pick<
  PortfolioReport,
  'portfolio' | 'summary' | 'portfolioReturn' | 'benchmarkSymbol' | 'benchmarkReturn' | 'contributors' | 'detractors'
>): string {
  const { summary, portfolio } = report;
  const daily =
    summary.dailyChange === null
      ? 'El cambio diario no está disponible porque faltan precios.'
      : `El cambio diario es ${summary.dailyChange.toFixed(2)} ${portfolio.currency}.`;
  const totalReturn =
    summary.returnPercent === null
      ? 'El rendimiento total no está disponible.'
      : `El rendimiento total es ${summary.returnPercent.toFixed(2)}%.`;
  const leaders = report.contributors
    .slice(0, 3)
    .map((row) => `${row.symbol} ${row.pl.toFixed(2)}`)
    .join(', ');
  const laggards = report.detractors
    .slice(0, 3)
    .map((row) => `${row.symbol} ${row.pl.toFixed(2)}`)
    .join(', ');
  return [
    `${portfolio.name} vale ${summary.portfolioValue.toFixed(2)} ${portfolio.currency}.`,
    `El resultado total es ${summary.totalPl.toFixed(2)} ${portfolio.currency}.`,
    totalReturn,
    daily,
    leaders ? `Mayor contribución: ${leaders}.` : 'No hay contribuidores con resultado positivo.',
    laggards ? `Mayor detractor: ${laggards}.` : 'No hay detractores.',
    report.benchmarkReturn === null
      ? `No hay comparación contra ${report.benchmarkSymbol}.`
      : `Frente a ${report.benchmarkSymbol}, el periodo rinde ${report.portfolioReturn?.toFixed(2) ?? '—'}% y la referencia ${report.benchmarkReturn.toFixed(2)}%.`,
  ].join(' ');
}
