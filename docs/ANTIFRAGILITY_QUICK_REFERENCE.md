# 🚀 Antifragility Quick Reference

## Cotiza Studio 10/10 Resilience Patterns

### 🔧 Circuit Breaker Pattern

```typescript
// Wrap any async operation
const breaker = circuitBreaker.create('my-service', async () => await riskyOperation(), {
  timeout: 3000,
  fallbackFunction: async () => cachedValue,
});

const result = await breaker.fire();
```

### 💾 Multi-Layer Cache

```typescript
// Automatic L1→L2→L3 cascade
const data = await cache.get('key');

// Set with TTL and tags
await cache.set('key', data, {
  ttl: 3600,
  tags: ['user:123', 'tenant:456'],
});

// Invalidate by tag
await cache.invalidateByTags(['user:123']);
```

### 🌪️ Chaos Testing

```typescript
// Run experiment
await chaos.runExperiment('network-latency', {
  duration: 60,
  intensity: 'low',
});

// Check if safe
if (await chaos.isSafeToRunChaos()) {
  await chaos.runRandomExperiment();
}
```

### 🩹 Self-Healing Triggers

```typescript
// Register healing strategy
selfHealing.registerStrategy('memory-leak', {
  steps: [
    { name: 'clear-cache', execute: clearNonCritical },
    { name: 'force-gc', execute: forceGarbageCollection },
    { name: 'restart', execute: gracefulRestart },
  ],
});

// Auto-detects and heals
await selfHealing.detectAndHeal();
```

### 📉 Progressive Degradation

```typescript
// Check degradation level
const level = degradation.getCurrentLevel();

if (level >= 2) {
  // Serve from cache only
  return (await cache.get(key)) || defaultResponse;
}

if (level >= 3) {
  // Read-only mode
  throw new ServiceUnavailableError('Read-only mode');
}
```

### 📊 Key Metrics

```typescript
// Circuit breaker status
const status = await circuitBreaker.healthCheck();
// Returns: { 'service-name': 'open' | 'closed' | 'half-open' }

// Cache metrics
const metrics = cache.getMetrics();
// Returns: { l1: {...}, l2: {...}, l3: {...}, overall: {...} }

// Chaos results
const history = chaos.getHistory();
// Returns: [{ experiment, success, learnings, recommendations }]
```

### 🚨 Emergency Commands

```bash
# Reset all circuit breakers
curl -X POST /admin/circuit-breakers/reset-all

# Flush degraded cache
curl -X POST /admin/cache/flush?layer=l2

# Stop chaos experiments
curl -X POST /admin/chaos/stop

# Force self-healing
curl -X POST /admin/heal/trigger

# Emergency mode
curl -X POST /admin/degradation/emergency
```

### ⚡ Performance Tips

1. **Use fallbacks**: Always provide fallback functions for circuit breakers
2. **Cache aggressively**: Set appropriate TTLs and use tags for invalidation
3. **Test regularly**: Run chaos experiments in staging weekly
4. **Monitor metrics**: Watch circuit breaker states and cache hit rates
5. **Heal proactively**: Don't wait for failures, detect and prevent

### 🎯 Common Patterns

#### Resilient API Call

```typescript
async callExternalAPI(data: any) {
  // Try cache first
  const cached = await cache.get(`api:${data.id}`);
  if (cached) return cached;

  // Use circuit breaker with fallback
  const breaker = this.circuitBreaker.get('external-api');
  const result = await breaker.fire(data);

  // Cache successful result
  await cache.set(`api:${data.id}`, result, { ttl: 300 });

  return result;
}
```

#### Degraded Service Response

```typescript
async getQuote(id: string) {
  const level = this.degradation.getCurrentLevel();

  // Full service
  if (level === 0) {
    return await this.calculateFullQuote(id);
  }

  // Cached only
  if (level <= 2) {
    const cached = await cache.get(`quote:${id}`);
    if (cached) return { ...cached, degraded: true };
  }

  // Emergency mode
  return {
    id,
    status: 'unavailable',
    message: 'Service temporarily unavailable',
    retryAfter: 300
  };
}
```

#### Auto-Scaling Based on Chaos

```typescript
chaos.on('chaos.failure', async (result) => {
  if (result.experiment === 'cpu-stress') {
    // Scale horizontally
    await kubernetes.scale('api', { replicas: '+2' });
  }

  if (result.experiment === 'memory-pressure') {
    // Increase memory limits
    await kubernetes.updateResources('api', {
      memory: '2Gi',
    });
  }
});
```

### 📚 Further Reading

- [Full Architecture](./ANTIFRAGILITY_ARCHITECTURE.md)
- [Implementation Guide](./ANTIFRAGILITY_IMPLEMENTATION.md)
- [Chaos Experiments](../packages/chaos/README.md)
- [Circuit Breaker Patterns](../packages/resilience/README.md)
- [Cache Strategy](../packages/cache/README.md)

### 🔗 Monitoring Dashboards

- **Grafana**: https://grafana.cotiza.studio/d/antifragility
- **Prometheus**: https://prometheus.cotiza.studio
- **Jaeger**: https://jaeger.cotiza.studio

---

_Remember: The goal is not to prevent all failures, but to thrive despite them!_ 💪
