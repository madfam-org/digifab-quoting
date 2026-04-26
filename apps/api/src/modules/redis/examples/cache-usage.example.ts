/**
 * Example usage of Redis caching in Cotiza Studio Quoting MVP
 *
 * This file demonstrates various caching patterns and best practices
 */

import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache.service';
import { QuoteCacheService } from '../quote-cache.service';
import { Cacheable, CacheInvalidate } from '../decorators/cache.decorator';
import { CacheInterceptor } from '../interceptors/cache.interceptor';

/**
 * Example 1: Basic caching with decorators
 */
@Injectable()
export class ExampleService {
  constructor(
    private cacheService: CacheService,
    private quoteCacheService: QuoteCacheService,
  ) {}

  /**
   * Simple method caching - results are cached for 5 minutes
   */
  @Cacheable({ prefix: 'example:data', ttl: 300 })
  async getExpensiveData(id: string) {
    // This expensive operation will only run if not in cache
    return await this.performExpensiveCalculation(id);
  }

  /**
   * Cache invalidation - clears cache after update
   */
  @CacheInvalidate('example:data:*')
  async updateData(id: string, data: Record<string, unknown>) {
    // Update operation
    // Cache will be invalidated after this method completes
    return await this.saveData(id, data);
  }

  /**
   * Conditional caching - only cache if quantity > 10
   */
  @Cacheable({
    prefix: 'bulk:orders',
    ttl: 600,
    condition: (quantity: number) => quantity > 10,
  })
  async calculateBulkPrice(quantity: number) {
    return await this.complexPriceCalculation(quantity);
  }

  /**
   * Custom key generation for complex parameters
   */
  @Cacheable({
    prefix: 'custom',
    keyGenerator: (prefix: string, options: Record<string, unknown>) => {
      return `${prefix}:${options.service}:${options.material}:${options.quantity}`;
    },
  })
  async getCustomQuote(options: { service: string; material: string; quantity: number }) {
    return await this.calculateCustomQuote(options);
  }

  // Placeholder methods
  private async performExpensiveCalculation(id: string) {
    return { id, data: 'expensive' };
  }
  private async saveData(id: string, data: Record<string, unknown>) {
    return { id, data };
  }
  private async complexPriceCalculation(quantity: number) {
    return { price: quantity * 10 };
  }
  private async calculateCustomQuote(options: Record<string, unknown>) {
    return { quote: options };
  }
}

/**
 * Example 2: Using cache-aside pattern manually
 */
@Injectable()
export class TenantConfigService {
  constructor(private cacheService: CacheService) {}

  async getTenantConfig(tenantId: string) {
    // Use cache-aside pattern for tenant configuration
    return await this.cacheService.getOrSet({
      key: `tenant:config:${tenantId}`,
      ttl: 1800, // 30 minutes
      fetchFn: async () => {
        // Fetch from database if not in cache
        return await this.fetchTenantConfigFromDb(tenantId);
      },
      tenantSpecific: false, // Already included tenantId in key
    });
  }

  async updateTenantConfig(tenantId: string, config: Record<string, unknown>) {
    // Update database
    const updated = await this.saveTenantConfigToDb(tenantId, config);

    // Invalidate cache
    await this.cacheService.invalidate(`tenant:config:${tenantId}`);

    return updated;
  }

  // Placeholder methods
  private async fetchTenantConfigFromDb(tenantId: string) {
    return { tenantId, config: {} };
  }
  private async saveTenantConfigToDb(tenantId: string, config: Record<string, unknown>) {
    return { tenantId, config };
  }
}

/**
 * Example 3: Quote caching with file hash
 */
@Injectable()
export class QuoteCalculationService {
  constructor(private quoteCacheService: QuoteCacheService) {}

  async calculateQuote(fileHash: string, options: Record<string, unknown>) {
    const cacheKey = {
      fileHash,
      service: options.service,
      material: options.material,
      quantity: options.quantity,
      options: options.additionalOptions,
    };

    // Use specialized quote cache service
    return await this.quoteCacheService.getOrCalculateQuote(cacheKey, async () => {
      // Perform actual calculation if not cached
      const result = await this.performQuoteCalculation(fileHash, options);

      return {
        pricing: {
          unitCost: result.unitCost,
          totalCost: result.totalCost,
          margin: result.margin,
          finalPrice: result.finalPrice,
        },
        manufacturing: {
          estimatedTime: result.leadTime,
          machineCost: result.machineCost,
          materialCost: result.materialCost,
        },
        geometry: result.geometry,
        timestamp: Date.now(),
      };
    });
  }

  async invalidateQuotesForMaterial(service: string, material: string) {
    // Invalidate all quotes for a specific service/material combination
    // Useful when pricing rules change
    return await this.quoteCacheService.invalidateServiceMaterialQuotes(service, material);
  }

