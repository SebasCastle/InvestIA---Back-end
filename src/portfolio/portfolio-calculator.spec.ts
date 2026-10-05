import { Prisma, TransactionType } from '@prisma/client';
import {
  buildPerformanceSeries,
  calculatePortfolio,
  eachDate,
  PortfolioCalculationError,
  type CalcTransaction,
} from './portfolio-calculator';

function tx(partial: Partial<CalcTransaction> & Pick<CalcTransaction, 'type'>): CalcTransaction {
  return {
    assetId: partial.assetId ?? null,
    type: partial.type,
    quantity: partial.quantity ?? 1,
    price: partial.price ?? 0,
    fees: partial.fees ?? 0,
    executedAt: partial.executedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    createdAt: partial.createdAt,
    currency: partial.currency,
  };
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

describe('calculatePortfolio', () => {
  it('tracks cash, average cost, realized and unrealized results', () => {
    const result = calculatePortfolio(
      [
        tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1 }),
        tx({
          type: TransactionType.BUY,
          assetId: 'aapl',
          quantity: 10,
          price: 50,
          executedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
        tx({
          type: TransactionType.SELL,
          assetId: 'aapl',
          quantity: 4,
          price: 60,
          executedAt: new Date('2026-01-03T00:00:00.000Z'),
        }),
        tx({
          type: TransactionType.DIVIDEND,
          assetId: 'aapl',
          quantity: 6,
          price: 1,
          executedAt: new Date('2026-01-04T00:00:00.000Z'),
        }),
      ],
      { aapl: { price: 60, change: 2 } },
    );

    expect(money(result.cash)).toBe('746.00');
    expect(money(result.investedAmount)).toBe('300.00');
    expect(money(result.marketValue)).toBe('360.00');
    expect(money(result.portfolioValue)).toBe('1106.00');
    expect(money(result.realizedPl)).toBe('46.00');
    expect(money(result.unrealizedPl)).toBe('60.00');
    expect(money(result.totalPl)).toBe('106.00');
    expect(money(result.returnPercent ?? new Prisma.Decimal(0))).toBe('10.60');
    expect(money(result.dailyChange ?? new Prisma.Decimal(0))).toBe('12.00');
    expect(result.positions[0]).toMatchObject({
      assetId: 'aapl',
      priceAvailable: true,
    });
    expect(money(result.positions[0].quantity)).toBe('6.00');
    expect(money(result.positions[0].averageCost)).toBe('50.00');
  });

  it('includes buy fees in average cost and sell fees in realized P/L', () => {
    const bought = calculatePortfolio(
      [
        tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1 }),
        tx({
          type: TransactionType.BUY,
          assetId: 'aapl',
          quantity: 10,
          price: 50,
          fees: 10,
        }),
      ],
      { aapl: { price: 50, change: 0 } },
    );
    expect(money(bought.positions[0].averageCost)).toBe('51.00');
    expect(money(bought.totalPl)).toBe('-10.00');

    const sold = calculatePortfolio(
      [
        tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1 }),
        tx({
          type: TransactionType.BUY,
          assetId: 'aapl',
          quantity: 10,
          price: 50,
          fees: 10,
        }),
        tx({
          type: TransactionType.SELL,
          assetId: 'aapl',
          quantity: 10,
          price: 50,
          fees: 5,
          executedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      ],
      {},
    );
    expect(money(sold.cash)).toBe('985.00');
    expect(money(sold.realizedPl)).toBe('-15.00');
    expect(money(sold.totalPl)).toBe('-15.00');
    expect(sold.positions).toHaveLength(1);
    expect(money(sold.positions[0].quantity)).toBe('0.00');
  });

  it('averages successive buys', () => {
    const result = calculatePortfolio([
      tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1 }),
      tx({
        type: TransactionType.BUY,
        assetId: 'spy',
        quantity: 10,
        price: 10,
        executedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
      tx({
        type: TransactionType.BUY,
        assetId: 'spy',
        quantity: 10,
        price: 30,
        executedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    ]);

    expect(money(result.positions[0].quantity)).toBe('20.00');
    expect(money(result.positions[0].averageCost)).toBe('20.00');
    expect(money(result.investedAmount)).toBe('400.00');
  });

  it('funds a same-day purchase with a deposit even if the purchase was recorded first', () => {
    const day = new Date('2026-03-02T00:00:00.000Z');
    const result = calculatePortfolio(
      [
        tx({
          type: TransactionType.BUY,
          assetId: 'aapl',
          quantity: 4,
          price: 250,
          fees: 1.76,
          executedAt: day,
          createdAt: new Date('2026-03-02T18:00:00.000Z'),
        }),
        tx({
          type: TransactionType.DEPOSIT,
          quantity: 2134.21,
          price: 1,
          executedAt: new Date('2026-03-02T23:30:00.000Z'),
          createdAt: new Date('2026-03-02T12:00:00.000Z'),
          currency: 'USD',
        }),
      ],
      {},
      'USD',
    );

    expect(money(result.cash)).toBe('1132.45');
    expect(money(result.positions[0].quantity)).toBe('4.00');
  });

  it('rejects a purchase dated before the cash exists', () => {
    expect(() =>
      calculatePortfolio([
        tx({
          type: TransactionType.BUY,
          assetId: 'aapl',
          quantity: 1,
          price: 100,
          executedAt: new Date('2026-03-01T18:00:00.000Z'),
        }),
        tx({
          type: TransactionType.DEPOSIT,
          quantity: 1000,
          price: 1,
          executedAt: new Date('2026-03-02T00:00:00.000Z'),
        }),
      ]),
    ).toThrow(new PortfolioCalculationError('Efectivo insuficiente'));
  });

  it('accepts a purchase that spends the available cash exactly', () => {
    const result = calculatePortfolio([
      tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1, currency: 'USD' }),
      tx({
        type: TransactionType.BUY,
        assetId: 'aapl',
        quantity: 10,
        price: 99.99,
        fees: 0.1,
        executedAt: new Date('2026-01-02T15:00:00.000Z'),
        currency: 'USD',
      }),
    ]);

    expect(money(result.cash)).toBe('0.00');
    expect(money(result.positions[0].quantity)).toBe('10.00');
  });

  it('rejects a purchase once fees push the cost above cash', () => {
    expect(() =>
      calculatePortfolio([
        tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1 }),
        tx({
          type: TransactionType.BUY,
          assetId: 'aapl',
          quantity: 10,
          price: 99.99,
          fees: 0.11,
          executedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      ]),
    ).toThrow(new PortfolioCalculationError('Efectivo insuficiente'));
  });

  it('does not mix a movement in another currency into the cash balance', () => {
    expect(() =>
      calculatePortfolio(
        [
          tx({ type: TransactionType.DEPOSIT, quantity: 1000, price: 1, currency: 'MXN' }),
          tx({
            type: TransactionType.BUY,
            assetId: 'aapl',
            quantity: 1,
            price: 10,
            currency: 'USD',
            executedAt: new Date('2026-01-02T00:00:00.000Z'),
          }),
        ],
        {},
        'MXN',
      ),
    ).toThrow(new PortfolioCalculationError('La moneda del movimiento no coincide con el portafolio'));
  });

  it('rejects sells and withdrawals the portfolio cannot cover', () => {
    expect(() =>
      calculatePortfolio([
        tx({ type: TransactionType.DEPOSIT, quantity: 100, price: 1 }),
        tx({
          type: TransactionType.BUY,
          assetId: 'spy',
          quantity: 1,
          price: 10,
          executedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
        tx({
          type: TransactionType.SELL,
          assetId: 'spy',
          quantity: 2,
          price: 10,
          executedAt: new Date('2026-01-03T00:00:00.000Z'),
        }),
      ]),
    ).toThrow(new PortfolioCalculationError('No hay suficientes títulos para vender'));

    expect(() =>
      calculatePortfolio([
        tx({ type: TransactionType.DEPOSIT, quantity: 50, price: 1 }),
        tx({
          type: TransactionType.WITHDRAWAL,
          quantity: 80,
          price: 1,
          executedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      ]),
    ).toThrow(new PortfolioCalculationError('Efectivo insuficiente'));
  });

  it('keeps a usable value when a market price is missing', () => {
    const result = calculatePortfolio([
      tx({ type: TransactionType.DEPOSIT, quantity: 500, price: 1 }),
      tx({ type: TransactionType.BUY, assetId: 'msft', quantity: 2, price: 100 }),
    ]);

    expect(result.pricesComplete).toBe(false);
    expect(result.dailyChange).toBeNull();
    expect(money(result.unrealizedPl)).toBe('0.00');
    expect(money(result.portfolioValue)).toBe('500.00');
  });

  it('builds a daily performance series from closes', () => {
    const transactions = [
      tx({ type: TransactionType.DEPOSIT, quantity: 100, price: 1 }),
      tx({
        type: TransactionType.BUY,
        assetId: 'spy',
        quantity: 2,
        price: 20,
        executedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ];
    const series = buildPerformanceSeries(transactions, { spy: { '2026-01-03': 25 } }, [
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);

    expect(series.map((point) => money(point.value))).toEqual(['100.00', '100.00', '110.00']);
    expect(eachDate('2026-01-01', '2026-01-03')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });
});
