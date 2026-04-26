import { SetMetadata } from '@nestjs/common';
import { CacheOptions, CacheContext } from '../interfaces/cache-options.interface';

export const CACHE_KEY_METADATA = 'cache_key_metadata';
export const CACHE_OPTIONS_METADATA = 'cache_options_metadata';
export const CACHE_INVALIDATE_METADATA = 'cache_invalidate_metadata';

// Type for async methods that can be cached
export type AsyncMethod<TArgs extends unknown[] = unknown[], TReturn = unknown> = (
  ...args: TArgs
) => Promise<TReturn>;

// Type for the decorator target
export interface DecoratorTarget {
  constructor: {
    name: string;
  };
}

/**
 * Decorator to cache method results
 * @param options Cache options
 */
export const Cacheable = (options?: CacheOptions): MethodDecorator => {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor | void => {
    SetMetadata(CACHE_OPTIONS_METADATA, options || {})(target, propertyKey, descriptor);

    const originalMethod = descriptor.value;

    if (!originalMethod) return descriptor;

    descriptor.value = async function (this: CacheContext, ...args: unknown[]) {
      const cacheService = this.cacheService || this.cache;

      if (!cacheService) {
        // No cache service available, execute method normally
        return originalMethod.apply(this, args);
      }

      // Generate cache key
      const keyPrefix = options?.prefix || `${target.constructor.name}:${String(propertyKey)}`;
      const keyGenerator = options?.keyGenerator || defaultKeyGenerator;
      const cacheKey = keyGenerator(keyPrefix, ...(args as CacheKeyArg[]));

      // Check condition
      if (options?.condition && !(options.condition as (...args: unknown[]) => boolean)(...args)) {
        return originalMethod.apply(this, args);
      }

      // Apply cache-aside pattern
      return await cacheService.getOrSet({
        key: cacheKey,
        ttl: options?.ttl,
        fetchFn: () => originalMethod.apply(this, args),
        tenantSpecific: true,
      });
    } as AsyncMethod;

    return descriptor;
  };
};

/**
 * Decorator to invalidate cache
 * @param patterns Cache key patterns to invalidate
 */
export const CacheInvalidate = (patterns: string | string[]): MethodDecorator => {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor | void => {
    SetMetadata(CACHE_INVALIDATE_METADATA, patterns)(target, propertyKey, descriptor);

    const originalMethod = descriptor.value;

    if (!originalMethod) return descriptor;

    descriptor.value = async function (this: CacheContext, ...args: unknown[]) {
      const result = await originalMethod.apply(this, args);

      const cacheService = this.cacheService || this.cache;
      if (cacheService) {
        // Invalidate cache after successful execution
        await cacheService.invalidate(patterns);
      }

      return result;
    } as AsyncMethod;

    return descriptor;
  };
};

/**
 * Decorator to put result in cache
 * @param options Cache options
 */
export const CachePut = (options?: CacheOptions): MethodDecorator => {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor | void => {
    const originalMethod = descriptor.value;

    if (!originalMethod) return descriptor;

    descriptor.value = async function (this: CacheContext, ...args: unknown[]) {
      const result = await originalMethod.apply(this, args);

      const cacheService = this.cacheService || this.cache;
      if (cacheService && result !== null && result !== undefined) {
        const keyPrefix = options?.prefix || `${target.constructor.name}:${String(propertyKey)}`;
        const keyGenerator = options?.keyGenerator || defaultKeyGenerator;
        const cacheKey = keyGenerator(keyPrefix, ...(args as CacheKeyArg[]));

        if ('redisService' in cacheService && cacheService.redisService) {
          await cacheService.redisService.set(cacheKey, result, options?.ttl, {
            tenantId: this.tenantContext?.getTenantId(),
          });
        }
      }

      return result;
    } as AsyncMethod;

    return descriptor;
  };
};

/**
 * Decorator to evict cache
 * @param patterns Cache key patterns to evict
 */
export const CacheEvict = (patterns: string | string[]): MethodDecorator => {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor | void => {
    const originalMethod = descriptor.value;

    if (!originalMethod) return descriptor;

    descriptor.value = async function (this: CacheContext, ...args: unknown[]) {
      const cacheService = this.cacheService || this.cache;
      if (cacheService) {
        // Evict cache before execution
        await cacheService.invalidate(patterns);
      }

      return originalMethod.apply(this, args);
    } as AsyncMethod;

    return descriptor;
  };
};

/**
 * Type for cache key arguments
 */
export type CacheKeyArg =
  | string
  | number
  | boolean
  | Date
  | { [key: string]: CacheKeyArg }
  | CacheKeyArg[];

/**
 * Default key generator function
 */
function defaultKeyGenerator(prefix: string, ...args: CacheKeyArg[]): string {
  const argKey = args
    .map((arg) => {
      if (arg instanceof Date) {
        return arg.toISOString();
      }
      if (typeof arg === 'object' && arg !== null) {
        if (Array.isArray(arg)) {
          return JSON.stringify(arg);
        }
        const sortedObj = Object.keys(arg as Record<string, CacheKeyArg>)
          .sort()
          .reduce(
            (result, key) => {
              result[key] = (arg as Record<string, CacheKeyArg>)[key];
              return result;
            },
            {} as Record<string, CacheKeyArg>,
          );
        return JSON.stringify(sortedObj);
      }
      return String(arg);
    })
    .join(':');

  return `${prefix}:${argKey}`;
}
