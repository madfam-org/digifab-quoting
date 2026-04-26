import { Module } from '@nestjs/common';
import { EnterpriseService } from './enterprise.service';
import { EnterpriseController } from './enterprise.controller';
import { SSOService } from './services/sso.service';
import { AuditTrailService } from './services/audit-trail.service';
import { ComplianceService } from './services/compliance.service';
import { WhiteLabelService } from './services/white-label.service';
import { DedicatedSupportService } from './services/dedicated-support.service';
import { EnterpriseAnalyticsService } from './services/enterprise-analytics.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { TenantModule } from '@/modules/tenant/tenant.module';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [PrismaModule, RedisModule, TenantModule, AuthModule],
  controllers: [EnterpriseController],
  providers: [
    EnterpriseService,
    SSOService,
    AuditTrailService,
    ComplianceService,
    WhiteLabelService,
    DedicatedSupportService,
    EnterpriseAnalyticsService,
  ],
  exports: [EnterpriseService, SSOService, WhiteLabelService, ComplianceService],
})
export class EnterpriseModule {}
