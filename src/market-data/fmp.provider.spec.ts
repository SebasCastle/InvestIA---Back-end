import { ConfigService } from '@nestjs/config';
import { FmpProvider } from './fmp.provider';

describe('FmpProvider', () => {
  const fetchMock = jest.fn();
  const provider = new FmpProvider({
    get: (key: string) => (key === 'FMP_API_KEY' ? 'fmp-secret' : undefined),
  } as unknown as ConfigService);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('maps end-of-day bars and keeps the key out of errors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { date: '2026-01-03', open: 2, high: 3, low: 1, close: 2.5, volume: 20 },
          { date: '2026-01-02', open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
        ]),
    });

    const bars = await provider.getHistoricalPrices('AAPL', new Date('2026-01-01'), new Date('2026-01-04'));

    expect(bars.map((bar) => bar.date)).toEqual(['2026-01-02', '2026-01-03']);
    expect(bars[0]).toMatchObject({ close: 1.5, volume: 10 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('historical-price-eod/full');
  });

  it('reports an invalid key without echoing it', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ 'Error Message': 'Invalid API KEY fmp-secret' })),
    });

    await expect(provider.getQuote('AAPL')).rejects.toThrow('La clave de FMP fue rechazada');
    await expect(provider.getQuote('AAPL')).rejects.not.toThrow('fmp-secret');
  });
});
