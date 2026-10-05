import type { HistoricalPrice, TradingSession } from './market-data.types';

export function resolveSession(symbol: string, requestedDate: string, bars: HistoricalPrice[]): TradingSession {
  const ordered = [...bars].sort((left, right) => left.date.localeCompare(right.date));
  const exact = ordered.find((bar) => bar.date === requestedDate);
  if (exact) {
    return {
      symbol,
      requestedDate,
      sessionDate: exact.date,
      open: exact.open,
      high: exact.high,
      low: exact.low,
      close: exact.close,
      usedPreviousClose: false,
      message: null,
    };
  }

  const previous = [...ordered].reverse().find((bar) => bar.date < requestedDate);
  if (!previous) {
    return {
      symbol,
      requestedDate,
      sessionDate: null,
      open: null,
      high: null,
      low: null,
      close: null,
      usedPreviousClose: false,
      message: 'No hay un cierre de mercado para esa fecha.',
    };
  }

  return {
    symbol,
    requestedDate,
    sessionDate: previous.date,
    open: previous.open,
    high: previous.high,
    low: previous.low,
    close: previous.close,
    usedPreviousClose: true,
    message: `El ${requestedDate} no hubo sesión. El último cierre disponible es el del ${previous.date}.`,
  };
}
