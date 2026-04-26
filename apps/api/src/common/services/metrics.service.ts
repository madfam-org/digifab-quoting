import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@/modules/redis/redis.service';

interface LatencyMetric {
  count: number;
  total: number;
  min: number;
  max: number;
  samples: number[];
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly metrics = new Map<string, any>();
  private readonly SAMPLE_SIZE = 1000;
  private readonly SLOW_REQUEST_THRESHOLD = 1000; // 1 second

  constructor(private readonly redis: RedisService) {}

  // API Latency tracking
  recordApiLatency(route: string, method: string, duration: number): void {
    const key = `api.latency.${method}.${route}`;
    const existing = this.metrics.get(key) || this.createLatencyMetric();

    existing.count++;
    existing.total += duration;
    existing.min = Math.min(existing.min, duration);
    existing.max = Math.max(existing.max, duration);

    // Store samples for percentile calculation
    existing.samples.push(duration);
    if (existing.samples.length > this.SAMPLE_SIZE) {
      existing.samples.shift();
    }

    this.metrics.set(key, existing);

    // Also store in Redis for distributed metrics
    this.storeInRedis(`metrics:${key}`, existing);
  }

  // API call counting
  incrementApiCall(route: string, method: string, status: 'success' | 'error'): void {
    const key = `api.calls.${method}.${route}.${status}`;
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);

