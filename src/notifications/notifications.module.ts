import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AlertsModule } from '../alerts/alerts.module';
import { MailModule } from '../mail/mail.module';
import { ReportsModule } from '../reports/reports.module';
import { DailyReportService } from './daily-report.service';
import { JobsService } from './jobs.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [ReportsModule, MailModule, AiModule, AlertsModule],
  controllers: [NotificationsController],
  providers: [DailyReportService, JobsService],
})
export class NotificationsModule {}