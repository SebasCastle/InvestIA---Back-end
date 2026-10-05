import { Injectable } from '@nestjs/common';
import { MarketDataError, type MarketDataProvider } from './market-data.provider';

@Injectable()
export class UnavailableMarketDataProvider implements MarketDataProvider {
  readonly name = 'unavailable';

  getQuote(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  getHistoricalPrices(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  searchSymbols(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  getCompanyProfile(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  getCompanyNews(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  getFundamentals(): Promise<never> {
    return Promise.reject(this.unavailable());
  }

  private unavailable(): MarketDataError {
    return new MarketDataError('Los datos de mercado no están configurados');
  }
}
