import { Module, forwardRef } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { Yantra4dImportController } from './yantra4d-import.controller';
import { Yantra4dImportService } from './services/yantra4d-import.service';
import { PhyndCrmEngagementService } from '../../integrations/phyndcrm/phyndcrm-engagement.service';
import { QuoteLifecycleEventsService } from '../../integrations/phyndcrm/quote-lifecycle-events.service';
import { QuoteExpirySweepService } from './services/quote-expiry-sweep.service';
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
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    FilesModule,
    PricingModule,
    TenantsModule,
    forwardRef(() => JobsModule),
    EngagementsModule,
    // BillingModule exports JanuaBillingService (Dhanam-checkout client)
    // and DhanamRelayService (event broadcast). Both are wired into
    // QuotesService.approve() — the synchronous checkout-URL mint and
    // the fire-and-forget `quote.accepted` relay respectively.
    // forwardRef: BillingModule now imports OrdersModule (payment
    // webhook → order creation), which imports QuotesModule — the
    // three-module cycle is broken with forwardRef on every edge.
    forwardRef(() => BillingModule),
    // EmailModule provides JanuaEmailService for the quote-ready
    // transactional delivery (centralized Janua email path).
    EmailModule,
  ],
  controllers: [QuotesController, Yantra4dImportController],
  providers: [
    QuotesService,
    Yantra4dImportService,
    PhyndCrmEngagementService,
    QuoteLifecycleEventsService,
    QuoteExpirySweepService,
    KarafielComplianceService,
    DhanamMilestoneService,
    PravaraDispatchService,
  ],
  exports: [QuotesService, Yantra4dImportService],
})
export class QuotesModule {}