  // Placeholder method
  private async performQuoteCalculation(_fileHash: string, _options: Record<string, unknown>) {
    return {
      unitCost: 100,
      totalCost: 1000,
      margin: 0.3,
      finalPrice: 1300,
      leadTime: 5,
      machineCost: 500,
      materialCost: 500,
      geometry: { volume: 100 },
    };
  }
}

/**
 * Example 4: Controller with cache interceptor
 */
@Controller('cached-products')
export class CachedProductController {
  /**
   * Using cache interceptor for HTTP response caching
   */
  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  async getProduct(@Param('id') id: string) {
    // Response will be cached by the interceptor
    return { id, name: 'Product', price: 100 };
  }
}

/**
 * Example 5: Session caching for performance
 */
@Injectable()
export class SessionService {
  constructor(private cacheService: CacheService) {}

  async getUserSession(userId: string) {
    // Try cache first
    const cached = await this.cacheService.getCachedUserSession(userId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const session = await this.fetchSessionFromDb(userId);

    // Cache for future requests
    await this.cacheService.cacheUserSession(userId, session);

    return session;
  }

  async extendSession(userId: string) {
    // Extend TTL without fetching data
    return await this.cacheService.extendUserSession(userId);
  }

  // Placeholder method
  private async fetchSessionFromDb(userId: string) {
    return { userId, permissions: [], lastAccess: new Date() };
  }
}

/**
 * Example 6: Batch operations for efficiency
 */
@Injectable()
export class BatchQuoteService {
  constructor(private quoteCacheService: QuoteCacheService) {}

  async getMultipleQuotes(quoteRequests: Record<string, unknown>[]) {
    // Prepare cache keys
    const cacheKeys = quoteRequests.map((req) => ({
      fileHash: req.fileHash,
      service: req.service,
      material: req.material,
      quantity: req.quantity,
    }));

    // Batch get from cache
    const cachedResults = await this.quoteCacheService.batchGetQuotes(cacheKeys);

    // Process results
    const results = [];
    for (let i = 0; i < quoteRequests.length; i++) {
      const cacheKey = this.generateCacheKey(cacheKeys[i]);
      const cached = cachedResults.get(cacheKey);

      if (cached) {
        results.push(cached);
      } else {
        // Calculate missing quotes
        const calculated = await this.calculateSingleQuote(quoteRequests[i]);
        results.push(calculated);

        // Cache for future use
        await this.quoteCacheService.cacheQuote(cacheKeys[i], calculated);
      }
    }

    return results;
  }

  private generateCacheKey(key: unknown): string {
    return `quote:file:${key.fileHash}:${key.service}:${key.material}:${key.quantity}:default`;
  }

  private async calculateSingleQuote(_request: Record<string, unknown>) {
    return {
      pricing: { unitCost: 100, totalCost: 1000, margin: 0.3, finalPrice: 1300 },
      manufacturing: { estimatedTime: 5, machineCost: 500, materialCost: 500 },
      timestamp: Date.now(),
    };
  }
}

/**
 * Example 7: Cache warming strategy
 */
@Injectable()
export class CacheWarmingService {
  constructor(
    private cacheService: CacheService,
    private quoteCacheService: QuoteCacheService,
  ) {}

  async warmUpCache() {
    // Pre-load frequently accessed data
    const commonConfigs = [
      { service: 'FFF_PRINTING', material: 'PLA', quantities: [1, 10, 100] },
      { service: 'FFF_PRINTING', material: 'ABS', quantities: [1, 10, 100] },
      { service: 'SLA_PRINTING', material: 'RESIN_STANDARD', quantities: [1, 5, 20] },
      { service: 'CNC_MILLING', material: 'ALUMINUM_6061', quantities: [1, 5, 10] },
    ];

    await this.quoteCacheService.warmUpQuoteCache(commonConfigs);
  }
}

/**
 * Example 8: Monitoring and maintenance
 */
@Injectable()
export class CacheMonitoringService {
  constructor(
    private cacheService: CacheService,
    private quoteCacheService: QuoteCacheService,
  ) {}

  async getHealthMetrics() {
    const health = await this.cacheService.getHealthStatus();
    const quoteStats = await this.quoteCacheService.getQuoteCacheStats();

    return {
      cache: health,
      quotes: quoteStats,
      recommendations: this.generateRecommendations(health, quoteStats),
    };
  }

  private generateRecommendations(
    health: Record<string, unknown>,
    quoteStats: Record<string, unknown>,
  ) {
    const recommendations = [];

    if (health.statistics.hitRate < 50) {
      recommendations.push('Low hit rate - consider increasing TTL or warming cache');
    }

    if (health.statistics.errors > 100) {
      recommendations.push('High error count - check Redis connection stability');
    }

    if (quoteStats.averageTTL < 300) {
      recommendations.push('Short average TTL - quotes may be expiring too quickly');
    }

    return recommendations;
  }
}
