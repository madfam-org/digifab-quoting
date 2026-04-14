import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ForgeSightService } from './forgesight.service';
import { ForgesightWebhookController } from '../../integrations/forgesight/webhook.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [PricingController, ForgesightWebhookController],
  providers: [PricingService, ForgeSightService],
  exports: [PricingService, ForgeSightService],
})
export class PricingModule {}
