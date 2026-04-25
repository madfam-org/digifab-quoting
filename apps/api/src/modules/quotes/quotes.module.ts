import { Module, forwardRef } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { Yantra4dImportController } from './yantra4d-import.controller';
import { Yantra4dImportService } from './services/yantra4d-import.service';
import { PhyneCrmEngagementService } from '../../integrations/phynecrm/phynecrm-engagement.service';
import { KarafielComplianceService } from '../../integrations/karafiel/karafiel-compliance.service';
import { DhanamMilestoneService } from '../../integrations/dhanam/dhanam-milestone.service';
import { PravaraDispatchService } from '../../integrations/pravara/pravara-dispatch.service';
import { FilesModule } from '../files/files.module';
import { PricingModule } from '../pricing/pricing.module';
// PaymentModule deleted 2026-04-25 — quotes route to Dhanam via the
// DhanamMilestoneService import (per-milestone HMAC-signed invoice
// creation) and the BillingModule's JanuaBillingService for checkout.
// Quote-acceptance to-checkout flow lives in QuotesService.
import { TenantsModule } from '../tenants/tenants.module';
import { JobsModule } from '../jobs/jobs.module';
import { EngagementsModule } from '../engagements/engagements.module';

@Module({
  imports: [
    FilesModule,
    PricingModule,
    TenantsModule,
    forwardRef(() => JobsModule),
    EngagementsModule,
  ],
  controllers: [QuotesController, Yantra4dImportController],
  providers: [
    QuotesService,
    Yantra4dImportService,
    PhyneCrmEngagementService,
    KarafielComplianceService,
    DhanamMilestoneService,
    PravaraDispatchService,
  ],
  exports: [QuotesService, Yantra4dImportService],
})
export class QuotesModule {}
