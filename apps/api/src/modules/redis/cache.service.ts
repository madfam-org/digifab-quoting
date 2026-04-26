import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from './redis.service';
import { TenantContextService } from '@/modules/tenant/tenant-context.service';
import { LoggerService } from '@/common/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import type { PricingRule, Tenant, Quote, QuoteItem } from '@cotiza/shared';
import type { CacheStatistics } from './interfaces/cache-options.interface';

export interface CacheAsideOptions<T> {
  key: string;
  ttl?: number;
  fetchFn: () => Promise<T>;
  tenantSpecific?: boolean;
  version?: string;
}

export interface QuoteConfiguration {
  process: string;
  material: string;
  quantity: number;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QuoteCalculationResult {
  quote: Quote;
  items: QuoteItem[];
  processingTime: number;
  cached?: boolean;
}

export interface UserSessionData {
  userId: string;
  tenantId: string;
  roles: string[];
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface CacheMetadata {
  tenantId?: string;
  version?: string;
  [key: string]: unknown;
}

@Injectable()
export class CacheService {
  private readonly pricingRulesTtl: number;
  private readonly tenantConfigTtl: number;
  private readonly userSessionTtl: number;
  private readonly quoteCalculationTtl: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.pricingRulesTtl = this.configService.get<number>('CACHE_PRICING_RULES_TTL', 3600);
    this.tenantConfigTtl = this.configService.get<number>('CACHE_TENANT_CONFIG_TTL', 1800);
    this.userSessionTtl = this.configService.get<number>('CACHE_USER_SESSION_TTL', 900);
    this.quoteCalculationTtl = this.configService.get<number>('CACHE_QUOTE_CALCULATION_TTL', 3600);
  }

  /**
   * Cache-aside pattern implementation
   */
  async getOrSet<T>(options: CacheAsideOptions<T>): Promise<T> {
    const cacheKey = this.buildKey(options.key, options.tenantSpecific);

    // Try to get from cache
    const cached = await this.redisService.get<T>(cacheKey);
    if (cached !== null) {
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
      return cached;
    }

    // Cache miss - fetch data
    this.logger.debug(`Cache miss for key: ${cacheKey}`);
    const data = await options.fetchFn();

    // Store in cache
    let tenantId: string | undefined;
    if (options.tenantSpecific) {
      try {
        tenantId = this.tenantContext.getTenantId();
      } catch (error) {
        // No tenant context available
      }
    }

    const metadata = {
      tenantId,
      version: options.version,
    };

    await this.redisService.set(cacheKey, data, options.ttl, metadata);

    return data;
  }

  /**
   * Invalidate cache entries
   */
  async invalidate(patterns: string | string[]): Promise<number> {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    let totalDeleted = 0;

    for (const pattern of patternsArray) {
      const fullPattern = this.buildKey(pattern, true);
      const deleted = await this.redisService.deletePattern(fullPattern);
      totalDeleted += deleted;
    }

    this.logger.log(`Invalidated ${totalDeleted} cache entries`);
    return totalDeleted;
  }

  /**
   * Generate cache key for quote calculations
   */
  generateQuoteKey(fileHash: string, configuration: QuoteConfiguration): string {
    const configHash = this.hashObject(configuration);
    return this.buildKey(`quote:${fileHash}:${configHash}`, true);
  }

  /**
   * Cache pricing rules with TTL
   */
  async cachePricingRules(
    service: string,
    material: string,
    rules: PricingRule[],
    ttl?: number,
  ): Promise<void> {
    const key = this.buildKey(`pricing:rules:${service}:${material}`, true);
    await this.redisService.set(key, rules, ttl ?? this.pricingRulesTtl);
  }

  /**
   * Get cached pricing rules
   */
  async getCachedPricingRules(service: string, material: string): Promise<PricingRule[] | null> {
    const key = this.buildKey(`pricing:rules:${service}:${material}`, true);
    return await this.redisService.get<PricingRule[]>(key);
  }

