import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssetType, Prisma, TransactionType } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { HoldingsService } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  const portfolio = {
    id: '2b6f1c0a-7c1e-4d0a-9a1b-6d0e1f2a3b4c',
    userId: 'user-1',
    name: 'Principal',
    currency: 'USD',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const asset = {
    id: '8d9c2b1a-4e3f-4a2b-8c7d-1e2f3a4b5c6d',
    symbol: 'AAPL',
    name: 'Apple',
    type: AssetType.STOCK,
    exchange: 'US',
    currency: 'USD',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const rows: Array<Record<string, unknown>> = [];
  const positions: Array<Record<string, unknown>> = [];

  const tx = {
    transaction: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = {
          id: `tx-${rows.length + 1}`,
          createdAt: new Date(),
          asset,
          ...args.data,
          quantity: new Prisma.Decimal(args.data.quantity as number),
          price: new Prisma.Decimal(args.data.price as number),
          fees: new Prisma.Decimal((args.data.fees as number) ?? 0),
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      findMany: jest.fn(() => Promise.resolve([...rows])),
      delete: jest.fn(),
    },
    position: {
      deleteMany: jest.fn(() => {
        positions.length = 0;
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn((args: { data: Array<Record<string, unknown>> }) => {
        positions.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    asset: {
      findUnique: jest.fn(() => Promise.resolve(asset)),
      create: jest.fn(),
    },
  };

  const portfolios = {
    requireOwned: jest.fn(),
  };
  const prisma = {
    portfolio: { findFirst: jest.fn() },
    transaction: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  let service: TransactionsService;

  beforeEach(async () => {
    rows.length = 0;
    positions.length = 0;
    portfolios.requireOwned.mockReset();
    portfolios.requireOwned.mockResolvedValue(portfolio);
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PortfolioService, useValue: portfolios },
        {
          provide: AssetsService,
          useValue: { findOrCreate: jest.fn().mockResolvedValue(asset) },
        },
        {
          provide: HoldingsService,
          useValue: new HoldingsService(
            prisma as unknown as PrismaService,
            portfolios as unknown as PortfolioService,
            { getQuotes: jest.fn(), getHistory: jest.fn() } as never,
          ),
        },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  it('rejects a portfolio the user does not own', async () => {
    portfolios.requireOwned.mockRejectedValue(new NotFoundException());

    await expect(
      service.create('user-2', portfolio.id, {
        type: TransactionType.DEPOSIT,
        quantity: 100,
        price: 1,
        executedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a deposit and a buy, then rejects an uncovered sell', async () => {
    await service.create('user-1', portfolio.id, {
      type: TransactionType.DEPOSIT,
      quantity: 1000,
      price: 1,
      executedAt: '2026-01-01T00:00:00.000Z',
    });
    await service.create('user-1', portfolio.id, {
      type: TransactionType.BUY,
      symbol: 'AAPL',
      name: 'Apple',
      assetType: AssetType.STOCK,
      quantity: 10,
      price: 50,
      executedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(positions).toEqual([
      expect.objectContaining({
        assetId: asset.id,
        portfolioId: portfolio.id,
      }),
    ]);
    expect((positions[0].quantity as Prisma.Decimal).toFixed(2)).toBe('10.00');
    expect((positions[0].averageCost as Prisma.Decimal).toFixed(2)).toBe('50.00');

    await expect(
      service.create('user-1', portfolio.id, {
        type: TransactionType.SELL,
        symbol: 'AAPL',
        name: 'Apple',
        assetType: AssetType.STOCK,
        quantity: 11,
        price: 55,
        executedAt: '2026-01-03T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
