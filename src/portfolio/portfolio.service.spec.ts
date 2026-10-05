import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  const prisma = {
    portfolio: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [PortfolioService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PortfolioService);
  });

  it('only loads a portfolio owned by the user', async () => {
    prisma.portfolio.findFirst.mockResolvedValue(null);

    await expect(service.requireOwned('user-1', 'portfolio-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.portfolio.findFirst).toHaveBeenCalledWith({
      where: { id: 'portfolio-1', userId: 'user-1' },
    });
  });

  it('does not delete another user portfolio', async () => {
    prisma.portfolio.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('user-1', 'portfolio-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.portfolio.deleteMany).toHaveBeenCalledWith({
      where: { id: 'portfolio-1', userId: 'user-1' },
    });
  });

  it('rejects a currency change after movements exist', async () => {
    prisma.portfolio.findFirst.mockResolvedValue({
      id: 'portfolio-1',
      currency: 'USD',
      userId: 'user-1',
    });
    prisma.transaction.count.mockResolvedValue(2);

    await expect(
      service.update('user-1', 'portfolio-1', { currency: 'MXN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.portfolio.update).not.toHaveBeenCalled();
  });
});
