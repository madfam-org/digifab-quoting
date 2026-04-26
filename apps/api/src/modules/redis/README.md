# Redis Caching Module

This module provides comprehensive Redis caching functionality for the Cotiza Studio Quoting MVP, including decorators, services, and monitoring capabilities.

## Features

- **Decorators for easy caching**: `@Cacheable`, `@CacheInvalidate`, `@CachePut`, `@CacheEvict`
- **Cache-aside pattern implementation**
- **Tenant-isolated caching**
- **Quote-specific caching with file hash support**
- **Session caching for performance**
- **Cache statistics and monitoring**
- **Batch operations support**
- **Graceful degradation when Redis is unavailable**

## Architecture

### Core Services

1. **RedisService**: Low-level Redis operations and connection management
2. **CacheService**: High-level caching patterns and tenant isolation
3. **QuoteCacheService**: Specialized caching for quote calculations
4. **CacheInterceptor**: HTTP response caching for controllers

### Key Components

```
redis/
├── redis.service.ts          # Core Redis operations
├── cache.service.ts          # Cache patterns and tenant isolation
├── quote-cache.service.ts    # Quote-specific caching
├── decorators/
│   └── cache.decorator.ts    # Caching decorators
├── interceptors/
│   └── cache.interceptor.ts  # HTTP caching interceptor
├── interfaces/
│   └── cache-options.interface.ts
└── cache.controller.ts       # Cache management endpoints
```

## Usage

### Basic Caching with Decorators

```typescript
@Injectable()
export class MyService {
  // Cache method results for 5 minutes
  @Cacheable({ prefix: 'my-data', ttl: 300 })
  async getExpensiveData(id: string) {
    return await this.performExpensiveOperation(id);
  }

  // Invalidate cache after update
  @CacheInvalidate('my-data:*')
  async updateData(id: string, data: any) {
    return await this.saveData(id, data);
  }
}
```

### Cache-Aside Pattern

```typescript
async getDataWithCache(key: string) {
  return await this.cacheService.getOrSet({
    key: `data:${key}`,
    ttl: 600, // 10 minutes
    fetchFn: async () => {
      // This function is called only on cache miss
      return await this.fetchFromDatabase(key);
    },
    tenantSpecific: true, // Automatically adds tenant isolation
  });
}
```

### Quote Caching

```typescript
const quoteResult = await this.quoteCacheService.getOrCalculateQuote(
  {
    fileHash: 'abc123',
    service: 'FFF_PRINTING',
    material: 'PLA',
    quantity: 10,
    options: { color: 'red', finish: 'glossy' },
  },
  async () => {
    // Calculate quote if not cached
    return await this.calculateQuote();
  },
);
```

### Session Caching

```typescript
// Cache user session
await this.cacheService.cacheUserSession(userId, sessionData);

// Retrieve cached session
const session = await this.cacheService.getCachedUserSession(userId);

// Extend session TTL
await this.cacheService.extendUserSession(userId);
```

## Cache Keys Structure

### Tenant Isolation

All tenant-specific data is automatically prefixed:

```
tenant:{tenantId}:{your-key}
```

### Quote Cache Keys

```
quote:file:{fileHash}:{service}:{material}:{quantity}:{optionsHash}
```

### Pricing Cache Keys

```
pricing:rules:{service}:{material}
pricing:{service}:{material}
```

### Session Cache Keys

```
tenant:{tenantId}:session:{userId}
```

## Configuration

### Environment Variables

```env
REDIS_URL=redis://localhost:6379
```

### Default TTLs

- Quote calculations: 1 hour (3600s)
- Pricing rules: 30 minutes (1800s)
- Tenant configuration: 15 minutes (900s)
- User sessions: 15 minutes (900s)

## Cache Invalidation Strategies

### Pattern-Based Invalidation

```typescript
// Invalidate all quotes for a file
await this.quoteCacheService.invalidateFileQuotes(fileHash);

// Invalidate all quotes for a service/material
await this.quoteCacheService.invalidateServiceMaterialQuotes('FFF_PRINTING', 'PLA');

// Invalidate by pattern
await this.cacheService.invalidate('pricing:*');
```

### Event-Based Invalidation

```typescript
@CacheInvalidate(['pricing:*', 'quotes:*'])
async updatePricingRules() {
  // Cache will be invalidated after this method completes
}
```

## Monitoring and Statistics

### Health Check Endpoints

```bash
# Basic health check
GET /health/ready

# Detailed health with cache stats
GET /health/detailed

# Cache-specific health
GET /cache/health
```

### Cache Statistics

```typescript
const stats = this.redisService.getStatistics();
// {
//   hits: 1250,
//   misses: 230,
//   sets: 1480,
//   deletes: 45,
//   errors: 2,
//   hitRate: 84.45,
//   lastReset: Date
// }
```

### Management Endpoints

```bash
# Get cache statistics
GET /cache/statistics

# Reset statistics
POST /cache/statistics/reset

# Invalidate by pattern
DELETE /cache/invalidate/{pattern}

# Flush tenant cache
DELETE /cache/tenant

# Warm up cache
POST /cache/warmup
```

## Best Practices

1. **Use Appropriate TTLs**

   - Shorter TTLs for frequently changing data
   - Longer TTLs for static configuration
   - Consider business requirements for data freshness

2. **Key Naming Conventions**

   - Use descriptive prefixes
   - Include version in keys if data structure changes
   - Keep keys reasonably short

3. **Error Handling**

   - Service continues to work without Redis (graceful degradation)
   - Log cache errors but don't fail requests
   - Monitor error rates

4. **Performance Optimization**

   - Use batch operations for multiple keys
   - Implement cache warming for critical data
   - Monitor hit rates and adjust TTLs accordingly

5. **Security**
   - Tenant isolation is automatic for tenant-specific operations
   - Sensitive data should be encrypted before caching
   - Use appropriate access controls for cache management endpoints

## Troubleshooting

### Low Hit Rate

- Check if TTLs are too short
- Verify key generation is consistent
- Consider implementing cache warming

### High Memory Usage

- Review TTL settings
- Implement cache eviction policies
- Monitor for memory leaks

### Connection Issues

- Check Redis connection string
- Verify network connectivity
- Review Redis server logs

## Testing

```typescript
// Example test with mocked Redis
describe('CacheService', () => {
  let service: CacheService;
  let mockRedis: jest.Mocked<RedisService>;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      // ... other methods
    };

    service = new CacheService(mockRedis);
  });

  it('should use cache for repeated calls', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.get.mockResolvedValueOnce({ data: 'cached' });

    // First call - cache miss
    await service.getOrSet({ key: 'test', fetchFn: async () => 'fresh' });

    // Second call - cache hit
    const result = await service.getOrSet({ key: 'test', fetchFn: async () => 'fresh' });

    expect(result).toEqual({ data: 'cached' });
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
  });
});
```

## Future Enhancements

1. **Redis Cluster Support**: For horizontal scaling
2. **Cache Tagging**: For more granular invalidation
3. **Compression**: For large cached objects
4. **Pub/Sub**: For cache invalidation across multiple instances
5. **Metrics Export**: Prometheus/Grafana integration
