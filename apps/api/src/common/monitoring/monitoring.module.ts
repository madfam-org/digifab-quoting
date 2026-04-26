import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryService } from './sentry.service';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';
import { PerformanceService } from './performance.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SentryService, MetricsService, HealthService, PerformanceService],
  exports: [SentryService, MetricsService, HealthService, PerformanceService],
})
export class MonitoringModule {}
