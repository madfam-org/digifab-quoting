import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CircuitBreaker = require('opossum');
type CircuitBreaker = any;
import { EventEmitter } from 'events';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  volumeThreshold?: number;
  fallbackFunction?: (...args: any[]) => Promise<any>;
  name?: string;
}

export interface CircuitBreakerMetrics {
  requests: number;
  success: number;
  failure: number;
  timeout: number;
  fallback: number;
  circuitOpen: number;
  circuitClosed: number;
  percentile95: number;
  percentile99: number;
}

@Injectable()
export class CircuitBreakerService extends EventEmitter {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly metrics = new Map<string, CircuitBreakerMetrics>();
  private readonly adaptiveSettings = new Map<
    string,
    { successRate: number; avgResponseTime: number }
  >();

  create(
    name: string,
    action: (...args: any[]) => Promise<any>,
    options: CircuitBreakerOptions = {},
  ): CircuitBreaker {
    // Check if breaker already exists
    const existing = this.breakers.get(name);
    if (existing) {
      return existing;
    }

    // Create new circuit breaker with defaults
    const breaker = new CircuitBreaker(action, {
      timeout: options.timeout ?? 3000,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      resetTimeout: options.resetTimeout ?? 30000,
      rollingCountTimeout: options.rollingCountTimeout ?? 10000,
      rollingCountBuckets: options.rollingCountBuckets ?? 10,
      volumeThreshold: options.volumeThreshold ?? 10,
      name: options.name ?? name,
    });

    // Initialize metrics
    this.metrics.set(name, {
      requests: 0,
      success: 0,
      failure: 0,
      timeout: 0,
      fallback: 0,
      circuitOpen: 0,
      circuitClosed: 0,
      percentile95: 0,
      percentile99: 0,
    });

    // Set up event handlers
    this.setupEventHandlers(name, breaker);

    // Set fallback if provided
    if (options.fallbackFunction) {
      breaker.fallback(options.fallbackFunction);
    }

    // Enable adaptive behavior
    this.enableAdaptiveBehavior(name, breaker);

    this.breakers.set(name, breaker);
    this.logger.log(`Circuit breaker created: ${name}`);

    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getMetrics(name: string): CircuitBreakerMetrics | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): Map<string, CircuitBreakerMetrics> {
    return new Map(this.metrics);
  }

