import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GeminiClient } from '../ai/gemini.client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import type { PortfolioReport } from '../reports/report.types';

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
    private readonly gemini: GeminiClient,
  ) {}

  async sendAll(): Promise<void> {
    const users = await this.prisma.user.findMany({
      select: { id: true, portfolios: { select: { id: true } } },
    });
    for (const user of users) {
      if (user.portfolios.length === 0) {
        continue;
      }
      try {
        await this.sendForUser(user.id);
      } catch (error) {
        this.logger.warn(
          `Cierre no enviado para ${user.id}: ${error instanceof Error ? error.message : 'error'}`,
        );
      }
    }
  }

  async sendForUser(userId: string): Promise<{ sent: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        portfolios: { select: { id: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.portfolios.length === 0) {
      return { sent: false, reason: 'No hay portafolios para informar' };
    }

    const sections: PortfolioReport[] = [];
    for (const portfolio of user.portfolios) {
      sections.push(await this.reports.build(userId, portfolio.id));
    }
    const text = sections.map((section) => section.narrative).join('\n\n');
    const interpretation = await this.interpret(text);
    const body = interpretation ? `${text}\n\nInterpretación:\n${interpretation}` : text;
    return this.mail.send({
      to: user.email,
      subject: `Cierre InvestAI · ${user.firstName}`,
      text: body,
      html: toHtml(user.firstName, sections, interpretation),
    });
  }

  private async interpret(text: string): Promise<string | null> {
    if (!this.gemini.configured()) {
      return null;
    }
    try {
      const reply = await this.gemini.generate(
        [
          {
            role: 'user',
            parts: [
              {
                text: `Reformula este cierre en un párrafo breve. Usa solo las cifras que ya aparecen. No agregues datos:\n${text}`,
              },
            ],
          },
        ],
        [],
      );
      return reply.text || null;
    } catch (error) {
      this.logger.warn(`Interpretación omitida: ${error instanceof Error ? error.message : 'error'}`);
      return null;
    }
  }
}

function toHtml(firstName: string, sections: PortfolioReport[], interpretation: string | null): string {
  const blocks = sections
    .map(
      (section) =>
        `<h2>${escapeHtml(section.portfolio.name)}</h2><p>${escapeHtml(section.narrative)}</p>`,
    )
    .join('');
  const note = interpretation ? `<h2>Interpretación</h2><p>${escapeHtml(interpretation)}</p>` : '';
  return `<p>Hola ${escapeHtml(firstName)}, este es el cierre calculado por InvestAI.</p>${blocks}${note}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
