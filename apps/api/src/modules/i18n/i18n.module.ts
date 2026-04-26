import { Module, Global } from '@nestjs/common';
import { I18nService } from './i18n.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/modules/redis/redis.module';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
