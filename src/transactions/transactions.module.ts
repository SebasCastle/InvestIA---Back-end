import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [PortfolioModule, AssetsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
