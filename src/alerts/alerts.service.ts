import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertKind, Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { MarketDataService } from '../market-data/market-data.service';
import { HoldingsService } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { cooldownActive, isAlertHit } from './alert.rules';
import { CreateAlertDto } from './dto/create-alert.dto';

const priceKinds = new Set<AlertKind>([AlertKind.PRICE_ABOVE, AlertKind.PRICE_BELOW]);

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: PortfolioService,
    private readonly holdings: HoldingsService,
    private readonly marketData: MarketDataService,
    private readonly mail: MailService,
  ) {}

  async list(userId: string) {
    const alerts = await this.prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { portfolio: { select: { id: true, name: true } } },
    });
    return alerts.map(present);
  }

  async create(userId: string, dto: CreateAlertDto) {
    const symbol = dto.symbol?.trim().toUpperCase();
    if (priceKinds.has(dto.kind)) {
      if (!symbol) {
        throw new BadRequestException('La alerta de precio requiere un símbolo');
      }
    } else if (!dto.portfolioId) {
      throw new BadRequestException('La alerta de rendimiento requiere un portafolio');
    }
    if (dto.portfolioId) {
      await this.portfolios.requireOwned(userId, dto.portfolioId);
    }

    const alert = await this.prisma.alert.create({
      data: {
        userId,
        portfolioId: dto.portfolioId,
        symbol: priceKinds.has(dto.kind) ? symbol : null,
        kind: dto.kind,
        threshold: dto.threshold,
      },
      include: { portfolio: { select: { id: true, name: true } } },
    });
    return present(alert);
  }

  async remove(userId: string, alertId: string): Promise<void> {
    const result = await this.prisma.alert.deleteMany({ where: { id: alertId, userId } });
    if (result.count === 0) {
      throw new NotFoundException('Alerta no encontrada');
    }
  }

  async checkAll(cooldownHours = 24): Promise<void> {
    const alerts = await this.prisma.alert.findMany({
      where: { enabled: true },
      include: { user: { select: { id: true, email: true } }, portfolio: { select: { name: true } } },
    });
    for (const alert of alerts) {
      if (cooldownActive(alert.lastTriggeredAt, cooldownHours)) {
        continue;
      }
      try {
        await this.evaluate(alert, cooldownHours);
      } catch (error) {
        this.logger.warn(`Alerta ${alert.id} omitida: ${error instanceof Error ? error.message : 'error'}`);
      }
    }
  }

  private async evaluate(
    alert: {
      id: string;
      userId: string;
      portfolioId: string | null;
      symbol: string | null;
      kind: AlertKind;
      threshold: Prisma.Decimal;
      user: { email: string };
      portfolio: { name: string } | null;
    },
    _cooldownHours: number,
  ) {
    const threshold = Number(alert.threshold);
    const reading = priceKinds.has(alert.kind)
      ? await this.priceReading(alert.symbol)
      : await this.returnReading(alert.userId, alert.portfolioId);
    if (!reading || !isAlertHit(alert.kind, threshold, reading.value)) {
      return;
    }

    await this.mail.send({
      to: alert.user.email,
      subject: 'Alerta InvestAI',
      text: `${reading.label}. Umbral ${threshold}.`,
      html: `<p>${escapeHtml(reading.label)}. Umbral ${threshold}.</p>`,
    });
    await this.prisma.alert.update({
      where: { id: alert.id },
      data: { lastTriggeredAt: new Date() },
    });
  }

  private async priceReading(symbol: string | null): Promise<{ value: number; label: string } | null> {
    if (!symbol) {
      return null;
    }
    const lookup = await this.marketData.getQuotes([symbol]);
    const quote = lookup.quotes[symbol];
    if (!quote) {
      return null;
    }
    return { value: quote.price, label: `${symbol} cotiza en ${quote.price}` };
  }

  private async returnReading(userId: string, portfolioId: string | null) {
    if (!portfolioId) {
      return null;
    }
    const summary = await this.holdings.summary(userId, portfolioId);
    if (summary.returnPercent === null) {
      return null;
    }
    return { value: summary.returnPercent, label: `El rendimiento es ${summary.returnPercent.toFixed(2)}%` };
  }
}

function present(alert: {
  id: string;
  kind: AlertKind;
  symbol: string | null;
  threshold: Prisma.Decimal;
  enabled: boolean;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  portfolio: { id: string; name: string } | null;
}) {
  return {
    id: alert.id,
    kind: alert.kind,
    symbol: alert.symbol,
    threshold: Number(alert.threshold),
    enabled: alert.enabled,
    lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
    createdAt: alert.createdAt.toISOString(),
    portfolio: alert.portfolio,
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
