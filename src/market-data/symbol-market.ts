export function isMexicanListing(symbol: string): boolean {
  const value = symbol.trim().toUpperCase();
  return value.endsWith('.MX') || value.endsWith('*') || value.includes('-') || value === 'IPC';
}

export function mexicanSeries(symbol: string): string {
  const value = symbol.trim().toUpperCase();
  return value.endsWith('.MX') ? value.slice(0, -3) : value;
}

export function isIndexSymbol(symbol: string): boolean {
  return symbol.trim().toUpperCase() === 'IPC';
}
