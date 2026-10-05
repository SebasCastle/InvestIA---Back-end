import { compareToBenchmark, periodReturn, riskMetrics, splitContributors } from './analytics-calculator';

describe('analytics calculator', () => {
  it('compares a portfolio with a benchmark on shared dates', () => {
    const comparison = compareToBenchmark(
      [
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-02', value: 110 },
      ],
      [
        { date: '2026-01-01', close: 50 },
        { date: '2026-01-02', close: 55 },
      ],
    );

    expect(comparison.available).toBe(true);
    expect(comparison.portfolioReturn).toBeCloseTo(10);
    expect(comparison.benchmarkReturn).toBeCloseTo(10);
    expect(comparison.excessReturn).toBeCloseTo(0);
    expect(comparison.points[1].date).toBe('2026-01-02');
    expect(comparison.points[1].portfolio).toBeCloseTo(110);
    expect(comparison.points[1].benchmark).toBeCloseTo(110);
  });

  it('does not invent a benchmark when the series do not overlap', () => {
    const comparison = compareToBenchmark(
      [{ date: '2026-01-01', value: 100 }, { date: '2026-01-02', value: 110 }],
      [{ date: '2025-01-01', close: 50 }],
    );
    expect(comparison.available).toBe(false);
    expect(comparison.benchmarkReturn).toBeNull();
    expect(comparison.portfolioReturn).toBeCloseTo(periodReturn([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 110 },
    ]) as number);
  });

  it('splits contributors and measures concentration and drawdown', () => {
    const split = splitContributors([
      { symbol: 'A', name: 'A', pl: 10 },
      { symbol: 'B', name: 'B', pl: -4 },
      { symbol: 'C', name: 'C', pl: 0 },
    ]);
    expect(split.contributors.map((row) => row.symbol)).toEqual(['A']);
    expect(split.detractors.map((row) => row.symbol)).toEqual(['B']);

    const risk = riskMetrics(
      [
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-02', value: 80 },
        { date: '2026-01-03', value: 90 },
        { date: '2026-01-04', value: 90 },
        { date: '2026-01-05', value: 90 },
        { date: '2026-01-06', value: 90 },
      ],
      [
        { symbol: 'A', name: 'A', percent: 50 },
        { symbol: 'B', name: 'B', percent: 50 },
      ],
    );
    expect(risk.maxDrawdownPercent).toBeCloseTo(20);
    expect(risk.herfindahl).toBeCloseTo(0.5);
    expect(risk.effectivePositions).toBeCloseTo(2);
    expect(risk.annualizedVolatility).not.toBeNull();
  });

  it('withholds volatility when there are not enough daily changes', () => {
    const risk = riskMetrics([{ date: '2026-01-01', value: 100 }], []);
    expect(risk.annualizedVolatility).toBeNull();
    expect(risk.herfindahl).toBeNull();
    expect(risk.reason).toContain('cinco variaciones');
  });
});
