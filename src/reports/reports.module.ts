import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PortfolioModule, TransactionsModule, AnalyticsModule, IntelligenceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
