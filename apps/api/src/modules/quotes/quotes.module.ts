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
import { PaymentModule } from '../payment/payment.module';
import { TenantsModule } from '../tenants/tenants.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [FilesModule, PricingModule, PaymentModule, TenantsModule, forwardRef(() => JobsModule)],
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
