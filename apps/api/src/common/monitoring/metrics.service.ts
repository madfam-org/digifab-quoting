import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface MetricData {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

interface CounterMetric extends MetricData {
  type: 'counter';
}

interface GaugeMetric extends MetricData {
  type: 'gauge';
}

interface HistogramMetric extends MetricData {
  type: 'histogram';
  buckets?: number[];
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  // private metrics = new Map<string, any>(); // Future use for aggregated metrics
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  constructor(private readonly configService: ConfigService) {}

  // Counter methods
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>) {
    const key = this.getMetricKey(name, tags);
    const currentValue = this.counters.get(key) || 0;
    this.counters.set(key, currentValue + value);

    this.recordMetric({
      type: 'counter',
      name,
      value: currentValue + value,
      tags,
      timestamp: Date.now(),
    });
  }

  decrementCounter(name: string, value: number = 1, tags?: Record<string, string>) {
    this.incrementCounter(name, -value, tags);
  }

  getCounter(name: string, tags?: Record<string, string>): number {
    const key = this.getMetricKey(name, tags);
    return this.counters.get(key) || 0;
  }

  // Gauge methods
  setGauge(name: string, value: number, tags?: Record<string, string>) {
    const key = this.getMetricKey(name, tags);
    this.gauges.set(key, value);

    this.recordMetric({
      type: 'gauge',
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  incrementGauge(name: string, value: number = 1, tags?: Record<string, string>) {
    const key = this.getMetricKey(name, tags);
    const currentValue = this.gauges.get(key) || 0;
    this.setGauge(name, currentValue + value, tags);
  }

  decrementGauge(name: string, value: number = 1, tags?: Record<string, string>) {
    this.incrementGauge(name, -value, tags);
  }

  getGauge(name: string, tags?: Record<string, string>): number {
    const key = this.getMetricKey(name, tags);
    return this.gauges.get(key) || 0;
  }

  // Histogram methods
  recordHistogram(name: string, value: number, tags?: Record<string, string>) {
    const key = this.getMetricKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);

    // Keep only last 1000 values to prevent memory growth
    if (values.length > 1000) {
      values.splice(0, values.length - 1000);
    }

    this.recordMetric({
      type: 'histogram',
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  getHistogramStats(name: string, tags?: Record<string, string>) {
    const key = this.getMetricKey(name, tags);
    const values = this.histograms.get(key) || [];

    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = values.slice().sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / values.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  // Timing methods
  time<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.recordHistogram(`${name}.duration`, duration, tags);
      this.incrementCounter(`${name}.success`, 1, tags);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordHistogram(`${name}.duration`, duration, tags);
      this.incrementCounter(`${name}.error`, 1, tags);
      throw error;
    }
  }

  async timeAsync<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.recordHistogram(`${name}.duration`, duration, tags);
      this.incrementCounter(`${name}.success`, 1, tags);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordHistogram(`${name}.duration`, duration, tags);
      this.incrementCounter(`${name}.error`, 1, tags);
      throw error;
    }
  }

  // Application-specific metrics
  recordApiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    tenantId?: string,
  ) {
    const tags = {
      method: method.toUpperCase(),
      path: this.sanitizePath(path),
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
      ...(tenantId && { tenant_id: tenantId }),
    };

    this.incrementCounter('api.requests.total', 1, tags);
    this.recordHistogram('api.requests.duration', duration, tags);

    if (statusCode >= 400) {
      this.incrementCounter('api.requests.errors', 1, tags);
    }
  }

  recordDatabaseQuery(operation: string, model: string, duration: number, success: boolean) {
    const tags = {
      operation: operation.toLowerCase(),
      model: model.toLowerCase(),
      status: success ? 'success' : 'error',
    };

    this.incrementCounter('database.queries.total', 1, tags);
    this.recordHistogram('database.queries.duration', duration, tags);

    if (!success) {
      this.incrementCounter('database.queries.errors', 1, tags);
    }
  }

  recordCacheOperation(operation: string, hit: boolean, duration: number) {
    const tags = {
      operation: operation.toLowerCase(),
      result: hit ? 'hit' : 'miss',
    };

    this.incrementCounter('cache.operations.total', 1, tags);
    this.recordHistogram('cache.operations.duration', duration, tags);

    if (operation === 'get') {
      this.incrementCounter(`cache.${hit ? 'hits' : 'misses'}`, 1);
    }
  }

  recordJobExecution(jobType: string, status: string, duration: number) {
    const tags = {
      job_type: jobType.toLowerCase(),
      status: status.toLowerCase(),
    };

    this.incrementCounter('jobs.executions.total', 1, tags);
    this.recordHistogram('jobs.executions.duration', duration, tags);

    if (status !== 'success') {
      this.incrementCounter('jobs.executions.errors', 1, tags);
    }
  }

  // System metrics
  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.setGauge('system.memory.rss', memUsage.rss);
    this.setGauge('system.memory.heap_used', memUsage.heapUsed);
    this.setGauge('system.memory.heap_total', memUsage.heapTotal);
    this.setGauge('system.memory.external', memUsage.external);
  }

  recordCpuUsage() {
    const cpuUsage = process.cpuUsage();
    this.setGauge('system.cpu.user', cpuUsage.user);
    this.setGauge('system.cpu.system', cpuUsage.system);
  }

  // Utility methods
  private getMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${tagString}}`;
  }

  private sanitizePath(path: string): string {
    // Replace UUIDs and IDs with placeholders
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }

  private percentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private recordMetric(metric: Metric) {
    // This could be extended to send metrics to external systems
    // like Prometheus, StatsD, CloudWatch, etc.
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.debug(`Metric: ${metric.name} = ${metric.value}`, metric.tags);
    }
  }

  // Export methods for monitoring endpoints
  getAllMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key]) => [
          key,
          this.getHistogramStats(key.split('{')[0]),
        ]),
      ),
    };
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
