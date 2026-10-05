import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { presentAsset } from '../portfolio/portfolio.presenter';
import type { AssetResponse } from '../portfolio/portfolio.types';
import { CreateAssetDto } from './dto/create-asset.dto';

type AssetDb = PrismaService | Prisma.TransactionClient;

export type AssetDraft = {
  symbol: string;
  name: string;
  type: AssetType;
  exchange?: string;
  currency: string;
};

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(symbol?: string): Promise<AssetResponse[]> {
    const assets = await this.prisma.asset.findMany({
      where: symbol ? { symbol: { contains: symbol.trim().toUpperCase() } } : undefined,
      orderBy: { symbol: 'asc' },
      take: 100,
    });
    return assets.map(presentAsset);
  }

  async get(id: string): Promise<AssetResponse> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException('Activo no encontrado');
    }
    return presentAsset(asset);
  }

  async create(dto: CreateAssetDto): Promise<AssetResponse> {
    try {
      const asset = await this.prisma.asset.create({
        data: {
          symbol: dto.symbol,
          name: dto.name,
          type: dto.type,
          exchange: dto.exchange,
          currency: dto.currency,
        },
      });
      return presentAsset(asset);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El símbolo ya existe');
      }
      throw error;
    }
  }

  async findOrCreate(draft: AssetDraft, db: AssetDb = this.prisma) {
    const symbol = draft.symbol.trim().toUpperCase();
    const existing = await db.asset.findUnique({ where: { symbol } });
    if (existing) {
      if (existing.currency !== draft.currency) {
        throw new ConflictException('El activo existe en otra moneda');
      }
      return existing;
    }

    return db.asset.create({
      data: {
        symbol,
        name: draft.name.trim(),
        type: draft.type,
        exchange: draft.exchange?.trim().toUpperCase() || 'UNKNOWN',
        currency: draft.currency,
      },
    });
  }
}
