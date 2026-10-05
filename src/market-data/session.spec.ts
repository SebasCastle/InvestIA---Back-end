import { resolveSession } from './session';

describe('resolveSession', () => {
  const bars = [
    { date: '2026-10-02', open: 10, high: 12, low: 9, close: 11, volume: null },
    { date: '2026-10-05', open: 11, high: 13, low: 10, close: 12, volume: null },
  ];

  it('returns the same-day OHLC', () => {
    const session = resolveSession('AAPL', '2026-10-05', bars);
    expect(session.close).toBe(12);
    expect(session.usedPreviousClose).toBe(false);
    expect(session.message).toBeNull();
  });

  it('offers the previous close when the market was closed', () => {
    const session = resolveSession('AAPL', '2026-10-04', bars);
    expect(session.sessionDate).toBe('2026-10-02');
    expect(session.close).toBe(11);
    expect(session.usedPreviousClose).toBe(true);
    expect(session.message).toContain('no hubo sesión');
  });

  it('does not invent a price when nothing is available', () => {
    const session = resolveSession('AAPL', '2026-09-01', bars);
    expect(session.close).toBeNull();
    expect(session.message).toContain('No hay un cierre');
  });
});
