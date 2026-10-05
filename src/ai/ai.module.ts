import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiToolExecutor } from './ai.tools';
import { GeminiClient } from './gemini.client';

@Module({
  imports: [PortfolioModule, TransactionsModule, MarketDataModule, IntelligenceModule, AnalyticsModule],
  controllers: [AiController],
  providers: [GeminiClient, AiToolExecutor, AiService],
  exports: [GeminiClient],
})
export class AiModule {}
