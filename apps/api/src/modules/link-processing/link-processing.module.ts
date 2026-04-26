import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { LinkProcessingController } from './link-processing.controller';
import { LinkProcessingService } from './link-processing.service';
import { ContentFetcherService } from './services/content-fetcher.service';
import { BOMParserService } from './services/bom-parser.service';
import { PersonaQuoteGeneratorService } from './services/persona-quote-generator.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PricingModule } from '../pricing/pricing.module';
import { JobType } from '../jobs/interfaces/job.interface';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({
      name: JobType.LINK_ANALYSIS,
    }),
    PrismaModule,
    RedisModule,
    QuotesModule,
    PricingModule,
  ],
  controllers: [LinkProcessingController],
  providers: [
    LinkProcessingService,
    ContentFetcherService,
    BOMParserService,
    PersonaQuoteGeneratorService,
  ],
  exports: [
    LinkProcessingService,
    ContentFetcherService,
    BOMParserService,
    PersonaQuoteGeneratorService,
  ],
})
export class LinkProcessingModule {}