    // Increment in Redis
    this.redis.incr(`metrics:${key}`);
  }

  // Slow request tracking
  recordSlowRequest(route: string, method: string, duration: number): void {
    if (duration < this.SLOW_REQUEST_THRESHOLD) return;

    const key = `api.slow.${method}.${route}`;
    const existing = this.metrics.get(key) || [];
    existing.push({
      timestamp: new Date(),
      duration,
    });

    // Keep only last 100 slow requests
    if (existing.length > 100) {
      existing.shift();
    }

    this.metrics.set(key, existing);
    this.storeInRedis(`metrics:${key}`, existing);
  }

  // Cache metrics
  recordCacheMetrics(route: string, hit: boolean): void {
    const key = `cache.${route}`;
    const existing = this.metrics.get(key) || { hits: 0, misses: 0 };

    if (hit) {
      existing.hits++;
    } else {
      existing.misses++;
    }

    existing.rate = this.calculateHitRate(existing.hits, existing.misses);
    this.metrics.set(key, existing);

    // Update Redis
    const redisKey = `metrics:${key}:${hit ? 'hits' : 'misses'}`;
    this.redis.incr(redisKey);
  }

  // Error tracking
  recordError(route: string, method: string, error: any): void {
    const key = `errors.${method}.${route}`;
    const existing = this.metrics.get(key) || [];
    existing.push({
      timestamp: new Date(),
      message: error.message,
      stack: error.stack,
    });

    // Keep only last 50 errors per endpoint
    if (existing.length > 50) {
      existing.shift();
    }

    this.metrics.set(key, existing);
    this.storeInRedis(`metrics:${key}`, existing);
  }

  // Currency conversion metrics
  recordCurrencyConversion(from: string, to: string, amount: number, duration: number): void {
    const key = `currency.conversion.${from}.${to}`;
    const existing = this.metrics.get(key) || {
      count: 0,
      totalAmount: 0,
      totalDuration: 0,
      avgDuration: 0,
    };

    existing.count++;
    existing.totalAmount += amount;
    existing.totalDuration += duration;
    existing.avgDuration = existing.totalDuration / existing.count;

    this.metrics.set(key, existing);
    this.storeInRedis(`metrics:${key}`, existing);
  }

  // Exchange rate update metrics
  recordExchangeRateUpdate(success: boolean, duration: number, ratesUpdated: number): void {
    const key = 'currency.rate.updates';
    const existing = this.metrics.get(key) || {
      successful: 0,
      failed: 0,
      totalDuration: 0,
      totalRates: 0,
    };

    if (success) {
      existing.successful++;
      existing.totalRates += ratesUpdated;
    } else {
      existing.failed++;
    }
    existing.totalDuration += duration;

    this.metrics.set(key, existing);
    this.storeInRedis(`metrics:${key}`, existing);
  }

  // Get metrics summary with percentiles
  getMetricsSummary(): any {
    const summary: any = {
      api: {
        latency: {},
        calls: {},
        slowRequests: [],
      },
      cache: {
        overall: { hits: 0, misses: 0, rate: 0 },
        byRoute: {},
      },
      currency: {
        conversions: {},
        rateUpdates: {},
      },
      errors: {
        count: 0,
        byEndpoint: {},
      },
      health: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date(),
      },
    };

    // Process metrics
    this.metrics.forEach((value, key) => {
      if (key.startsWith('api.latency.')) {
        const [, , method, ...routeParts] = key.split('.');
        const route = routeParts.join('.');
        const percentiles = this.calculatePercentiles(value.samples);

        summary.api.latency[`${method} ${route}`] = {
          count: value.count,
          avg: Math.round(value.total / value.count),
          min: value.min,
          max: value.max,
          ...percentiles,
        };
      } else if (key.startsWith('api.calls.')) {
        const [, , method, route, status] = key.split('.');
        const endpoint = `${method} ${route}`;
        if (!summary.api.calls[endpoint]) {
          summary.api.calls[endpoint] = { success: 0, error: 0, errorRate: 0 };
        }
        summary.api.calls[endpoint][status] = value;

        // Calculate error rate
        const calls = summary.api.calls[endpoint];
        const total = calls.success + calls.error;
        if (total > 0) {
          calls.errorRate = ((calls.error / total) * 100).toFixed(2) + '%';
        }
      } else if (key.startsWith('cache.')) {
        const route = key.replace('cache.', '');
        summary.cache.byRoute[route] = value;
        summary.cache.overall.hits += value.hits;
        summary.cache.overall.misses += value.misses;
      } else if (key.startsWith('currency.conversion.')) {
        const [, , from, to] = key.split('.');
        summary.currency.conversions[`${from}->${to}`] = {
          count: value.count,
          avgAmount: Math.round(value.totalAmount / value.count),
          avgDuration: Math.round(value.avgDuration) + 'ms',
        };
      } else if (key === 'currency.rate.updates') {
        summary.currency.rateUpdates = {
          ...value,
          avgDuration: Math.round(value.totalDuration / (value.successful + value.failed)) + 'ms',
          successRate:
            ((value.successful / (value.successful + value.failed)) * 100).toFixed(2) + '%',
        };
      } else if (key.startsWith('errors.')) {
        summary.errors.count += value.length;
        const [, method, route] = key.split('.');
        summary.errors.byEndpoint[`${method} ${route}`] = {
          count: value.length,
          recent: value.slice(-5).map((e: any) => ({
            timestamp: e.timestamp,
            message: e.message,
          })),
        };
      } else if (key.startsWith('api.slow.')) {
        const [, , method, route] = key.split('.');
        summary.api.slowRequests.push({
          endpoint: `${method} ${route}`,
          count: value.length,
          avgDuration:
            Math.round(
              value.reduce((sum: number, req: any) => sum + req.duration, 0) / value.length,
            ) + 'ms',
          recent: value.slice(-3),
        });
      }
    });

    // Calculate overall cache hit rate
    summary.cache.overall.rate = this.calculateHitRate(
      summary.cache.overall.hits,
      summary.cache.overall.misses,
    );

    return summary;
  }

  // Export metrics for Prometheus
  async exportPrometheusMetrics(): Promise<string> {
    let output = '';

    // API latency histogram
    output += '# HELP api_request_duration_ms API request duration in milliseconds\n';
    output += '# TYPE api_request_duration_ms histogram\n';

    // API calls counter
    output += '# HELP api_requests_total Total number of API requests\n';
    output += '# TYPE api_requests_total counter\n';

    // Cache metrics
    output += '# HELP cache_hits_total Total number of cache hits\n';
    output += '# TYPE cache_hits_total counter\n';
    output += '# HELP cache_misses_total Total number of cache misses\n';
    output += '# TYPE cache_misses_total counter\n';

    // Currency conversion metrics
    output += '# HELP currency_conversions_total Total number of currency conversions\n';
    output += '# TYPE currency_conversions_total counter\n';

    // Process all metrics
    this.metrics.forEach((value, key) => {
      if (key.startsWith('api.latency.')) {
        const [, , method, ...routeParts] = key.split('.');
        const route = routeParts.join('.').replace(/\//g, '_');
        const labels = `method="${method}",route="${route}"`;

        output += `api_request_duration_ms_sum{${labels}} ${value.total}\n`;
        output += `api_request_duration_ms_count{${labels}} ${value.count}\n`;

        // Add percentiles
        const percentiles = this.calculatePercentiles(value.samples);
        output += `api_request_duration_ms{${labels},quantile="0.5"} ${percentiles.p50}\n`;
        output += `api_request_duration_ms{${labels},quantile="0.95"} ${percentiles.p95}\n`;
        output += `api_request_duration_ms{${labels},quantile="0.99"} ${percentiles.p99}\n`;
      } else if (key.startsWith('api.calls.')) {
        const [, , method, route, status] = key.split('.');
        const cleanRoute = route.replace(/\//g, '_');
        const labels = `method="${method}",route="${cleanRoute}",status="${status}"`;
        output += `api_requests_total{${labels}} ${value}\n`;
      } else if (key.startsWith('cache.')) {
        const route = key.replace('cache.', '').replace(/\//g, '_');
        output += `cache_hits_total{route="${route}"} ${value.hits}\n`;
        output += `cache_misses_total{route="${route}"} ${value.misses}\n`;
      } else if (key.startsWith('currency.conversion.')) {
        const [, , from, to] = key.split('.');
        const labels = `from="${from}",to="${to}"`;
        output += `currency_conversions_total{${labels}} ${value.count}\n`;
      }
    });

    return output;
  }

  // Clean old metrics periodically
  @Cron(CronExpression.EVERY_HOUR)
  clearOldMetrics(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    this.metrics.forEach((value, key) => {
      if (key.startsWith('api.slow.') || key.startsWith('errors.')) {
        const filtered = value.filter(
          (item: any) => new Date(item.timestamp).getTime() > oneHourAgo,
        );
        if (filtered.length === 0) {
          this.metrics.delete(key);
        } else {
          this.metrics.set(key, filtered);
        }
      }
    });

    this.logger.log('Cleared old metrics');
  }

  // Helper methods
  private createLatencyMetric(): LatencyMetric {
    return {
      count: 0,
      total: 0,
      min: Infinity,
      max: 0,
      samples: [],
    };
  }

  private calculatePercentiles(samples: number[]): { p50: number; p95: number; p99: number } {
    if (samples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
    };
  }

  private calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    if (total === 0) return 0;
    return Math.round((hits / total) * 100);
  }

  private async storeInRedis(key: string, value: any): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 3600); // 1 hour TTL
    } catch (error) {
      this.logger.error(`Failed to store metrics in Redis: ${error.message}`);
    }
  }

  // Get distributed metrics from Redis
  async getDistributedMetrics(): Promise<any> {
    const keys = await this.redis.keys('metrics:*');
    const metrics: any = {};

    for (const key of keys) {
      try {
        const value = await this.redis.get(key);
        if (value && typeof value === 'string') {
          const cleanKey = key.replace('metrics:', '');
          metrics[cleanKey] = JSON.parse(value);
        }
      } catch (error) {
        this.logger.error(`Failed to get metric ${key}: ${error.message}`);
      }
    }

    return metrics;
  }
}
