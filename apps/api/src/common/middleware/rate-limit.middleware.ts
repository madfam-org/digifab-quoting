import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { RateLimitExceededException } from '../exceptions/business.exceptions';
import { RedisService } from '../../modules/redis/redis.service';
import { LoggerService } from '../logger/logger.service';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
  remaining: number;
}

interface RateLimitStats {
  config?: RateLimitConfig;
  status?: string;
  error?: string;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly configs = new Map<string, RateLimitConfig>();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.setupDefaultConfigs();
  }

  private setupDefaultConfigs() {
    // Global rate limit
    this.configs.set('global', {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: this.configService.get('RATE_LIMIT_GLOBAL', 1000),
      keyGenerator: (req) => this.getClientIdentifier(req),
    });

    // API rate limit (more restrictive)
    this.configs.set('api', {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: this.configService.get('RATE_LIMIT_API', 100),
      keyGenerator: (req) => `api:${this.getClientIdentifier(req)}`,
    });

    // Auth endpoints (very restrictive)
    this.configs.set('auth', {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: this.configService.get('RATE_LIMIT_AUTH', 5),
      keyGenerator: (req) => `auth:${this.getClientIdentifier(req)}`,
    });

    // File upload (moderate)
    this.configs.set('upload', {
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxRequests: this.configService.get('RATE_LIMIT_UPLOAD', 10),
      keyGenerator: (req) => `upload:${this.getClientIdentifier(req)}`,
    });

    // Guest endpoints (moderate)
    this.configs.set('guest', {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: this.configService.get('RATE_LIMIT_GUEST', 50),
      keyGenerator: (req) => `guest:${this.getClientIdentifier(req)}`,
    });
  }

  createRateLimiter(configName: string = 'global') {
    return async (req: Request, res: Response, next: NextFunction) => {
      const config = this.configs.get(configName);
      if (!config) {
        this.logger.warn(`Rate limit config '${configName}' not found`);
        return next();
      }

      try {
        if (!config.keyGenerator) {
          throw new Error(`Key generator not found for config '${configName}'`);
        }
        const key = config.keyGenerator(req);
        const rateLimitInfo = await this.checkRateLimit(key, config);

        // Set rate limit headers
        res.setHeader('X-Rate-Limit-Limit', config.maxRequests);
        res.setHeader('X-Rate-Limit-Remaining', Math.max(0, rateLimitInfo.remaining));
        res.setHeader('X-Rate-Limit-Reset', rateLimitInfo.resetTime);

        if (rateLimitInfo.remaining < 0) {
          // Rate limit exceeded
          const retryAfter = Math.ceil((rateLimitInfo.resetTime - Date.now()) / 1000);
          res.setHeader('Retry-After', retryAfter);

          this.logger.warn(`Rate limit exceeded for ${key}`, {
            config: configName,
            count: rateLimitInfo.count,
            limit: config.maxRequests,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
          });

          if (config.onLimitReached) {
            config.onLimitReached(req, res);
          }

          throw new RateLimitExceededException(
            config.maxRequests,
            Math.floor(config.windowMs / 1000),
            retryAfter,
          );
        }

        next();
      } catch (error) {
        if (error instanceof RateLimitExceededException) {
          throw error;
        }

        this.logger.error('Rate limiting error', error as Error);
        next(); // Continue on Redis errors
      }
    };
  }

  async checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
    const now = Date.now();
    const resetTime = now + config.windowMs;

    try {
      // Get current count
      const currentCountStr = await this.redisService.get<string>(key);
      let count = currentCountStr ? parseInt(currentCountStr, 10) : 0;

      // Check if we need to reset the window
      const windowKey = `${key}:window`;
      const windowStart = await this.redisService.get<string>(windowKey);

      if (!windowStart || now - parseInt(windowStart, 10) >= config.windowMs) {
        // Reset the window
        count = 0;
        await this.redisService.set(windowKey, now.toString(), Math.ceil(config.windowMs / 1000));
      }

      // Increment count
      count += 1;
      await this.redisService.set(key, count.toString(), Math.ceil(config.windowMs / 1000));

      return {
        count,
        resetTime,
        remaining: config.maxRequests - count,
      };
    } catch (error) {
      // Fallback in case Redis is not available
      this.logger.error('Rate limiting error, allowing request', error as Error);
      return {
        count: 0,
        resetTime,
        remaining: config.maxRequests,
      };
    }
  }

  private getClientIdentifier(req: Request): string {
    // Try to get user ID first (for authenticated requests)
    interface RequestWithUser extends Request {
      user?: { id: string };
    }
    const userId = (req as RequestWithUser).user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // Try to get tenant ID
    const tenantId = req.headers['x-tenant-id'] as string;
    if (tenantId) {
      return `tenant:${tenantId}`;
    }

    // Fall back to IP address
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection.remoteAddress;
    return `ip:${ip}`;
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Apply global rate limiting by default
    return this.createRateLimiter('global')(req, res, next);
  }

  // Static methods for easy use in controllers
  static global() {
    return function (_target: object, _propertyKey: string, _descriptor: PropertyDescriptor) {
      // This would be implemented as a decorator
    };
  }

  static api() {
    return function (_target: object, _propertyKey: string, _descriptor: PropertyDescriptor) {
      // This would be implemented as a decorator
    };
  }

  static auth() {
    return function (_target: object, _propertyKey: string, _descriptor: PropertyDescriptor) {
      // This would be implemented as a decorator
    };
  }

  async getStats(): Promise<Record<string, RateLimitStats>> {
    const stats: Record<string, RateLimitStats> = {};

    for (const [configName] of this.configs) {
      try {
        // For now, return basic config info since we can't easily count active keys
        stats[configName] = {
          config: this.configs.get(configName),
          status: 'active',
        };
      } catch (error) {
        this.logger.error(`Error getting stats for ${configName}`, error as Error);
        stats[configName] = { error: 'Failed to get stats' };
      }
    }

    return stats;
  }
}
