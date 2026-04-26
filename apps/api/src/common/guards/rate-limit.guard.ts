import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitMiddleware } from '../middleware/rate-limit.middleware';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  type: 'global' | 'api' | 'auth' | 'upload' | 'guest';
  skipIf?: (context: ExecutionContext) => boolean;
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitMiddleware: RateLimitMiddleware,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getHandler());

    if (!options) {
      return true; // No rate limit specified
    }

    // Check skip condition
    if (options.skipIf && options.skipIf(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return new Promise((resolve, reject) => {
      const rateLimiter = this.rateLimitMiddleware.createRateLimiter(options.type);

      rateLimiter(request, response, (error?: unknown) => {
        if (error) {
          reject(error as Error);
        } else {
          resolve(true);
        }
      });
    });
  }
}
