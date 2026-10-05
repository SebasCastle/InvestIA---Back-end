import { readHistory } from './databursatil.provider';

describe('DataBursátil history', () => {
  it('maps closing prices keyed by date and does not invent OHLC', () => {
    const bars = readHistory({
      '2026-10-02': { precio: 64.5, importe: 1000 },
      '2026-10-05': { precio: 65 },
    });

    expect(bars).toEqual([
      { date: '2026-10-02', open: null, high: null, low: null, close: 64.5, volume: 1000 },
      { date: '2026-10-05', open: null, high: null, low: null, close: 65, volume: null },
    ]);
  });
});
