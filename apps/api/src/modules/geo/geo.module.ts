import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GeoController, CurrencyController } from './geo.controller';
import { GeoService } from './geo.service';
import { CurrencyService } from './currency.service';
import { RedisModule } from '@/modules/redis/redis.module';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [HttpModule, ConfigModule, ScheduleModule.forRoot(), RedisModule, PrismaModule],
  controllers: [GeoController, CurrencyController],
  providers: [GeoService, CurrencyService],
  exports: [GeoService, CurrencyService],
})
export class GeoModule {}
