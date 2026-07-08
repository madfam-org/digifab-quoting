import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { LoggerService } from '@/common/logger/logger.service';
import { CacheEntry, CacheKeyOptions, CacheStatistics } from './interfaces/cache-options.interface';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  // private readonly defaultTTL = 3600; // 1 hour default - unused for now
  private statistics: CacheStatistics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
    lastReset: new Date(),
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      this.logger.warn('Redis URL not configured, Redis will not be available');
      return;
    }
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error', error);
      this.statistics.errors++;
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    try {
      await this.client.connect();
    } catch (error) {
      this.logger.error(
        'Failed to connect to Redis',
        error instanceof Error ? error : new Error(String(error)),
      );
      // Continue without Redis - graceful degradation
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  /**
   * Generate a cache key with tenant isolation
   */
  generateKey(options: CacheKeyOptions): string {
    const parts = [options.prefix];

    if (options.tenantId) {
      parts.push(`tenant:${options.tenantId}`);
    }

    if (Array.isArray(options.identifier)) {
      parts.push(...options.identifier);
    } else {
      parts.push(options.identifier);
    }

    return parts.join(':');
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }
    try {
      const value = await this.client.get(key);

      if (!value) {
        this.statistics.misses++;
        this.updateHitRate();
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(value);

      // Check if expired
      if (entry.metadata.expiresAt && entry.metadata.expiresAt < Date.now()) {
        await this.delete(key);
        this.statistics.misses++;
        this.updateHitRate();
        return null;
      }

      this.statistics.hits++;
      this.updateHitRate();
      return entry.data;
    } catch (error) {
      this.logger.error(
        `Error getting cache key ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    key: string,
    value: T,
    ttl?: number,
    metadata?: Partial<CacheEntry['metadata']>,
  ): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const entry: CacheEntry<T> = {
        data: value,
        metadata: {
          createdAt: Date.now(),
          expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
          ...metadata,
        },
      };

      const serialized = JSON.stringify(entry);

      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      this.statistics.sets++;
      return true;
    } catch (error) {
      this.logger.error(
        `Error setting cache key ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string | string[]): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      const keys = Array.isArray(key) ? key : [key];
      const result = await this.client.del(...keys);
      this.statistics.deletes += result;
      return result;
    } catch (error) {
      this.logger.error(
        `Error deleting cache key(s) ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;

      return await this.delete(keys);
    } catch (error) {
      this.logger.error(
        `Error deleting cache pattern ${pattern}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Error checking cache key existence ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) {
      return -1;
    }
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(
        `Error getting TTL for cache key ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return -1;
    }
  }

  /**
   * Extend TTL for a key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Error setting expiry for cache key ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  async flushAll(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.flushall();
      this.logger.warn('All cache flushed');
    } catch (error) {
      this.logger.error(
        'Error flushing cache',
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
    }
  }

  /**
   * Flush cache for specific tenant
   */
  async flushTenant(tenantId: string): Promise<number> {
    return await this.deletePattern(`*:tenant:${tenantId}:*`);
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset cache statistics
   */
  resetStatistics(): void {
    this.statistics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Execute Redis command directly (for advanced use)
   */
  async execute<T = unknown>(
    command: string,
    ...args: Array<string | number | Buffer>
  ): Promise<T> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    try {
      return (await this.client.call(command, ...args)) as T;
    } catch (error) {
      this.logger.error(
        `Error executing Redis command ${command}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      throw error;
    }
  }

  /**
   * Get the Redis client instance
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return !!this.client && this.client.status === 'ready';
  }

  private updateHitRate(): void {
    const total = this.statistics.hits + this.statistics.misses;
    this.statistics.hitRate = total > 0 ? (this.statistics.hits / total) * 100 : 0;
  }

  // ===== SET OPERATIONS =====

  /**
   * Add member(s) to a set
   */
  async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      this.logger.error(
        `Error adding to set ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Get all members of a set
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    try {
      return await this.client.smembers(key);
    } catch (error) {
      this.logger.error(
        `Error getting set members ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return [];
    }
  }

  /**
   * Get count of members in a set
   */
  async scard(key: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.scard(key);
    } catch (error) {
      this.logger.error(
        `Error getting set count ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  // ===== COUNTER OPERATIONS =====

  /**
   * Increment counter by 1
   */
  async incr(key: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.error(
        `Error incrementing counter ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Increment counter by specific amount
   */
  async incrby(key: string, amount: number): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.incrby(key, amount);
    } catch (error) {
      this.logger.error(
        `Error incrementing counter ${key} by ${amount}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  // ===== LEGACY METHOD ALIASES =====

  /**
   * Legacy setex method - use set(key, value, ttl) instead
   * @deprecated
   */
  async setex<T>(key: string, ttl: number, value: T): Promise<boolean> {
    return this.set(key, value, ttl);
  }

  /**
   * Legacy del method - use delete(key) instead
   * @deprecated
   */
  async del(key: string | string[]): Promise<number> {
    return this.delete(key);
  }

  /**
   * Legacy ping method - use isConnected() instead
   * @deprecated
   */
  async ping(): Promise<string> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.ping();
    } catch (error) {
      throw new Error('Redis ping failed');
    }
  }

  /**
   * Hash increment by amount
   */
  async hincrby(key: string, field: string, amount: number): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.hincrby(key, field, amount);
    } catch (error) {
      this.statistics.errors++;
      throw error;
    }
  }

  /**
   * List push (left)
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.lpush(key, ...values);
    } catch (error) {
      this.statistics.errors++;
      throw error;
    }
  }

  /**
   * List trim
   */
  async ltrim(key: string, start: number, stop: number): Promise<string> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.client.ltrim(key, start, stop);
    } catch (error) {
      this.statistics.errors++;
      throw error;
    }
  }

  // ===== SORTED SET OPERATIONS =====

  /**
   * Add member to sorted set
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.zadd(key, score, member);
    } catch (error) {
      this.logger.error(
        `Error adding to sorted set ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Get members from sorted set by score range
   */
  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    try {
      return await this.client.zrangebyscore(key, min, max);
    } catch (error) {
      this.logger.error(
        `Error getting sorted set range ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return [];
    }
  }

  // ===== HASH OPERATIONS =====

  /**
   * Get all hash fields and values
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) {
      return {};
    }
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      this.logger.error(
        `Error getting hash ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return {};
    }
  }

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.hset(key, field, value);
    } catch (error) {
      this.logger.error(
        `Error setting hash field ${key}.${field}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Get hash field
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      this.logger.error(
        `Error getting hash field ${key}.${field}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return null;
    }
  }

  // ===== LIST OPERATIONS =====

  /**
   * Get list length
   */
  async llen(key: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.llen(key);
    } catch (error) {
      this.logger.error(
        `Error getting list length ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return 0;
    }
  }

  /**
   * Get list range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    try {
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      this.logger.error(
        `Error getting list range ${key}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return [];
    }
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      return [];
    }
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error(
        `Error getting keys for pattern ${pattern}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      this.statistics.errors++;
      return [];
    }
  }
}
