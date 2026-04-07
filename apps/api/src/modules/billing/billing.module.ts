import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { UsageTrackingService } from './services/usage-tracking.service';
import { MeteringService } from './services/metering.service';
import { InvoiceService } from './services/invoice.service';
import { PricingTierService } from './services/pricing-tier.service';
import { UsageTrackingInterceptor } from './interceptors/usage-tracking.interceptor';
import { DhanamRelayService } from './services/dhanam-relay.service';
import { JanuaBillingService } from './services/janua-billing.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/modules/redis/redis.module';
// NOTE: PaymentModule (direct Stripe) removed - all payments now route through Janua

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    // PaymentModule removed - using JanuaBillingService for all payment operations
    BullModule.registerQueue({
      name: 'billing',
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    }),
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    JanuaBillingService,
    DhanamRelayService,
    UsageTrackingService,
    MeteringService,
    InvoiceService,
    PricingTierService,
    UsageTrackingInterceptor,
  ],
  exports: [
    BillingService,
    JanuaBillingService,
    DhanamRelayService,
    UsageTrackingService,
    MeteringService,
    UsageTrackingInterceptor,
  ],
})
export class BillingModule {}
