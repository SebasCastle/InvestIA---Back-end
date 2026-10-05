import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { AlertsService } from '../alerts/alerts.service';
import { DailyReportService } from './daily-report.service';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobs: CronJob[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly daily: DailyReportService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleDestroy(): void {
    for (const job of this.jobs) {
      void job.stop();
    }
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const timezone = this.config.get<string>('REPORT_TIMEZONE') || 'America/Mexico_City';
    this.register(
      'daily-close',
      this.config.get<string>('DAILY_REPORT_ENABLED') !== 'false',
      this.config.get<string>('DAILY_REPORT_CRON') || '0 22 * * 1-5',
      timezone,
      () => this.daily.sendAll(),
    );
    const hours = Number(this.config.get<string>('ALERT_COOLDOWN_HOURS') ?? 24);
    this.register(
      'alerts',
      this.config.get<string>('ALERTS_ENABLED') !== 'false',
      this.config.get<string>('ALERT_CRON') || '0 * * * *',
      timezone,
      () => this.alerts.checkAll(Number.isFinite(hours) ? hours : 24),
    );
  }

  private register(name: string, enabled: boolean, expression: string, timezone: string, task: () => Promise<void>) {
    if (!enabled) {
      this.logger.log(`Tarea ${name} desactivada`);
      return;
    }
    try {
      const job = CronJob.from({
        cronTime: expression,
        onTick: () => {
          void task().catch((error: unknown) => {
            this.logger.warn(`Tarea ${name} falló: ${error instanceof Error ? error.message : 'error'}`);
          });
        },
        timeZone: timezone,
      });
      this.jobs.push(job);
      job.start();
      this.logger.log(`Tarea ${name} programada (${expression})`);
    } catch (error) {
      this.logger.warn(`No se programó ${name}: ${error instanceof Error ? error.message : 'expresión inválida'}`);
    }
  }
}
