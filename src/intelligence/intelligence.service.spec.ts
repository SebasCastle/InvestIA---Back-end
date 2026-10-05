import { NotFoundException } from '@nestjs/common';
import { MarketDataError } from '../market-data/market-data.provider';
import { MarketDataService } from '../market-data/market-data.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { IntelligenceService } from './intelligence.service';

const asset = {
  id: 'asset-1',
  symbol: 'AAPL',
  name: 'Apple',
  type: 'STOCK',
  exchange: 'US',
  currency: 'USD',
};

describe('IntelligenceService', () => {
  const marketData = {
    getProfile: jest.fn(),
    getFundamentals: jest.fn(),
    getNews: jest.fn(),
  };
  const portfolios = {
    listOwned: jest.fn(),
    requireOwned: jest.fn(),
  };

  const service = new IntelligenceService(
    portfolios as unknown as PortfolioService,
    marketData as unknown as MarketDataService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('enriches only assets that belong to the user', async () => {
    portfolios.listOwned.mockResolvedValue([
      { id: 'p1', transactions: [{ asset }, { asset: null }] },
    ]);
    marketData.getProfile.mockResolvedValue({
      symbol: 'AAPL',
      name: 'Apple',
      exchange: 'US',
      currency: 'USD',
      industry: 'Tech',
      weburl: null,
      lastUpdated: '2026-01-02T00:00:00.000Z',
    });
    marketData.getFundamentals.mockResolvedValue({
      symbol: 'AAPL',
      marketCap: 1,
      peRatio: 20,
      pbRatio: null,
      eps: null,
      dividendYield: null,
      beta: 1,
      week52High: null,
      week52Low: null,
      lastUpdated: '2026-01-03T00:00:00.000Z',
    });
    marketData.getNews.mockResolvedValue([
      {
        id: '1',
        symbol: 'AAPL',
        headline: 'Nota',
        summary: '',
        source: 'Reuters',
        url: 'https://example.com',
        publishedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await service.forUser('user-1');

    expect(portfolios.listOwned).toHaveBeenCalledWith('user-1');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].asset.symbol).toBe('AAPL');
    expect(result.assets[0].news[0].headline).toBe('Nota');
    expect(result.assets[0].lastUpdated).toBe('2026-01-03T00:00:00.000Z');
  });

  it('keeps the asset when market data fails and rejects a foreign portfolio', async () => {
    portfolios.listOwned.mockResolvedValue([{ id: 'p1', transactions: [{ asset }] }]);
    marketData.getProfile.mockRejectedValue(new MarketDataError('sin perfil', 404));
    marketData.getFundamentals.mockRejectedValue(new MarketDataError('sin datos'));
    marketData.getNews.mockRejectedValue(new MarketDataError('sin noticias'));

    const result = await service.forUser('user-1');
    expect(result.assets[0].profile).toBeNull();
    expect(result.assets[0].news).toEqual([]);
    expect(result.assets[0].error).toBe('sin perfil');

    portfolios.requireOwned.mockRejectedValue(new NotFoundException('Portafolio no encontrado'));
    await expect(service.forUser('user-1', '11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
