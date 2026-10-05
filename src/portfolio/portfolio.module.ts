import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { HoldingsService } from './holdings.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [MarketDataModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, HoldingsService],
  exports: [PortfolioService, HoldingsService],
})
export class PortfolioModule {}
