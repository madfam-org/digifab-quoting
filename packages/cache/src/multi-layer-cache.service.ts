import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface CacheLayerStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  avgLatency: number;
  errors: number;
}

export interface CacheOptions {
  ttl?: number;
  layer?: 'all' | 'l1' | 'l2' | 'l3';
  skipL1?: boolean;
  skipL2?: boolean;
  skipL3?: boolean;
  compress?: boolean;
  encrypt?: boolean;
  tags?: string[];
}

export interface CacheMetrics {
  l1: CacheLayerStats;
  l2: CacheLayerStats;
  l3: CacheLayerStats;
  overall: {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    cacheSize: number;
  };
}

@Injectable()
export class MultiLayerCacheService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MultiLayerCacheService.name);

  // L1: In-memory LRU cache (microseconds)
  private l1Cache: LRUCache<string, any>;

  // L2: Local Redis instance (milliseconds)
  private l2Cache: Redis | null = null;

  // L3: Redis cluster/sentinel (tens of milliseconds)
  private l3Cache: Redis | null = null;

  // Metrics for each layer
  private metrics: CacheMetrics = {
    l1: this.initLayerStats(),
    l2: this.initLayerStats(),
    l3: this.initLayerStats(),
    overall: {
      totalHits: 0,
      totalMisses: 0,
      overallHitRate: 0,
      cacheSize: 0,
    },
  };

  // Cache warming registry
  private warmingRegistry = new Map<string, () => Promise<any>>();

  // Predictive prefetch patterns
  private accessPatterns = new Map<string, string[]>();

  constructor() {
    super();

    // Initialize L1 cache
    this.l1Cache = new LRUCache({
      max: 1000, // Maximum number of items
      ttl: 60000, // 1 minute default TTL
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      sizeCalculation: (value) => {
        // Estimate size for memory management
        return JSON.stringify(value).length;
      },
      maxSize: 50 * 1024 * 1024, // 50MB max size
      dispose: (value, key) => {
        this.logger.debug(`L1 cache evicted: ${key}`);
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.initializeRedisLayers();
    this.startMetricsCollection();
    this.setupCacheWarming();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.l2Cache) await this.l2Cache.quit();
    if (this.l3Cache) await this.l3Cache.quit();
  }

  private async initializeRedisLayers(): Promise<void> {
    // L2: Local Redis with optimistic settings
    try {
      this.l2Cache = new Redis({
        host: process.env.REDIS_L2_HOST || 'localhost',
        port: parseInt(process.env.REDIS_L2_PORT || '6379'),
        maxRetriesPerRequest: 1, // Fast fail for local
        connectTimeout: 1000,
        commandTimeout: 100,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      await this.l2Cache.connect();
      this.logger.log('L2 cache (local Redis) connected');

      this.l2Cache.on('error', (error) => {
        this.logger.warn('L2 cache error', error);
        this.metrics.l2.errors++;
      });
    } catch (error) {
      this.logger.warn('L2 cache initialization failed, continuing without it', error);
      this.l2Cache = null;
    }

    // L3: Redis Sentinel/Cluster for high availability
    try {
      if (process.env.REDIS_SENTINELS) {
        // Sentinel configuration
        const sentinels = process.env.REDIS_SENTINELS.split(',').map((s) => {
          const [host, port] = s.split(':');
          return { host, port: parseInt(port) };
        });

        this.l3Cache = new Redis({
          sentinels,
          name: process.env.REDIS_MASTER_NAME || 'mymaster',
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          enableOfflineQueue: true,
          lazyConnect: true,
        });
      } else {
        // Regular Redis with higher reliability settings
        this.l3Cache = new Redis({
          host: process.env.REDIS_L3_HOST || process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_L3_PORT || process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: 5,
          retryStrategy: (times) => Math.min(times * 100, 3000),
          enableOfflineQueue: true,
          lazyConnect: true,
        });
      }

      await this.l3Cache.connect();
      this.logger.log('L3 cache (Redis cluster/sentinel) connected');

      this.l3Cache.on('error', (error) => {
        this.logger.error('L3 cache error', error);
        this.metrics.l3.errors++;
      });
    } catch (error) {
      this.logger.error('L3 cache initialization failed', error);
      this.l3Cache = null;
    }
  }

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const startTime = Date.now();

    // L1: In-memory cache (unless skipped)
    if (!options.skipL1) {
      const l1Value = this.l1Cache.get(key);
      if (l1Value !== undefined) {
        this.recordHit('l1', Date.now() - startTime);
        this.emit('cache.hit', { layer: 'l1', key });
        this.trackAccessPattern(key);
        return l1Value as T;
      }
    }

    // L2: Local Redis (unless skipped)
    if (!options.skipL2 && this.l2Cache) {
      try {
        const l2StartTime = Date.now();
        const l2Value = await this.l2Cache.get(key);

        if (l2Value) {
          const parsed = JSON.parse(l2Value);

          // Populate L1
          if (!options.skipL1) {
            this.l1Cache.set(key, parsed);
          }

          this.recordHit('l2', Date.now() - l2StartTime);
          this.emit('cache.hit', { layer: 'l2', key });
          this.trackAccessPattern(key);
          return parsed as T;
        }
      } catch (error) {
        this.logger.debug(`L2 cache get failed for ${key}`, error);
        this.metrics.l2.errors++;
      }
    }

    // L3: Redis cluster (unless skipped)
    if (!options.skipL3 && this.l3Cache) {
      try {
        const l3StartTime = Date.now();
        const l3Value = await this.l3Cache.get(key);

        if (l3Value) {
          const parsed = JSON.parse(l3Value);

          // Populate lower layers asynchronously
          this.populateLowerLayers(key, parsed, options);

          this.recordHit('l3', Date.now() - l3StartTime);
          this.emit('cache.hit', { layer: 'l3', key });
          this.trackAccessPattern(key);
          return parsed as T;
        }
      } catch (error) {
        this.logger.error(`L3 cache get failed for ${key}`, error);
        this.metrics.l3.errors++;
      }
    }

    // Cache miss
    this.recordMiss();
    this.emit('cache.miss', { key });

    // Trigger predictive prefetch for related keys
    this.prefetchRelated(key);

    return null;
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || 3600; // Default 1 hour
    const serialized = JSON.stringify(value);

    const promises: Promise<any>[] = [];

    // Write to L1 (unless skipped)
    if (!options.skipL1) {
      this.l1Cache.set(key, value, { ttl: ttl * 1000 }); // Convert to ms
      this.metrics.l1.sets++;
    }

    // Write to L2 (unless skipped)
    if (!options.skipL2 && this.l2Cache) {
      promises.push(
        this.l2Cache.setex(key, ttl, serialized).catch((error) => {
          this.logger.debug(`L2 cache set failed for ${key}`, error);
          this.metrics.l2.errors++;
        }),
      );
    }

    // Write to L3 (unless skipped)
    if (!options.skipL3 && this.l3Cache) {
      promises.push(
        this.l3Cache.setex(key, ttl, serialized).catch((error) => {
          this.logger.error(`L3 cache set failed for ${key}`, error);
          this.metrics.l3.errors++;
        }),
      );
    }

    // Handle tags for cache invalidation
    if (options.tags && options.tags.length > 0) {
      promises.push(this.tagKeys(key, options.tags));
    }

    await Promise.allSettled(promises);
    this.emit('cache.set', { key, ttl });
  }

  async delete(pattern: string): Promise<number> {
    let deletedCount = 0;

    // Delete from L1
    const l1Keys = Array.from(this.l1Cache.keys()).filter((k) =>
      pattern.includes('*') ? this.matchPattern(k, pattern) : k === pattern,
    );

    for (const key of l1Keys) {
      this.l1Cache.delete(key);
      deletedCount++;
    }

    // Delete from L2
    if (this.l2Cache) {
      try {
        const l2Keys = await this.l2Cache.keys(pattern);
        if (l2Keys.length > 0) {
          deletedCount += await this.l2Cache.del(...l2Keys);
        }
      } catch (error) {
        this.logger.debug('L2 cache delete failed', error);
      }
    }

    // Delete from L3
    if (this.l3Cache) {
      try {
        const l3Keys = await this.l3Cache.keys(pattern);
        if (l3Keys.length > 0) {
          deletedCount += await this.l3Cache.del(...l3Keys);
        }
      } catch (error) {
        this.logger.error('L3 cache delete failed', error);
      }
    }

    this.emit('cache.delete', { pattern, count: deletedCount });
    return deletedCount;
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let invalidated = 0;

    for (const tag of tags) {
      if (this.l3Cache) {
        try {
          const taggedKeys = await this.l3Cache.smembers(`tag:${tag}`);
          for (const key of taggedKeys) {
            await this.delete(key);
            invalidated++;
          }
          await this.l3Cache.del(`tag:${tag}`);
        } catch (error) {
          this.logger.error(`Failed to invalidate tag ${tag}`, error);
        }
      }
    }

    return invalidated;
  }

  // Cache warming
  registerWarmer(key: string, loader: () => Promise<any>): void {
    this.warmingRegistry.set(key, loader);
  }

  async warmCache(keys?: string[]): Promise<void> {
    const keysToWarm = keys || Array.from(this.warmingRegistry.keys());

    for (const key of keysToWarm) {
      const loader = this.warmingRegistry.get(key);
      if (loader) {
        try {
          const data = await loader();
          await this.set(key, data, { ttl: 86400 }); // 24 hours
          this.logger.log(`Warmed cache: ${key}`);
        } catch (error) {
          this.logger.error(`Failed to warm cache: ${key}`, error);
        }
      }
    }
  }

  // Predictive prefetching
  private async prefetchRelated(key: string): Promise<void> {
    const patterns = this.accessPatterns.get(key);
    if (!patterns || patterns.length === 0) return;

    // Prefetch top related keys asynchronously
    for (const relatedKey of patterns.slice(0, 3)) {
      // Check if not already in cache
      if (!this.l1Cache.has(relatedKey)) {
        this.emit('cache.prefetch', { key: relatedKey, trigger: key });
      }
    }
  }

  private trackAccessPattern(key: string): void {
    // Simple pattern tracking - in production, use ML models
    const prefix = key.split(':')[0];
    const related = this.accessPatterns.get(prefix) || [];

    if (!related.includes(key)) {
      related.push(key);
      if (related.length > 10) {
        related.shift(); // Keep only last 10
      }
      this.accessPatterns.set(prefix, related);
    }
  }

  // Helper methods
  private async populateLowerLayers(key: string, value: any, options: CacheOptions): Promise<void> {
    const promises: Promise<any>[] = [];

    if (!options.skipL1) {
      this.l1Cache.set(key, value);
    }

    if (!options.skipL2 && this.l2Cache) {
      promises.push(
        this.l2Cache.setex(key, options.ttl || 3600, JSON.stringify(value)).catch(() => {}), // Ignore errors for async population
      );
    }

    await Promise.allSettled(promises);
  }

  private async tagKeys(key: string, tags: string[]): Promise<void> {
    if (!this.l3Cache) return;

    const promises = tags.map((tag) =>
      this.l3Cache!.sadd(`tag:${tag}`, key).catch((error) => {
        this.logger.debug(`Failed to tag key ${key} with ${tag}`, error);
      }),
    );

    await Promise.allSettled(promises);
  }

  private matchPattern(key: string, pattern: string): boolean {
    const regex = pattern.replace(/\*/g, '.*');
    return new RegExp(`^${regex}$`).test(key);
  }

  private recordHit(layer: 'l1' | 'l2' | 'l3', latency: number): void {
    const stats = this.metrics[layer];
    stats.hits++;
    stats.avgLatency = (stats.avgLatency * (stats.hits - 1) + latency) / stats.hits;
    stats.hitRate = stats.hits / (stats.hits + stats.misses);

    this.metrics.overall.totalHits++;
    this.updateOverallMetrics();
  }

  private recordMiss(): void {
    this.metrics.l1.misses++;
    this.metrics.l2.misses++;
    this.metrics.l3.misses++;
    this.metrics.overall.totalMisses++;
    this.updateOverallMetrics();
  }

  private updateOverallMetrics(): void {
    const total = this.metrics.overall.totalHits + this.metrics.overall.totalMisses;
    this.metrics.overall.overallHitRate = total > 0 ? this.metrics.overall.totalHits / total : 0;

    this.metrics.overall.cacheSize = this.l1Cache.size;
  }

  private initLayerStats(): CacheLayerStats {
    return {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      avgLatency: 0,
      errors: 0,
    };
  }

  private startMetricsCollection(): void {
    // Export metrics every 60 seconds
    setInterval(() => {
      this.emit('metrics', this.getMetrics());

      // Log if hit rate drops below threshold
      if (this.metrics.overall.overallHitRate < 0.7 && this.metrics.overall.totalHits > 100) {
        this.logger.warn(
          `Cache hit rate below threshold: ${(this.metrics.overall.overallHitRate * 100).toFixed(2)}%`,
        );
      }
    }, 60000);
  }

  private setupCacheWarming(): void {
    // Warm critical caches on startup
    setTimeout(() => {
      this.warmCache(['pricing:matrix', 'materials:catalog', 'processes:config']).catch((error) =>
        this.logger.error('Cache warming failed', error),
      );
    }, 5000);

    // Schedule periodic cache warming
    setInterval(() => {
      this.warmCache().catch((error) => this.logger.error('Periodic cache warming failed', error));
    }, 3600000); // Every hour
  }

  // Public metrics access
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      l1: this.initLayerStats(),
      l2: this.initLayerStats(),
      l3: this.initLayerStats(),
      overall: {
        totalHits: 0,
        totalMisses: 0,
        overallHitRate: 0,
        cacheSize: 0,
      },
    };
  }

  // Cache health check
  async healthCheck(): Promise<{
    l1: boolean;
    l2: boolean;
    l3: boolean;
    healthy: boolean;
  }> {
    const health = {
      l1: true, // L1 is always available
      l2: false,
      l3: false,
      healthy: false,
    };

    // Test L2 — ping failures leave health.l2 = false (default).
    if (this.l2Cache) {
      try {
        await this.l2Cache.ping();
        health.l2 = true;
      } catch {
        // Intentional: a failed ping means unhealthy, which is the
        // initialised default. No state change, no log noise.
      }
    }

    // Test L3 — same fail-quiet semantics as L2.
    if (this.l3Cache) {
      try {
        await this.l3Cache.ping();
        health.l3 = true;
      } catch {
        // Intentional: see L2 comment above.
      }
    }

    // Consider healthy if at least L1 and one Redis layer work
    health.healthy = health.l1 && (health.l2 || health.l3);

    return health;
  }
}