  /**
   * Cache tenant configuration
   */
  async cacheTenantConfig(config: Tenant, ttl?: number): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    const key = `tenant:config:${tenantId}`;
    await this.redisService.set(key, config, ttl ?? this.tenantConfigTtl);
  }

  /**
   * Get cached tenant configuration
   */
  async getCachedTenantConfig(): Promise<Tenant | null> {
    const tenantId = this.tenantContext.getTenantId();
    const key = `tenant:config:${tenantId}`;
    return await this.redisService.get<Tenant>(key);
  }

  /**
   * Invalidate tenant configuration cache
   */
  async invalidateTenantConfig(): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    await this.redisService.delete(`tenant:config:${tenantId}`);
  }

  /**
   * Cache user session data
   */
  async cacheUserSession(
    userId: string,
    sessionData: UserSessionData,
    ttl?: number,
  ): Promise<void> {
    const key = this.buildKey(`session:${userId}`, true);
    await this.redisService.set(key, sessionData, ttl ?? this.userSessionTtl);
  }

  /**
   * Get cached user session
   */
  async getCachedUserSession(userId: string): Promise<UserSessionData | null> {
    const key = this.buildKey(`session:${userId}`, true);
    return await this.redisService.get<UserSessionData>(key);
  }

  /**
   * Extend user session TTL
   */
  async extendUserSession(userId: string, ttl?: number): Promise<boolean> {
    const key = this.buildKey(`session:${userId}`, true);
    return await this.redisService.expire(key, ttl ?? this.userSessionTtl);
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    return await this.redisService.get<T>(key);
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number, metadata?: CacheMetadata): Promise<void> {
    await this.redisService.set(key, value, ttl, metadata);
  }

  /**
   * Cache quote calculation result
   */
  async cacheQuoteCalculation(
    fileHash: string,
    configuration: QuoteConfiguration,
    result: QuoteCalculationResult,
    ttl?: number,
  ): Promise<void> {
    const key = this.generateQuoteKey(fileHash, configuration);
    await this.redisService.set(key, result, ttl ?? this.quoteCalculationTtl);
  }

  /**
   * Get cached quote calculation
   */
  async getCachedQuoteCalculation(
    fileHash: string,
    configuration: QuoteConfiguration,
  ): Promise<QuoteCalculationResult | null> {
    const key = this.generateQuoteKey(fileHash, configuration);
    return await this.redisService.get<QuoteCalculationResult>(key);
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUpCache(): Promise<void> {
    this.logger.log('Starting cache warm-up');

    try {
      // This method can be extended to pre-load frequently accessed data
      // For now, it's a placeholder for future implementation

      this.logger.log('Cache warm-up completed');
    } catch (error) {
      this.logger.error('Error during cache warm-up', error as Error);
    }
  }

  /**
   * Get cache health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    connected: boolean;
    statistics: CacheStatistics;
    uptime: number;
  }> {
    const isConnected = this.redisService.isConnected();
    const statistics = this.redisService.getStatistics();

    return {
      status: isConnected ? 'healthy' : 'unhealthy',
      connected: isConnected,
      statistics,
      uptime: Date.now() - statistics.lastReset.getTime(),
    };
  }

  /**
   * Build cache key with optional tenant isolation
   */
  private buildKey(key: string, tenantSpecific = false): string {
    if (tenantSpecific) {
      try {
        const tenantId = this.tenantContext.getTenantId();
        if (tenantId) {
          return `tenant:${tenantId}:${key}`;
        }
      } catch (error) {
        // No tenant context available, use key without tenant prefix
        this.logger.debug('No tenant context available for key building');
      }
    }
    return key;
  }

  /**
   * Generate hash for object (for cache key generation)
   */
  private hashObject(obj: Record<string, unknown>): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('md5').update(str).digest('hex').substring(0, 8);
  }
}
