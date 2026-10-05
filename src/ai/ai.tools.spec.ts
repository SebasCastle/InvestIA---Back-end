import { AnalyticsService } from '../analytics/analytics.service';
import { IntelligenceService } from '../intelligence/intelligence.service';
import { MarketDataService } from '../market-data/market-data.service';
import { HoldingsService } from '../portfolio/holdings.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AI_TOOLS, AiToolExecutor } from './ai.tools';

describe('AiToolExecutor', () => {
  const transactions = { list: jest.fn(), create: jest.fn(), remove: jest.fn() };
  const holdings = { list: jest.fn(), summary: jest.fn(), performance: jest.fn() };
  const intelligence = { forUser: jest.fn() };
  const executor = new AiToolExecutor(
    {} as PortfolioService,
    holdings as unknown as HoldingsService,
    transactions as unknown as TransactionsService,
    {} as MarketDataService,
    intelligence as unknown as IntelligenceService,
    {} as AnalyticsService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('only exposes read tools', () => {
    const names = AI_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['get_portfolio', 'get_transactions', 'get_news', 'get_benchmark']),
    );
    expect(names.join(' ')).not.toMatch(/create|update|delete|remove/i);
  });

  it('rejects a write and only reads the signed-in user', async () => {
    const denied = await executor.run('user-1', 'create_transaction', { portfolioId: 'p1' });
    expect(denied).toEqual({ error: 'Operación no permitida' });
    expect(transactions.create).not.toHaveBeenCalled();

    intelligence.forUser.mockResolvedValue({
      assets: [
        {
          asset: { symbol: 'MSFT' },
          fundamentals: { peRatio: 30 },
          news: [],
          error: null,
        },
      ],
    });
    const fundamentals = await executor.run('user-1', 'get_fundamentals', { symbol: 'AAPL' });
    expect(intelligence.forUser).toHaveBeenCalledWith('user-1', undefined);
    expect(fundamentals).toEqual({ error: 'Ese símbolo no está entre los activos del usuario' });
  });
});
