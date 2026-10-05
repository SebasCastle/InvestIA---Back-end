import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabursatilProvider } from './databursatil.provider';
import { FinnhubProvider } from './finnhub.provider';
import { FmpProvider } from './fmp.provider';
import { MarketDataCache } from './market-data.cache';
import { MarketDataController } from './market-data.controller';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from './market-data.provider';
import { MarketDataRouter } from './market-data.router';
import { MarketDataService } from './market-data.service';
import { UnavailableMarketDataProvider } from './unavailable.provider';

@Module({
  controllers: [MarketDataController],
  providers: [
    FinnhubProvider,
    FmpProvider,
    DatabursatilProvider,
    MarketDataRouter,
    UnavailableMarketDataProvider,
    {
      provide: MarketDataCache,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const seconds = Number(config.get<string>('MARKET_DATA_CACHE_TTL_SECONDS') ?? 60);
        return new MarketDataCache(Math.max(seconds, 1) * 1000);
      },
    },
    {
      provide: MARKET_DATA_PROVIDER,
      inject: [ConfigService, MarketDataRouter, UnavailableMarketDataProvider, FinnhubProvider, FmpProvider, DatabursatilProvider],
      useFactory: (
        config: ConfigService,
        router: MarketDataRouter,
        unavailable: UnavailableMarketDataProvider,
        finnhub: FinnhubProvider,
        fmp: FmpProvider,
        mexico: DatabursatilProvider,
      ): MarketDataProvider => {
        const selected = (config.get<string>('MARKET_DATA_PROVIDER') ?? 'finnhub').toLowerCase();
        if (!['finnhub', 'fmp', 'databursatil', 'composite'].includes(selected)) {
          throw new Error(`Proveedor de mercado no soportado: ${selected}`);
        }
        if (!finnhub.configured() && !fmp.configured() && !mexico.configured()) {
          return unavailable;
        }
        return router;
      },
    },
    MarketDataService,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
