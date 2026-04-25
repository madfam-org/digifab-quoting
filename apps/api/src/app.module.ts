import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import configuration from './config/configuration';
import { JanuaAuthGuard } from './modules/auth/guards/janua-auth.guard';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantContextMiddleware } from './modules/tenant/tenant-context.middleware';
import { AuditModule } from './modules/audit/audit.module';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './modules/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { EngagementsModule } from './modules/engagements/engagements.module';
import { FilesModule } from './modules/files/files.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
// PaymentModule (direct Stripe) deleted 2026-04-25 — all payment ops now
// route through DhanamRelayService + JanuaBillingService in BillingModule.
// Architecture per operator directive: ONE set of Stripe keys at Dhanam,
// every other platform funnels through Dhanam's billing API.
import { OrdersModule } from './modules/orders/orders.module';
import { GuestModule } from './modules/guest/guest.module';
import { LinkProcessingModule } from './modules/link-processing/link-processing.module';
import { BillingModule } from './modules/billing/billing.module';
// Temporarily disabled for Phase 1 GTM - enterprise features not ready
// import { ConversionModule } from './modules/conversion/conversion.module';
// import { EnterpriseModule } from './modules/enterprise/enterprise.module';
import { GeoModule } from './modules/geo/geo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get('RATE_LIMIT_TTL', 60) * 1000, // Convert seconds to milliseconds
          limit: configService.get('RATE_LIMIT_MAX', 100),
        },
      ],
      inject: [ConfigService],
    }),
    TenantModule,
    PrismaModule,
    LoggerModule,
    RedisModule,
    AuditModule,
    AuthModule,
    UsersModule,
    QuotesModule,
    EngagementsModule,
    FilesModule,
    PricingModule,
    AdminModule,
    HealthModule,
    JobsModule,
    OrdersModule,
    GuestModule,
    LinkProcessingModule,
    BillingModule,
    // ConversionModule,  // Disabled for Phase 1 GTM
    // EnterpriseModule,  // Disabled for Phase 1 GTM
    GeoModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JanuaAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Exclude health + docs endpoints from tenant resolution. The
    // middleware's internal `isPublicEndpoint` check was not reliably
    // bypassing probes in production (observed during 2026-04-20
    // remediation — K8s probes got 401 "Tenant context required" and
    // the status page had to probe /api/docs instead of /health).
    // Excluding at the consumer level skips the middleware entirely.
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'api/health', method: RequestMethod.ALL },
        { path: 'api/docs', method: RequestMethod.ALL },
        { path: 'api/docs/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
