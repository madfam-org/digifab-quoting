import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ForgeSightService } from './forgesight.service';
import { PricingResolverService } from './pricing-resolver.service';
import { ForgesightWebhookController } from '../../integrations/forgesight/webhook.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [PricingController, ForgesightWebhookController],
  providers: [PricingService, ForgeSightService, PricingResolverService],
  exports: [PricingService, ForgeSightService, PricingResolverService],
})
export class PricingModule {}
