import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query('portfolioId') portfolioId?: string,
    @Query('range') range?: string,
    @Query('benchmark') benchmark = 'SPY',
  ) {
    if (portfolioId && !/^[0-9a-f-]{36}$/i.test(portfolioId)) {
      throw new BadRequestException('Identificador inválido');
    }
    if (!/^[A-Za-z0-9.^]{1,20}$/.test(benchmark)) {
      throw new BadRequestException('Símbolo de referencia inválido');
    }
    return this.analytics.report(user.userId, portfolioId, range, benchmark);
  }
}
