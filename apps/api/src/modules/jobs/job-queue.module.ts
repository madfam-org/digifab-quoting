import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QuoteCalculationProcessor } from './processors/quote-calculation.processor';
import { FileAnalysisProcessor } from './processors/file-analysis.processor';
import { EmailNotificationProcessor } from './processors/email-notification.processor';
import { JobQueueService } from './job-queue.service';
import { JobMonitoringService } from './job-monitoring.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          maxRetriesPerRequest: configService.get('REDIS_MAX_RETRIES_PER_REQUEST', 3),
          enableReadyCheck: true,
          retryStrategy: (times: number) => {
            const maxDelay = configService.get('REDIS_RETRY_STRATEGY_MAX_MS', 2000);
            return Math.min(times * 50, maxDelay);
          },
        },
        defaultJobOptions: {
          removeOnComplete: configService.get('JOB_QUEUE_COMPLETED_RETENTION', 100),
          removeOnFail: configService.get('JOB_QUEUE_FAILED_RETENTION', 1000),
          attempts: configService.get('JOB_QUEUE_ATTEMPTS', 3),
          backoff: {
            type: 'exponential',
            delay: configService.get('JOB_QUEUE_BACKOFF_DELAY_MS', 2000),
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueueAsync(
      {
        name: 'quote-calculation',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          defaultJobOptions: {
            priority: 1,
            timeout: configService.get('QUOTE_CALCULATION_TIMEOUT_MS', 60000),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'file-analysis',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          defaultJobOptions: {
            priority: 2,
            timeout: configService.get('FILE_ANALYSIS_TIMEOUT_MS', 120000),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'email-notification',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          defaultJobOptions: {
            priority: 3,
            timeout: configService.get('EMAIL_NOTIFICATION_TIMEOUT_MS', 30000),
          },
        }),
        inject: [ConfigService],
      },
    ),
  ],
  providers: [
    QuoteCalculationProcessor,
    FileAnalysisProcessor,
    EmailNotificationProcessor,
    JobQueueService,
    JobMonitoringService,
  ],
  exports: [JobQueueService, JobMonitoringService],
})
export class JobQueueModule {}
