import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { presentTransaction } from '../portfolio/portfolio.presenter';
import { HoldingsService } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

const tradeTypes = new Set<TransactionType>([
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.DIVIDEND,
]);

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: PortfolioService,
    private readonly holdings: HoldingsService,
    private readonly assets: AssetsService,
  ) {}

  async list(userId: string, portfolioId: string) {
    await this.portfolios.requireOwned(userId, portfolioId);
    const transactions = await this.prisma.transaction.findMany({
      where: { portfolioId },
      orderBy: [{ executedAt: 'desc' }, { createdAt: 'desc' }],
      include: { asset: true },
    });
    return transactions.map(presentTransaction);
  }

  async get(userId: string, portfolioId: string, transactionId: string) {
    const transaction = await this.findOwned(userId, portfolioId, transactionId);
    return presentTransaction(transaction);
  }

  async create(userId: string, portfolioId: string, dto: CreateTransactionDto) {
    const portfolio = await this.portfolios.requireOwned(userId, portfolioId);
    const needsAsset = tradeTypes.has(dto.type);

    const created = await this.prisma.$transaction(async (tx) => {
      const asset = needsAsset
        ? await this.assets.findOrCreate(
            {
              symbol: dto.symbol ?? '',
              name: dto.name ?? '',
              type: dto.assetType!,
              exchange: dto.exchange,
              currency: portfolio.currency,
            },
            tx,
          )
        : null;

      const transaction = await tx.transaction.create({
        data: {
          portfolioId,
          assetId: asset?.id,
          type: dto.type,
          quantity: dto.quantity,
          price: dto.price,
          fees: dto.fees ?? 0,
          currency: portfolio.currency,
          executedAt: new Date(dto.executedAt),
        },
        include: { asset: true },
      });
      await this.holdings.rebuild(tx, portfolioId);
      return transaction;
    });

    return presentTransaction(created);
  }

  async remove(userId: string, portfolioId: string, transactionId: string): Promise<void> {
    await this.findOwned(userId, portfolioId, transactionId);
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.delete({ where: { id: transactionId } });
      await this.holdings.rebuild(tx, portfolioId);
    });
  }

  private async findOwned(userId: string, portfolioId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, portfolioId, portfolio: { userId } },
      include: { asset: true },
    });
    if (!transaction) {
      throw new NotFoundException('Movimiento no encontrado');
    }
    return transaction;
  }
}
