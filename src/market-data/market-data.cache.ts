type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class MarketDataCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly ttlMs: number) {}

  async getOrSet<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const value = await load();
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }
}
