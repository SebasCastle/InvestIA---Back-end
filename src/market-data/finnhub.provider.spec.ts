import { ConfigService } from '@nestjs/config';
import { FinnhubProvider } from './finnhub.provider';
import { MarketDataError } from './market-data.provider';

describe('FinnhubProvider', () => {
  const fetchMock = jest.fn();
  const config = {
    get: jest.fn((key: string) => (key === 'FINNHUB_API_KEY' ? 'test-key' : undefined)),
  } as unknown as ConfigService;
  const provider = new FinnhubProvider(config);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('maps a quote and does not expose the api key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ c: 190.5, d: 1.5, dp: 0.8, t: 1_700_000_000 }),
    });

    const quote = await provider.getQuote('AAPL');

    expect(quote).toMatchObject({
      symbol: 'AAPL',
      price: 190.5,
      change: 1.5,
      changePercent: 0.8,
      lastUpdated: '2023-11-14T22:13:20.000Z',
    });
    const called = String(fetchMock.mock.calls[0][0]);
    expect(called).toContain('symbol=AAPL');
    expect(called).toContain('token=test-key');
  });

  it('maps daily candles', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ c: [10, 12], t: [1_700_000_000, 1_700_086_400], s: 'ok' }),
    });

    const prices = await provider.getHistoricalPrices(
      'AAPL',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-10T00:00:00.000Z'),
    );

    expect(prices).toEqual([
      { date: '2023-11-14', open: null, high: null, low: null, close: 10, volume: null },
      { date: '2023-11-15', open: null, high: null, low: null, close: 12, volume: null },
    ]);
  });

  it('returns an empty history when Finnhub has no data', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ s: 'no_data' }),
    });

    await expect(
      provider.getHistoricalPrices('NONE', new Date(), new Date()),
    ).resolves.toEqual([]);
  });

  it('fails clearly when the api key is missing', async () => {
    const unconfigured = new FinnhubProvider({
      get: () => '',
    } as unknown as ConfigService);

    await expect(unconfigured.getQuote('AAPL')).rejects.toBeInstanceOf(MarketDataError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('distinguishes Finnhub status codes and never returns the api key', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: 'Invalid API key test-key' })),
    });
    await expect(provider.getQuote('AAPL')).rejects.toThrow('La clave de Finnhub fue rechazada');

    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({ error: "You don't have access to this resource." })),
    });
    await expect(provider.getHistoricalPrices('SPY', new Date(), new Date())).rejects.toThrow(
      'no incluye /stock/candle',
    );

    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve(JSON.stringify({ error: 'limit' })),
    });
    await expect(provider.getQuote('BB')).rejects.toThrow('limitó las consultas');

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('{}'),
    });
    await expect(provider.getCompanyProfile('EXE')).rejects.toThrow('no está disponible');
    await expect(provider.getCompanyProfile('EXE')).rejects.not.toThrow('test-key');
  });

  it('maps company news and fundamentals without leaking the api key', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            id: 7,
            headline: 'Resultados',
            summary: 'Trimestre',
            source: 'Reuters',
            url: 'https://example.com/news',
            datetime: 1_700_000_000,
          },
        ]),
    });

    const news = await provider.getCompanyNews(
      'AAPL',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-15T00:00:00.000Z'),
    );
    expect(news[0]).toMatchObject({
      id: '7',
      symbol: 'AAPL',
      headline: 'Resultados',
      publishedAt: '2023-11-14T22:13:20.000Z',
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          metric: { marketCapitalization: 2, peNormalizedAnnual: 20, beta: 1.1, '52WeekHigh': 200 },
        }),
    });
    const fundamentals = await provider.getFundamentals('AAPL');
    expect(fundamentals.marketCap).toBe(2_000_000);
    expect(fundamentals.peRatio).toBe(20);
    expect(fundamentals.beta).toBe(1.1);
    expect(fundamentals.week52High).toBe(200);
    expect(fundamentals.pbRatio).toBeNull();
    expect(JSON.stringify(fundamentals)).not.toContain('test-key');
  });
});
