import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { Yantra4dWebhookService } from '../quotes/services/yantra4d-webhook.service';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [PaymentController],
  providers: [PaymentService, StripeService, Yantra4dWebhookService],
  exports: [PaymentService, StripeService],
})
export class PaymentModule {}
