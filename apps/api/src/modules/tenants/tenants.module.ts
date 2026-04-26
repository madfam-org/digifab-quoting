import { Module } from '@nestjs/common';
import { TenantCacheService } from './services/tenant-cache.service';

@Module({
  providers: [TenantCacheService],
  exports: [TenantCacheService],
})
export class TenantsModule {}
