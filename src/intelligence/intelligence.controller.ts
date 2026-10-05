import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntelligenceService } from './intelligence.service';

@Controller('intelligence')
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Get()
  forUser(@CurrentUser() user: AuthenticatedUser, @Query('portfolioId') portfolioId?: string) {
    if (portfolioId && !/^[0-9a-f-]{36}$/i.test(portfolioId)) {
      throw new BadRequestException('Identificador inválido');
    }
    return this.intelligence.forUser(user.userId, portfolioId);
  }
}
