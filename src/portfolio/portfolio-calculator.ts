import { Prisma, TransactionType } from '@prisma/client';

const PLACES = 8;

export class PortfolioCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioCalculationError';
  }
}

export type CalcTransaction = {
  assetId: string | null;
  type: TransactionType;
  quantity: Prisma.Decimal.Value;
  price: Prisma.Decimal.Value;
  fees: Prisma.Decimal.Value;
  executedAt: Date;
  createdAt?: Date;
  currency?: string;
};

export type MarkPrice = {
  price?: Prisma.Decimal.Value;
  change?: Prisma.Decimal.Value;
};

type Lot = {
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  realizedPl: Prisma.Decimal;
};

export type CalculatedPosition = {
  assetId: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  investedAmount: Prisma.Decimal;
  marketPrice: Prisma.Decimal | null;
  marketValue: Prisma.Decimal;
  unrealizedPl: Prisma.Decimal;
  realizedPl: Prisma.Decimal;
  totalPl: Prisma.Decimal;
  dailyChange: Prisma.Decimal | null;
  priceAvailable: boolean;
};

export type PortfolioCalculation = {
  cash: Prisma.Decimal;
  investedAmount: Prisma.Decimal;
  marketValue: Prisma.Decimal;
  portfolioValue: Prisma.Decimal;
  realizedPl: Prisma.Decimal;
  unrealizedPl: Prisma.Decimal;
  totalPl: Prisma.Decimal;
  netContributions: Prisma.Decimal;
  depositsIn: Prisma.Decimal;
  returnPercent: Prisma.Decimal | null;
  dailyChange: Prisma.Decimal | null;
  pricesComplete: boolean;
  positions: CalculatedPosition[];
};

const FLOW_ORDER: Record<TransactionType, number> = {
  [TransactionType.DEPOSIT]: 0,
  [TransactionType.SELL]: 1,
  [TransactionType.DIVIDEND]: 2,
  [TransactionType.BUY]: 3,
  [TransactionType.WITHDRAWAL]: 4,
};

export function calculatePortfolio(
  transactions: CalcTransaction[],
  prices: Record<string, MarkPrice> = {},
  currency?: string,
): PortfolioCalculation {
  const bookCurrency = currency ?? transactions.find((transaction) => transaction.currency)?.currency;
  const ordered = transactions
    .map((transaction, index) => ({ transaction, index }))
    .sort((left, right) => compareLedger(left.transaction, left.index, right.transaction, right.index));

  let cash = dec(0);
  let netContributions = dec(0);
  let depositsIn = dec(0);
  const lots = new Map<string, Lot>();

  for (const { transaction } of ordered) {
    if (bookCurrency && transaction.currency && transaction.currency !== bookCurrency) {
      throw new PortfolioCalculationError('La moneda del movimiento no coincide con el portafolio');
    }

    const quantity = money(transaction.quantity);
    const price = money(transaction.price);
    const fees = money(transaction.fees);
    if (quantity.lte(0)) {
      throw new PortfolioCalculationError('La cantidad debe ser mayor a cero');
    }
    if (price.lt(0) || fees.lt(0)) {
      throw new PortfolioCalculationError('El precio y las comisiones no pueden ser negativos');
    }

    const gross = quantity.mul(price);
    if (transaction.type === TransactionType.DEPOSIT) {
      assertCashMovement(transaction.assetId);
      const net = money(gross.sub(fees));
      if (net.lt(0)) {
        throw new PortfolioCalculationError('La comisión supera el depósito');
      }
      cash = money(cash.add(net));
      netContributions = netContributions.add(net);
      depositsIn = depositsIn.add(net);
      continue;
    }

    if (transaction.type === TransactionType.WITHDRAWAL) {
      assertCashMovement(transaction.assetId);
      const total = gross.add(fees);
      if (cash.lt(total)) {
        throw new PortfolioCalculationError('Efectivo insuficiente');
      }
      cash = money(cash.sub(total));
      netContributions = netContributions.sub(total);
      continue;
    }

    const assetId = requireAsset(transaction.assetId);
    const current = lots.get(assetId) ?? emptyLot();

    if (transaction.type === TransactionType.BUY) {
      const cost = money(gross.add(fees));
      if (cash.lt(cost)) {
        throw new PortfolioCalculationError('Efectivo insuficiente');
      }
      const newQuantity = current.quantity.add(quantity);
      const averageCost = current.quantity
        .mul(current.averageCost)
        .add(cost)
        .div(newQuantity)
        .toDecimalPlaces(PLACES);
      cash = money(cash.sub(cost));
      lots.set(assetId, {
        quantity: newQuantity,
        averageCost,
        realizedPl: current.realizedPl,
      });
      continue;
    }

    if (transaction.type === TransactionType.SELL) {
      if (current.quantity.lt(quantity)) {
        throw new PortfolioCalculationError('No hay suficientes títulos para vender');
      }
      const proceeds = money(gross.sub(fees));
      const nextCash = money(cash.add(proceeds));
      if (nextCash.lt(0)) {
        throw new PortfolioCalculationError('Efectivo insuficiente');
      }
      const realized = price.sub(current.averageCost).mul(quantity).sub(fees);
      const newQuantity = current.quantity.sub(quantity);
      cash = nextCash;
      lots.set(assetId, {
        quantity: newQuantity,
        averageCost: newQuantity.isZero() ? dec(0) : current.averageCost,
        realizedPl: current.realizedPl.add(realized),
      });
      continue;
    }

    const income = money(gross.sub(fees));
    const nextCash = money(cash.add(income));
    if (nextCash.lt(0)) {
      throw new PortfolioCalculationError('Efectivo insuficiente');
    }
    cash = nextCash;
    lots.set(assetId, {
      ...current,
      realizedPl: current.realizedPl.add(income),
    });
  }

  cash = round(cash);
  netContributions = round(netContributions);
  depositsIn = round(depositsIn);

  const positions: CalculatedPosition[] = [];
  let investedAmount = dec(0);
  let marketValue = dec(0);
  let unrealizedPl = dec(0);
  let realizedPl = dec(0);
  let dailyChange = dec(0);
  let pricesComplete = true;
  let hasOpenPosition = false;

  for (const [assetId, lot] of lots) {
    realizedPl = realizedPl.add(lot.realizedPl);
    if (lot.quantity.lte(0)) {
      if (!lot.realizedPl.isZero()) {
        positions.push(closedPosition(assetId, lot.realizedPl));
      }
      continue;
    }

    hasOpenPosition = true;
    const mark = prices[assetId];
    const priceAvailable = mark?.price !== undefined;
    const marketPrice = priceAvailable ? dec(mark.price as Prisma.Decimal.Value) : null;
    const priced = marketPrice ?? lot.averageCost;
    const positionInvested = lot.quantity.mul(lot.averageCost);
    const positionMarket = lot.quantity.mul(priced);
    const positionUnrealized = positionMarket.sub(positionInvested);
    const positionDaily =
      priceAvailable && mark?.change !== undefined ? lot.quantity.mul(mark.change) : null;

    if (!priceAvailable || positionDaily === null) {
      pricesComplete = false;
    } else {
      dailyChange = dailyChange.add(positionDaily);
    }

    investedAmount = investedAmount.add(positionInvested);
    marketValue = marketValue.add(positionMarket);
    unrealizedPl = unrealizedPl.add(positionUnrealized);
    positions.push({
      assetId,
      quantity: round(lot.quantity),
      averageCost: round(lot.averageCost),
      investedAmount: round(positionInvested),
      marketPrice: marketPrice ? round(marketPrice) : null,
      marketValue: round(positionMarket),
      unrealizedPl: round(positionUnrealized),
      realizedPl: round(lot.realizedPl),
      totalPl: round(positionUnrealized.add(lot.realizedPl)),
      dailyChange: positionDaily ? round(positionDaily) : null,
      priceAvailable,
    });
  }

  const portfolioValue = round(cash.add(marketValue));
  const totalPl = round(portfolioValue.sub(netContributions));

  return {
    cash,
    investedAmount: round(investedAmount),
    marketValue: round(marketValue),
    portfolioValue,
    realizedPl: round(realizedPl),
    unrealizedPl: round(unrealizedPl),
    totalPl,
    netContributions,
    depositsIn,
    returnPercent: depositsIn.gt(0) ? round(totalPl.div(depositsIn).mul(100)) : null,
    dailyChange: hasOpenPosition && pricesComplete ? round(dailyChange) : null,
    pricesComplete: !hasOpenPosition || pricesComplete,
    positions,
  };
}

