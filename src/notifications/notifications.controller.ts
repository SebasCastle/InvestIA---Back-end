import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DailyReportService } from './daily-report.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly daily: DailyReportService) {}

  @Post('daily-report')
  @HttpCode(HttpStatus.OK)
  dailyReport(@CurrentUser() user: AuthenticatedUser) {
    return this.daily.sendForUser(user.userId);
  }
}
