export type DatedValue = {
  date: string;
  value: number;
};

export type Weight = {
  symbol: string;
  name: string;
  percent: number;
};

export type NamedPl = {
  symbol: string;
  name: string;
  pl: number;
};

export type BenchmarkComparison = {
  available: boolean;
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  points: { date: string; portfolio: number; benchmark: number }[];
};

export type RiskMetrics = {
  available: boolean;
  reason: string | null;
  observations: number;
  annualizedVolatility: number | null;
  maxDrawdownPercent: number | null;
  herfindahl: number | null;
  effectivePositions: number | null;
  largestWeight: number | null;
  sharpeRatio: number | null;
};

const MIN_RETURNS = 5;

export function periodReturn(points: DatedValue[]): number | null {
  const usable = points.filter((point) => point.value > 0);
  if (usable.length < 2) {
    return null;
  }
  return (usable[usable.length - 1].value / usable[0].value - 1) * 100;
}

export function compareToBenchmark(
  portfolio: DatedValue[],
  closes: { date: string; close: number }[],
): BenchmarkComparison {
  const closeOn = new Map(closes.map((price) => [price.date, price.close]));
  const overlap = portfolio.filter((point) => point.value > 0 && (closeOn.get(point.date) ?? 0) > 0);
  if (overlap.length < 2) {
    return {
      available: false,
      portfolioReturn: periodReturn(portfolio),
      benchmarkReturn: null,
      excessReturn: null,
      points: [],
    };
  }

  const basePortfolio = overlap[0].value;
  const baseBenchmark = closeOn.get(overlap[0].date) as number;
  const points = overlap.map((point) => ({
    date: point.date,
    portfolio: (point.value / basePortfolio) * 100,
    benchmark: ((closeOn.get(point.date) as number) / baseBenchmark) * 100,
  }));
  const portfolioReturn = points[points.length - 1].portfolio - 100;
  const benchmarkReturn = points[points.length - 1].benchmark - 100;
  return {
    available: true,
    portfolioReturn,
    benchmarkReturn,
    excessReturn: portfolioReturn - benchmarkReturn,
    points,
  };
}

export function splitContributors(rows: NamedPl[]): { contributors: NamedPl[]; detractors: NamedPl[] } {
  const ordered = [...rows].sort((left, right) => right.pl - left.pl);
  return {
    contributors: ordered.filter((row) => row.pl > 0),
    detractors: ordered.filter((row) => row.pl < 0).reverse(),
  };
}

export function riskMetrics(points: DatedValue[], weights: Weight[]): RiskMetrics {
  const returns = dailyReturns(points);
  const concentration = concentrationOf(weights);
  const volatilityReady = returns.length >= MIN_RETURNS;
  const reasons: string[] = [];
  if (!volatilityReady) {
    reasons.push('Hacen falta al menos cinco variaciones diarias');
  }
  if (!concentration) {
    reasons.push('No hay posiciones para medir la diversificación');
  }

  return {
    available: volatilityReady || concentration !== null,
    reason: reasons.length > 0 ? reasons.join('. ') : null,
    observations: returns.length,
    annualizedVolatility: volatilityReady ? sampleStdev(returns) * Math.sqrt(252) * 100 : null,
    maxDrawdownPercent: points.length >= 2 ? maxDrawdown(points) : null,
    herfindahl: concentration?.herfindahl ?? null,
    effectivePositions: concentration?.effectivePositions ?? null,
    largestWeight: concentration?.largestWeight ?? null,
    sharpeRatio: volatilityReady ? sharpe(returns) : null,
  };
}

export function betaToBenchmark(
  portfolio: DatedValue[],
  closes: { date: string; close: number }[],
): number | null {
  const closeOn = new Map(closes.map((price) => [price.date, price.close]));
  const pairs: { portfolio: number; benchmark: number }[] = [];
  for (let index = 1; index < portfolio.length; index += 1) {
    const previous = portfolio[index - 1];
    const current = portfolio[index];
    const previousClose = closeOn.get(previous.date);
    const currentClose = closeOn.get(current.date);
    if (!previousClose || !currentClose || previous.value <= 0 || previousClose <= 0) {
      continue;
    }
    pairs.push({
      portfolio: current.value / previous.value - 1,
      benchmark: currentClose / previousClose - 1,
    });
  }
  if (pairs.length < 5) {
    return null;
  }
  const meanPortfolio = pairs.reduce((total, pair) => total + pair.portfolio, 0) / pairs.length;
  const meanBenchmark = pairs.reduce((total, pair) => total + pair.benchmark, 0) / pairs.length;
  let covariance = 0;
  let variance = 0;
  for (const pair of pairs) {
    covariance += (pair.portfolio - meanPortfolio) * (pair.benchmark - meanBenchmark);
    variance += (pair.benchmark - meanBenchmark) ** 2;
  }
  if (variance === 0) {
    return null;
  }
  return covariance / variance;
}

function sharpe(returns: number[]): number | null {
  const deviation = sampleStdev(returns);
  if (deviation === 0) {
    return null;
  }
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  return (mean / deviation) * Math.sqrt(252);
}

function dailyReturns(points: DatedValue[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].value;
    if (previous > 0) {
      returns.push(points[index].value / previous - 1);
    }
  }
  return returns;
}

function sampleStdev(values: number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(points: DatedValue[]): number {
  let peak = points[0].value;
  let worst = 0;
  for (const point of points) {
    if (point.value > peak) {
      peak = point.value;
    }
    if (peak > 0) {
      worst = Math.max(worst, (peak - point.value) / peak);
    }
  }
  return worst * 100;
}

function concentrationOf(weights: Weight[]): {
  herfindahl: number;
  effectivePositions: number;
  largestWeight: number;
} | null {
  const open = weights.filter((weight) => weight.percent > 0);
  if (open.length === 0) {
    return null;
  }
  const herfindahl = open.reduce((total, weight) => total + (weight.percent / 100) ** 2, 0);
  return {
    herfindahl,
    effectivePositions: herfindahl > 0 ? 1 / herfindahl : open.length,
    largestWeight: Math.max(...open.map((weight) => weight.percent)),
  };
}