  async healthCheck(): Promise<{ [key: string]: string }> {
    const status: { [key: string]: string } = {};

    for (const [name, breaker] of this.breakers) {
      if (breaker.opened) {
        status[name] = 'open';
      } else if (breaker.halfOpen) {
        status[name] = 'half-open';
      } else {
        status[name] = 'closed';
      }
    }

    return status;
  }

  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.close();
      this.logger.log(`Circuit breaker reset: ${name}`);
    }
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.close();
    }
    this.logger.log('All circuit breakers reset');
  }

  private setupEventHandlers(name: string, breaker: CircuitBreaker): void {
    const metrics = this.metrics.get(name)!;

    breaker.on('success', (_result: any, latency: number) => {
      metrics.requests++;
      metrics.success++;
      this.updateResponseTimeMetrics(name, latency);
      this.emit('breaker.success', { name, latency });
    });

    breaker.on('failure', (error: Error, latency: number) => {
      metrics.requests++;
      metrics.failure++;
      this.logger.warn(`Circuit breaker failure: ${name}`, error.message);
      this.emit('breaker.failure', { name, error, latency });
    });

    breaker.on('timeout', (_error: Error, latency: number) => {
      metrics.requests++;
      metrics.timeout++;
      this.logger.warn(`Circuit breaker timeout: ${name}`);
      this.emit('breaker.timeout', { name, latency });
    });

    breaker.on('reject', (error: Error) => {
      this.logger.warn(`Circuit breaker rejected: ${name}`);
      this.emit('breaker.reject', { name, error });
    });

    breaker.on('open', () => {
      metrics.circuitOpen++;
      this.logger.warn(`Circuit breaker opened: ${name}`);
      this.emit('breaker.open', { name });
      this.notifyOps(name, 'open');
    });

    breaker.on('halfOpen', () => {
      this.logger.log(`Circuit breaker half-open: ${name}`);
      this.emit('breaker.halfOpen', { name });
    });

    breaker.on('close', () => {
      metrics.circuitClosed++;
      this.logger.log(`Circuit breaker closed: ${name}`);
      this.emit('breaker.close', { name });
      this.notifyOps(name, 'closed');
    });

    breaker.on('fallback', (result: any) => {
      metrics.fallback++;
      this.emit('breaker.fallback', { name, result });
    });
  }

  private enableAdaptiveBehavior(name: string, breaker: CircuitBreaker): void {
    // Initialize adaptive settings
    this.adaptiveSettings.set(name, { successRate: 1.0, avgResponseTime: 0 });

    // Periodically adjust circuit breaker settings based on performance
    setInterval(() => {
      this.adjustBreakerSettings(name, breaker);
    }, 30000); // Every 30 seconds
  }

  private adjustBreakerSettings(name: string, breaker: CircuitBreaker): void {
    const metrics = this.metrics.get(name);
    const settings = this.adaptiveSettings.get(name);

    if (!metrics || !settings || metrics.requests < 100) {
      return; // Not enough data to adapt
    }

    // Calculate success rate
    const successRate = metrics.success / metrics.requests;
    settings.successRate = successRate;

    // Adaptive timeout adjustment
    if (successRate > 0.95 && metrics.percentile95 > 0) {
      // System is healthy, tighten timeout
      const newTimeout = Math.max(1000, metrics.percentile95 * 1.5);
      breaker.options.timeout = Math.min(newTimeout, breaker.options.timeout);
    } else if (successRate < 0.8) {
      // System is struggling, relax timeout
      breaker.options.timeout = Math.min(10000, breaker.options.timeout * 1.2);
    }

    // Adaptive error threshold
    if (successRate > 0.98) {
      // Very stable, be more sensitive to errors
      breaker.options.errorThresholdPercentage = Math.max(
        30,
        breaker.options.errorThresholdPercentage - 5,
      );
    } else if (successRate < 0.7) {
      // Unstable, be more tolerant
      breaker.options.errorThresholdPercentage = Math.min(
        70,
        breaker.options.errorThresholdPercentage + 5,
      );
    }

    this.logger.debug(
      `Adapted circuit breaker ${name}: timeout=${breaker.options.timeout}, threshold=${breaker.options.errorThresholdPercentage}%`,
    );
  }

  private updateResponseTimeMetrics(name: string, latency: number): void {
    const settings = this.adaptiveSettings.get(name);
    if (!settings) return;

    // Simple moving average for response time
    const alpha = 0.1; // Smoothing factor
    settings.avgResponseTime = settings.avgResponseTime * (1 - alpha) + latency * alpha;

    // Update percentiles (simplified - in production use a proper percentile library)
    const metrics = this.metrics.get(name)!;
    metrics.percentile95 = Math.max(metrics.percentile95 * 0.95, latency);
    metrics.percentile99 = Math.max(metrics.percentile99 * 0.99, latency);
  }

  private async notifyOps(breakerName: string, state: string): Promise<void> {
    // In production, integrate with PagerDuty, Slack, etc.
    this.logger.warn(`ALERT: Circuit breaker ${breakerName} is now ${state}`);
  }

  // Bulk operations for managing multiple breakers
  async testAllBreakers(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, breaker] of this.breakers) {
      try {
        // Test with a simple health check function
        const testFn = () => Promise.resolve('healthy');
        const wrapped = breaker.wrap(testFn);
        await wrapped();
        results.set(name, true);
      } catch (error) {
        results.set(name, false);
      }
    }

    return results;
  }

  // Get recommendation for circuit breaker configuration
  getRecommendedSettings(
    _serviceName: string,
    sla: { latencyP99: number; errorRate: number },
  ): CircuitBreakerOptions {
    return {
      timeout: sla.latencyP99 * 1.5, // 50% buffer over P99
      errorThresholdPercentage: Math.min(50, (1 - sla.errorRate) * 100), // Based on SLA error rate
      resetTimeout: 30000, // 30 seconds default
      rollingCountTimeout: 10000, // 10 second window
      rollingCountBuckets: 10, // 1 second buckets
      volumeThreshold: 10, // Minimum requests before opening
    };
  }
}
