import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Portfolio } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  listOwned(userId: string) {
    return this.prisma.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        transactions: {
          orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
          include: { asset: true },
        },
      },
    });
  }

  async requireOwned(userId: string, portfolioId: string): Promise<Portfolio> {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, userId },
    });
    if (!portfolio) {
      throw new NotFoundException('Portafolio no encontrado');
    }
    return portfolio;
  }

  create(userId: string, dto: CreatePortfolioDto) {
    return this.prisma.portfolio.create({
      data: {
        name: dto.name,
        currency: dto.currency,
        userId,
      },
    });
  }

  async update(userId: string, portfolioId: string, dto: UpdatePortfolioDto) {
    const portfolio = await this.requireOwned(userId, portfolioId);
    if (dto.currency && dto.currency !== portfolio.currency) {
      const movements = await this.prisma.transaction.count({ where: { portfolioId } });
      if (movements > 0) {
        throw new BadRequestException(
          'No se puede cambiar la moneda de un portafolio con movimientos',
        );
      }
    }

    return this.prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        name: dto.name,
        currency: dto.currency,
      },
    });
  }

  async remove(userId: string, portfolioId: string): Promise<void> {
    const result = await this.prisma.portfolio.deleteMany({
      where: { id: portfolioId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Portafolio no encontrado');
    }
  }
}
