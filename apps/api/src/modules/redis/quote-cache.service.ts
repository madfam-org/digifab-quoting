import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService } from './cache.service';
import { RedisService } from './redis.service';
import { LoggerService } from '@/common/logger/logger.service';
import type { PricingRule } from '@cotiza/shared';

export interface QuoteCacheKey {
  fileHash: string;
  service: string;
  material: string;
  quantity: number;
  options?: Record<string, unknown>;
}

export interface CachedQuoteResult {
  pricing: {
    unitCost: number;
    totalCost: number;
    margin: number;
    finalPrice: number;
  };
  manufacturing: {
    estimatedTime: number;
    machineCost: number;
    materialCost: number;
  };
  geometry?: {
    volume: number;
    boundingBox: { x: number; y: number; z: number };
    surface_area?: number;
  };
  timestamp: number;
}

@Injectable()
export class QuoteCacheService {
  private readonly QUOTE_CACHE_TTL = 3600; // 1 hour
  private readonly PRICING_CACHE_TTL = 1800; // 30 minutes
  // private readonly CONFIG_CACHE_TTL = 900; // 15 minutes - unused for now

  constructor(
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Get or calculate quote with caching
   */
  async getOrCalculateQuote(
    key: QuoteCacheKey,
    calculateFn: () => Promise<CachedQuoteResult>,
  ): Promise<CachedQuoteResult> {
    const cacheKey = this.generateQuoteCacheKey(key);

    return await this.cacheService.getOrSet({
      key: cacheKey,
      ttl: this.QUOTE_CACHE_TTL,
      fetchFn: calculateFn,
      tenantSpecific: true,
    });
  }

  /**
   * Cache quote calculation result
   */
  async cacheQuote(key: QuoteCacheKey, result: CachedQuoteResult): Promise<void> {
    const cacheKey = this.generateQuoteCacheKey(key);
    await this.redisService.set(cacheKey, result, this.QUOTE_CACHE_TTL, {
      tenantId: this.cacheService['tenantContext'].getTenantId(),
    });
  }

  /**
   * Get cached quote
   */
  async getCachedQuote(key: QuoteCacheKey): Promise<CachedQuoteResult | null> {
    const cacheKey = this.generateQuoteCacheKey(key);
    return await this.redisService.get<CachedQuoteResult>(cacheKey);
  }

  /**
   * Invalidate quotes for a specific file
   */
  async invalidateFileQuotes(fileHash: string): Promise<number> {
    const pattern = `quote:file:${fileHash}:*`;
    return await this.cacheService.invalidate(pattern);
  }

  /**
   * Invalidate quotes for a specific service/material combination
   */
  async invalidateServiceMaterialQuotes(service: string, material: string): Promise<number> {
    const pattern = `quote:*:${service}:${material}:*`;
    return await this.cacheService.invalidate(pattern);
  }

  /**
   * Cache pricing configuration
   */
  async cachePricingConfig(
    service: string,
    material: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    await this.cacheService.cachePricingRules(
      service,
      material,
      config as unknown as PricingRule[],
      this.PRICING_CACHE_TTL,
    );
  }

  /**
   * Get cached pricing configuration
   */
  async getCachedPricingConfig(
    service: string,
    material: string,
  ): Promise<Record<string, unknown> | null> {
    const rules = await this.cacheService.getCachedPricingRules(service, material);
    return rules as unknown as Record<string, unknown> | null;
  }

  /**
   * Batch get quotes
   */
  async batchGetQuotes(keys: QuoteCacheKey[]): Promise<Map<string, CachedQuoteResult | null>> {
    const results = new Map<string, CachedQuoteResult | null>();

    // Use pipeline for efficient batch operations
    const client = this.redisService.getClient();
    if (!client) {
      return results;
    }
    const pipeline = client.pipeline();
    const cacheKeys = keys.map((key) => this.generateQuoteCacheKey(key));

    cacheKeys.forEach((key) => {
      pipeline.get(key);
    });

    try {
      const responses = await pipeline.exec();

      responses?.forEach(([err, value], index) => {
        if (!err && value) {
          try {
            const parsed = JSON.parse(value as string);
            results.set(cacheKeys[index], parsed.data);
          } catch (e) {
            results.set(cacheKeys[index], null);
          }
        } else {
          results.set(cacheKeys[index], null);
        }
      });
    } catch (error) {
      this.logger.error(
        'Error in batch get quotes',
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return results;
  }

  /**
   * Warm up quote cache with common configurations
   */
  async warmUpQuoteCache(
    commonConfigs: Array<{
      service: string;
      material: string;
      quantities: number[];
    }>,
  ): Promise<void> {
    this.logger.log('Warming up quote cache');

    for (const config of commonConfigs) {
      // Pre-fetch pricing configurations
      await this.getCachedPricingConfig(config.service, config.material);
    }
  }

  /**
   * Get quote cache statistics
   */
  async getQuoteCacheStats(): Promise<{
    totalQuotes: number;
    totalPricingConfigs: number;
    averageTTL: number;
  }> {
    const client = this.redisService.getClient();
    if (!client) {
      return {
        totalQuotes: 0,
        totalPricingConfigs: 0,
        averageTTL: 0,
      };
    }
    const quoteKeys = await client.keys('*:quote:*');
    const pricingKeys = await client.keys('*:pricing:*');

    let totalTTL = 0;
    let validKeys = 0;

    for (const key of quoteKeys.slice(0, 100)) {
      // Sample first 100
      const ttl = await this.redisService.ttl(key);
      if (ttl > 0) {
        totalTTL += ttl;
        validKeys++;
      }
    }

    return {
      totalQuotes: quoteKeys.length,
      totalPricingConfigs: pricingKeys.length,
      averageTTL: validKeys > 0 ? totalTTL / validKeys : 0,
    };
  }

  /**
   * Generate quote cache key
   */
  private generateQuoteCacheKey(key: QuoteCacheKey): string {
    const optionsHash = key.options ? this.hashObject(key.options) : 'default';

    return `quote:file:${key.fileHash}:${key.service}:${key.material}:${key.quantity}:${optionsHash}`;
  }

  /**
   * Hash object for consistent key generation
   */
  private hashObject(obj: Record<string, unknown>): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('md5').update(str).digest('hex').substring(0, 8);
  }
}