export function buildPerformanceSeries(
  transactions: CalcTransaction[],
  closesByAsset: Record<string, Record<string, Prisma.Decimal.Value>>,
  dates: string[],
): { date: string; value: Prisma.Decimal }[] {
  return dates.map((date) => {
    const asOf = new Date(`${date}T23:59:59.999Z`);
    const subset = transactions.filter((transaction) => transaction.executedAt <= asOf);
    const prices: Record<string, MarkPrice> = {};
    for (const transaction of subset) {
      if (!transaction.assetId || prices[transaction.assetId]) {
        continue;
      }
      const close = latestClose(closesByAsset[transaction.assetId], date);
      if (close !== null) {
        prices[transaction.assetId] = { price: close };
      }
    }
    return { date, value: calculatePortfolio(subset, prices).portfolioValue };
  });
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function latestClose(
  series: Record<string, Prisma.Decimal.Value> | undefined,
  date: string,
): Prisma.Decimal | null {
  if (!series) {
    return null;
  }
  if (series[date] !== undefined) {
    return dec(series[date]);
  }
  const previous = Object.keys(series)
    .filter((key) => key <= date)
    .sort()
    .at(-1);
  return previous ? dec(series[previous]) : null;
}

function requireAsset(assetId: string | null): string {
  if (!assetId) {
    throw new PortfolioCalculationError('La operación requiere un activo');
  }
  return assetId;
}

function assertCashMovement(assetId: string | null): void {
  if (assetId) {
    throw new PortfolioCalculationError('El depósito y el retiro no usan un activo');
  }
}

function emptyLot(): Lot {
  return { quantity: dec(0), averageCost: dec(0), realizedPl: dec(0) };
}

function closedPosition(assetId: string, realizedPl: Prisma.Decimal): CalculatedPosition {
  const realized = round(realizedPl);
  return {
    assetId,
    quantity: dec(0),
    averageCost: dec(0),
    investedAmount: dec(0),
    marketPrice: null,
    marketValue: dec(0),
    unrealizedPl: dec(0),
    realizedPl: realized,
    totalPl: realized,
    dailyChange: null,
    priceAvailable: true,
  };
}

function compareLedger(
  left: CalcTransaction,
  leftIndex: number,
  right: CalcTransaction,
  rightIndex: number,
): number {
  const byDay = utcDay(left.executedAt) - utcDay(right.executedAt);
  if (byDay !== 0) {
    return byDay;
  }
  const byFlow = FLOW_ORDER[left.type] - FLOW_ORDER[right.type];
  if (byFlow !== 0) {
    return byFlow;
  }
  const byCreated = (left.createdAt?.getTime() ?? leftIndex) - (right.createdAt?.getTime() ?? rightIndex);
  return byCreated === 0 ? leftIndex - rightIndex : byCreated;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dec(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(PLACES);
}

function round(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(PLACES);
}
