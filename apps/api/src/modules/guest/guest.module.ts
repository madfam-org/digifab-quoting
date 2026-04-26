import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { GuestQuoteController } from './guest-quote.controller';
import { GuestQuoteService } from './guest-quote.service';
import { GuestSessionMiddleware } from './guest-session.middleware';
import { ConversionService } from './conversion.service';
import { RedisModule } from '../redis/redis.module';
import { FilesModule } from '../files/files.module';
import { PricingModule } from '../pricing/pricing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RedisModule, FilesModule, PricingModule, QuotesModule, AuthModule],
  controllers: [GuestQuoteController],
  providers: [GuestQuoteService, ConversionService],
  exports: [GuestQuoteService, ConversionService],
})
export class GuestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(GuestSessionMiddleware)
      .forRoutes({ path: 'api/v1/guest/*', method: RequestMethod.ALL });
  }
}
