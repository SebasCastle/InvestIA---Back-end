import { DatabursatilProvider } from './databursatil.provider';
import { FinnhubProvider } from './finnhub.provider';
import { FmpProvider } from './fmp.provider';
import { MarketDataError } from './market-data.provider';
import { MarketDataRouter } from './market-data.router';

function providers() {
  const finnhub = {
    configured: () => true,
    getQuote: jest.fn(),
    getHistoricalPrices: jest.fn(),
    searchSymbols: jest.fn().mockResolvedValue([]),
    getCompanyProfile: jest.fn(),
    getCompanyNews: jest.fn(),
    getFundamentals: jest.fn(),
  };
  const fmp = {
    configured: () => true,
    getQuote: jest.fn(),
    getHistoricalPrices: jest.fn(),
    searchSymbols: jest.fn().mockResolvedValue([]),
    getCompanyProfile: jest.fn(),
    getCompanyNews: jest.fn(),
    getFundamentals: jest.fn(),
  };
  const mexico = {
    configured: () => true,
    getQuote: jest.fn(),
    getHistoricalPrices: jest.fn(),
    searchSymbols: jest.fn().mockResolvedValue([]),
    getCompanyProfile: jest.fn(),
    getCompanyNews: jest.fn(),
    getFundamentals: jest.fn(),
  };
  const router = new MarketDataRouter(
    finnhub as unknown as FinnhubProvider,
    fmp as unknown as FmpProvider,
    mexico as unknown as DatabursatilProvider,
  );
  return { router, finnhub, fmp, mexico };
}

describe('MarketDataRouter', () => {
  it('uses Finnhub for a US quote and FMP when Finnhub cannot serve it', async () => {
    const { router, finnhub, fmp } = providers();
    finnhub.getQuote.mockRejectedValue(new MarketDataError('Finnhub no encontró ese recurso', 404));
    fmp.getQuote.mockResolvedValue({ symbol: 'AAPL', price: 10, change: 1, changePercent: 1, lastUpdated: '' });

    await expect(router.getQuote('AAPL')).resolves.toMatchObject({ price: 10 });
    expect(fmp.getQuote).toHaveBeenCalledWith('AAPL');
  });

  it('does not hide a rejected API key', async () => {
    const { router, finnhub, fmp } = providers();
    finnhub.getQuote.mockRejectedValue(new MarketDataError('La clave de Finnhub fue rechazada', 401));

    await expect(router.getQuote('AAPL')).rejects.toThrow('clave de Finnhub');
    expect(fmp.getQuote).not.toHaveBeenCalled();
  });

  it('reads US history from FMP before Finnhub candles', async () => {
    const { router, finnhub, fmp } = providers();
    fmp.getHistoricalPrices.mockResolvedValue([{ date: '2026-01-02', open: 1, high: 2, low: 1, close: 2, volume: 5 }]);

    const bars = await router.getHistoricalPrices('SPY', new Date('2026-01-01'), new Date('2026-01-03'));

    expect(bars[0].close).toBe(2);
    expect(finnhub.getHistoricalPrices).not.toHaveBeenCalled();
  });

  it('sends a Mexican series to DataBursátil', async () => {
    const { router, mexico, fmp } = providers();
    mexico.getHistoricalPrices.mockResolvedValue([]);

    await router.getHistoricalPrices('WALMEX*', new Date(), new Date());

    expect(mexico.getHistoricalPrices).toHaveBeenCalledWith('WALMEX*', expect.any(Date), expect.any(Date));
    expect(fmp.getHistoricalPrices).not.toHaveBeenCalled();
  });
});
