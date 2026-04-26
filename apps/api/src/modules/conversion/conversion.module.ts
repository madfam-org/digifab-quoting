import { Module } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { ConversionController } from './conversion.controller';
import { ConversionTrackingService } from './services/conversion-tracking.service';
import { UpgradePromptService } from './services/upgrade-prompt.service';
import { ConversionAnalyticsService } from './services/conversion-analytics.service';
import { ConversionInterceptor } from './interceptors/conversion.interceptor';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { TenantModule } from '@/modules/tenant/tenant.module';

@Module({
  imports: [PrismaModule, RedisModule, BillingModule, TenantModule],
  controllers: [ConversionController],
  providers: [
    ConversionService,
    ConversionTrackingService,
    UpgradePromptService,
    ConversionAnalyticsService,
    ConversionInterceptor,
  ],
  exports: [
    ConversionService,
    ConversionTrackingService,
    UpgradePromptService,
    ConversionInterceptor,
  ],
})
export class ConversionModule {}
