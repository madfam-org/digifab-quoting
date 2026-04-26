import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from './metrics.service';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  private readonly thresholds = new Map<string, PerformanceThreshold>();
  private readonly activeTransactions = new Map<string, { startTime: number; name: string }>();

  constructor(
    private readonly metricsService: MetricsService,
    // private readonly _configService: ConfigService, // Reserved for future configuration needs
  ) {
    this.setupDefaultThresholds();
  }

  private setupDefaultThresholds() {
    // API Response Time Thresholds
    this.thresholds.set('api.response_time', {
      metric: 'api.response_time',
      warning: 500, // 500ms
      critical: 1000, // 1s
      unit: 'ms',
    });

    // Database Query Time Thresholds
    this.thresholds.set('database.query_time', {
      metric: 'database.query_time',
      warning: 100, // 100ms
      critical: 500, // 500ms
      unit: 'ms',
    });

    // Memory Usage Thresholds
    this.thresholds.set('memory.usage', {
      metric: 'memory.usage',
      warning: 0.75, // 75%
      critical: 0.9, // 90%
      unit: 'ratio',
    });

    // CPU Usage Thresholds
    this.thresholds.set('cpu.usage', {
      metric: 'cpu.usage',
      warning: 0.7, // 70%
      critical: 0.9, // 90%
      unit: 'ratio',
    });

    // Cache Hit Rate Thresholds (lower is worse)
    this.thresholds.set('cache.hit_rate', {
      metric: 'cache.hit_rate',
      warning: 0.8, // 80% - warning if below this
      critical: 0.6, // 60% - critical if below this
      unit: 'ratio',
    });
  }

  // Transaction tracking
  startTransaction(transactionId: string, name: string): void {
    this.activeTransactions.set(transactionId, {
      startTime: Date.now(),
      name,
    });
  }

  endTransaction(transactionId: string, tags?: Record<string, string>): number {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      this.logger.warn(`Transaction ${transactionId} not found`);
      return 0;
    }

    const duration = Date.now() - transaction.startTime;
    this.activeTransactions.delete(transactionId);

    // Record the performance metric
    this.recordPerformanceMetric({
      name: `transaction.${transaction.name}.duration`,
      value: duration,
      unit: 'ms',
      timestamp: new Date(),
      tags,
    });

    // Check thresholds
    this.checkThreshold(`transaction.${transaction.name}.duration`, duration, 'ms');

    return duration;
  }

  // Generic performance metric recording
  recordPerformanceMetric(metric: PerformanceMetric): void {
    // Record in metrics service
    this.metricsService.recordHistogram(metric.name, metric.value, metric.tags);

    // Log if above warning threshold
    this.checkThreshold(metric.name, metric.value, metric.unit);
  }

  private checkThreshold(metricName: string, value: number, unit: string): void {
    // Find matching threshold (exact match or pattern match)
    let threshold = this.thresholds.get(metricName);

    if (!threshold) {
      // Try pattern matching for common metrics
      if (metricName.includes('.duration')) {
        threshold = this.thresholds.get('api.response_time');
      } else if (metricName.includes('database')) {
        threshold = this.thresholds.get('database.query_time');
      }
    }

    if (!threshold) return;

    const level = this.getThresholdLevel(threshold, value);
    if (level !== 'ok') {
      this.logger.warn(`Performance ${level}: ${metricName} = ${value}${unit}`, {
        metric: metricName,
        value,
        unit,
        level,
        threshold: level === 'critical' ? threshold.critical : threshold.warning,
      });
    }
  }

  private getThresholdLevel(
    threshold: PerformanceThreshold,
    value: number,
  ): 'ok' | 'warning' | 'critical' {
    // For cache hit rate, lower values are worse
    if (threshold.metric === 'cache.hit_rate') {
      if (value < threshold.critical) return 'critical';
      if (value < threshold.warning) return 'warning';
      return 'ok';
    }

    // For most metrics, higher values are worse
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.warning) return 'warning';
    return 'ok';
  }

  // Measurement decorators and utilities
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>,
  ): Promise<T> {
    const transactionId = `${name}_${Date.now()}_${Math.random()}`;
    this.startTransaction(transactionId, name);

    try {
      const result = await fn();
      this.endTransaction(transactionId, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      this.endTransaction(transactionId, { ...tags, status: 'error' });
      throw error;
    }
  }

  measure<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    const startTime = Date.now();

    try {
      const result = fn();
      const duration = Date.now() - startTime;

      this.recordPerformanceMetric({
        name: `${name}.duration`,
        value: duration,
        unit: 'ms',
        timestamp: new Date(),
        tags: { ...tags, status: 'success' },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.recordPerformanceMetric({
        name: `${name}.duration`,
        value: duration,
        unit: 'ms',
        timestamp: new Date(),
        tags: { ...tags, status: 'error' },
      });

      throw error;
    }
  }

  // System performance monitoring
  recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Memory metrics
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const memoryUsageRatio = heapUsedMB / heapTotalMB;

    this.recordPerformanceMetric({
      name: 'system.memory.heap_used',
      value: heapUsedMB,
      unit: 'mb',
      timestamp: new Date(),
    });

    this.recordPerformanceMetric({
      name: 'memory.usage',
      value: memoryUsageRatio,
      unit: 'ratio',
      timestamp: new Date(),
    });

    // CPU metrics (convert microseconds to percentage)
    const cpuUserPercent = (cpuUsage.user / 1000000) * 100;
    const cpuSystemPercent = (cpuUsage.system / 1000000) * 100;

    this.recordPerformanceMetric({
      name: 'system.cpu.user',
      value: cpuUserPercent,
      unit: 'percent',
      timestamp: new Date(),
    });

    this.recordPerformanceMetric({
      name: 'system.cpu.system',
      value: cpuSystemPercent,
      unit: 'percent',
      timestamp: new Date(),
    });
  }

  // Performance report generation
  async generatePerformanceReport(): Promise<{
    timestamp: string;
    summary: {
      activeTransactions: number;
      averageResponseTime: number;
      p95ResponseTime: number;
      averageDbQueryTime: number;
      cacheHitRate: number;
    };
    thresholds: PerformanceThreshold[];
    systemMetrics: {
      memory: NodeJS.MemoryUsage;
      cpu: NodeJS.CpuUsage;
      uptime: number;
    };
    detailedMetrics: unknown;
  }> {
    const metrics = this.metricsService.getAllMetrics();
    const activeTransactionCount = this.activeTransactions.size;

    // Calculate average response times
    const responseTimeStats = this.metricsService.getHistogramStats('api.response_time');
    const dbQueryStats = this.metricsService.getHistogramStats('database.query_time');
    const cacheHitRate = this.calculateCacheHitRate();

    return {
      timestamp: new Date().toISOString(),
      summary: {
        activeTransactions: activeTransactionCount,
        averageResponseTime: responseTimeStats.mean,
        p95ResponseTime: responseTimeStats.p95,
        averageDbQueryTime: dbQueryStats.mean,
        cacheHitRate,
      },
      thresholds: Array.from(this.thresholds.values()),
      systemMetrics: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
      },
      detailedMetrics: metrics,
    };
  }

  private calculateCacheHitRate(): number {
    const hits = this.metricsService.getCounter('cache.hits');
    const misses = this.metricsService.getCounter('cache.misses');
    const total = hits + misses;

    return total > 0 ? hits / total : 0;
  }

  // Configuration methods
  setThreshold(metricName: string, warning: number, critical: number, unit: string): void {
    this.thresholds.set(metricName, {
      metric: metricName,
      warning,
      critical,
      unit,
    });
  }

  getThreshold(metricName: string): PerformanceThreshold | undefined {
    return this.thresholds.get(metricName);
  }

  // Cleanup
  cleanup(): void {
    this.activeTransactions.clear();
  }

  // Health check
  getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] } {
    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check active transactions that might be stuck
    const stuckTransactions = Array.from(this.activeTransactions.entries()).filter(
      ([, transaction]) => Date.now() - transaction.startTime > 30000, // 30 seconds
    );

    if (stuckTransactions.length > 0) {
      issues.push(`${stuckTransactions.length} stuck transactions detected`);
      status = 'degraded';
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsagePercent > 90) {
      issues.push(`High memory usage: ${heapUsagePercent.toFixed(1)}%`);
      status = 'unhealthy';
    } else if (heapUsagePercent > 75) {
      issues.push(`Elevated memory usage: ${heapUsagePercent.toFixed(1)}%`);
      if (status === 'healthy') status = 'degraded';
    }

    return { status, issues };
  }
}
