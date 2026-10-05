import { MarketDataCache } from './market-data.cache';
import type { MarketDataProvider } from './market-data.provider';
import { MarketDataService } from './market-data.service';

describe('MarketDataService', () => {
  it('caches quotes and reports a partial failure', async () => {
    const quote = {
      symbol: 'AAPL',
      price: 10,
      change: 1,
      changePercent: 1,
      lastUpdated: '2026-01-01T00:00:00.000Z',
    };
    const provider: MarketDataProvider = {
      name: 'fake',
      getQuote: jest.fn((symbol: string) => {
        if (symbol === 'BAD') {
          return Promise.reject(new Error('símbolo inválido'));
        }
        return Promise.resolve(quote);
      }),
      getHistoricalPrices: jest.fn(),
      searchSymbols: jest.fn(),
      getCompanyProfile: jest.fn(),
      getCompanyNews: jest.fn(),
      getFundamentals: jest.fn(),
    };
    const service = new MarketDataService(provider, new MarketDataCache(60_000));

    const first = await service.getQuotes(['aapl', 'bad']);
    const second = await service.getQuotes(['AAPL']);

    expect(first.pricesStatus).toBe('partial');
    expect(first.quotes.AAPL.price).toBe(10);
    expect(first.error).toBe('Por ahora no fue posible obtener los datos de mercado. Intenta de nuevo en unos minutos.');
    expect(second.quotes.AAPL).toEqual(quote);
    expect(provider.getQuote).toHaveBeenCalledTimes(2);
  });
});
