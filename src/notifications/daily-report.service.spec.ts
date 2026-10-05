import { GeminiClient } from '../ai/gemini.client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { DailyReportService } from './daily-report.service';

describe('DailyReportService', () => {
  it('sends each user only their own closing figures', async () => {
    const sent: { to: string; text: string }[] = [];
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user-a', portfolios: [{ id: 'p-a' }] },
          { id: 'user-b', portfolios: [{ id: 'p-b' }] },
        ]),
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === 'user-a') {
            return Promise.resolve({
              email: 'ana@example.com',
              firstName: 'Ana',
              portfolios: [{ id: 'p-a' }],
            });
          }
          return Promise.resolve({
            email: 'luis@example.com',
            firstName: 'Luis',
            portfolios: [{ id: 'p-b' }],
          });
        }),
      },
    };
    const reports = {
      build: jest.fn().mockImplementation((_userId: string, portfolioId: string) =>
        Promise.resolve({
          narrative: portfolioId === 'p-a' ? 'Ana vale 10 USD.' : 'Luis vale 99 USD.',
          portfolio: { name: portfolioId, currency: 'USD', id: portfolioId },
        }),
      ),
    };
    const mail = {
      send: jest.fn().mockImplementation((message: { to: string; text: string }) => {
        sent.push(message);
        return Promise.resolve({ sent: true });
      }),
    };
    const gemini = { configured: () => false, generate: jest.fn() };
    const service = new DailyReportService(
      prisma as unknown as PrismaService,
      reports as unknown as ReportsService,
      mail as unknown as MailService,
      gemini as unknown as GeminiClient,
    );

    await service.sendAll();

    expect(sent).toHaveLength(2);
    expect(sent.find((message) => message.to === 'ana@example.com')?.text).toContain('Ana vale 10');
    expect(sent.find((message) => message.to === 'ana@example.com')?.text).not.toContain('Luis vale 99');
    expect(gemini.generate).not.toHaveBeenCalled();
  });
});
