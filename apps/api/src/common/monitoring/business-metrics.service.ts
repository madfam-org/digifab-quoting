import { Injectable } from '@nestjs/common';
import { RedisService } from '@/modules/redis/redis.service';
import { LoggerService } from '@/common/logger/logger.service';

interface MetricRecord {
  timestamp: number;
  value: number;
  labels: Record<string, string>;
}

interface BusinessMetrics {
  // Quote metrics
  quotesCreated: number;
  quotesCalculated: number;
  quotesApproved: number;
  quotesCancelled: number;
  quoteConversionRate: number;

  // Performance metrics
  averageCalculationTime: number;
  averageResponseTime: number;

  // Error metrics
  errorRate: number;
  criticalErrors: number;

  // Business metrics
  totalRevenue: number;
  averageOrderValue: number;
}

@Injectable()
export class BusinessMetricsService {
  private readonly metricsPrefix = 'metrics';

  constructor(
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  // Counter metrics
  async incrementCounter(
    metric: string,
    labels: Record<string, string> = {},
    value: number = 1,
  ): Promise<void> {
    try {
      const key = this.buildMetricKey('counter', metric, labels);
      await this.redis.incrby(key, value);

      // Set TTL for cleanup (30 days)
      await this.redis.expire(key, 30 * 24 * 60 * 60);

      // Store time-series data for trends
      await this.recordTimeSeries(metric, value, labels);
    } catch (error) {
      this.logger.error('Failed to increment counter metric', error, `metric:${metric}`);
    }
  }

  // Histogram metrics for durations/sizes
  async recordHistogram(
    metric: string,
    value: number,
    labels: Record<string, string> = {},
  ): Promise<void> {
    try {
      const key = this.buildMetricKey('histogram', metric, labels);

      // Store value in sorted set for percentile calculations
      await this.redis.getClient()?.zadd(key, Date.now(), value);

      // Keep only last 1000 measurements
      await this.redis.getClient()?.zremrangebyrank(key, 0, -1001);

      await this.redis.expire(key, 7 * 24 * 60 * 60); // 7 days

      await this.recordTimeSeries(metric, value, labels);
    } catch (error) {
      this.logger.error('Failed to record histogram metric', error, `metric:${metric}`);
    }
  }

  // Gauge metrics for current values
  async setGauge(
    metric: string,
    value: number,
    labels: Record<string, string> = {},
  ): Promise<void> {
    try {
      const key = this.buildMetricKey('gauge', metric, labels);
      await this.redis.set(key, value.toString(), 24 * 60 * 60); // 24 hours

      await this.recordTimeSeries(metric, value, labels);
    } catch (error) {
      this.logger.error('Failed to set gauge metric', error, `metric:${metric}`);
    }
  }

  // Business-specific metrics
  async recordQuoteEvent(
    event: 'created' | 'calculated' | 'approved' | 'cancelled',
    tenantId: string,
    quoteValue?: number,
  ): Promise<void> {
    const labels = { tenant: tenantId, event };

    await this.incrementCounter('quotes_total', labels);

    if (quoteValue !== undefined) {
      await this.recordHistogram('quote_value', quoteValue, { tenant: tenantId });

      if (event === 'approved') {
        await this.recordHistogram('approved_quote_value', quoteValue, { tenant: tenantId });
      }
    }
  }

  async recordPerformanceMetric(
    operation: string,
    durationMs: number,
    success: boolean = true,
    tenantId?: string,
  ): Promise<void> {
    const labels: Record<string, string> = {
      operation,
      status: success ? 'success' : 'error',
    };

    if (tenantId) {
      labels.tenant = tenantId;
    }

    await this.recordHistogram('operation_duration_ms', durationMs, labels);
    await this.incrementCounter('operations_total', labels);
  }

  async recordError(
    component: string,
    errorType: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    tenantId?: string,
  ): Promise<void> {
    const labels: Record<string, string> = {
      component,
      type: errorType,
      severity,
    };

    if (tenantId) {
      labels.tenant = tenantId;
    }

    await this.incrementCounter('errors_total', labels);

    if (severity === 'critical') {
      await this.incrementCounter('critical_errors_total', {
        component,
        tenant: tenantId || 'unknown',
      });
    }
  }

  // Get metrics for dashboards/alerts
  async getBusinessMetrics(tenantId?: string): Promise<BusinessMetrics> {
    try {
      const tenantFilter = tenantId ? { tenant: tenantId } : {};

      const [
        quotesCreated,
        quotesCalculated,
        quotesApproved,
        quotesCancelled,
        errorRate,
        criticalErrors,
      ] = await Promise.all([
        this.getCounterValue('quotes_total', { ...tenantFilter, event: 'created' }),
        this.getCounterValue('quotes_total', { ...tenantFilter, event: 'calculated' }),
        this.getCounterValue('quotes_total', { ...tenantFilter, event: 'approved' }),
        this.getCounterValue('quotes_total', { ...tenantFilter, event: 'cancelled' }),
        this.calculateErrorRate(tenantId),
        this.getCounterValue('critical_errors_total', tenantFilter),
      ]);

      const quoteConversionRate = quotesCreated > 0 ? (quotesApproved / quotesCreated) * 100 : 0;

      const [avgCalcTime, avgResponseTime, totalRevenue, avgOrderValue] = await Promise.all([
        this.getHistogramAverage('operation_duration_ms', { operation: 'quote_calculation' }),
        this.getHistogramAverage('operation_duration_ms', {}),
        this.getHistogramSum('approved_quote_value', tenantFilter),
        this.getHistogramAverage('approved_quote_value', tenantFilter),
      ]);

      return {
        quotesCreated,
        quotesCalculated,
        quotesApproved,
        quotesCancelled,
        quoteConversionRate,
        averageCalculationTime: avgCalcTime,
        averageResponseTime: avgResponseTime,
        errorRate,
        criticalErrors,
        totalRevenue,
        averageOrderValue: avgOrderValue,
      };
    } catch (error) {
      this.logger.error('Failed to get business metrics', error, `tenant:${tenantId}`);
      throw error;
    }
  }

  // Alert thresholds
  async checkAlertConditions(
    tenantId?: string,
  ): Promise<Array<{ type: string; message: string; severity: string }>> {
    const alerts: Array<{ type: string; message: string; severity: string }> = [];
    const metrics = await this.getBusinessMetrics(tenantId);

    // High error rate alert
    if (metrics.errorRate > 5) {
      alerts.push({
        type: 'error_rate',
        message: `Error rate is ${metrics.errorRate.toFixed(2)}% (threshold: 5%)`,
        severity: metrics.errorRate > 10 ? 'critical' : 'warning',
      });
    }

    // Critical errors alert
    if (metrics.criticalErrors > 0) {
      alerts.push({
        type: 'critical_errors',
        message: `${metrics.criticalErrors} critical errors detected`,
        severity: 'critical',
      });
    }

    // Low conversion rate alert
    if (metrics.quoteConversionRate < 10 && metrics.quotesCreated > 10) {
      alerts.push({
        type: 'conversion_rate',
        message: `Quote conversion rate is ${metrics.quoteConversionRate.toFixed(1)}% (threshold: 10%)`,
        severity: 'warning',
      });
    }

    // Slow response times alert
    if (metrics.averageResponseTime > 1000) {
      alerts.push({
        type: 'response_time',
        message: `Average response time is ${metrics.averageResponseTime}ms (threshold: 1000ms)`,
        severity: metrics.averageResponseTime > 2000 ? 'critical' : 'warning',
      });
    }

    return alerts;
  }

  // Private helper methods
  private buildMetricKey(type: string, metric: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(',');

    return `${this.metricsPrefix}:${type}:${metric}${labelStr ? ':' + labelStr : ''}`;
  }

  private async recordTimeSeries(
    metric: string,
    value: number,
    labels: Record<string, string>,
  ): Promise<void> {
    const timeSeriesKey = `${this.metricsPrefix}:ts:${metric}`;
    const record: MetricRecord = {
      timestamp: Date.now(),
      value,
      labels,
    };

    // Store in Redis list (with size limit)
    await this.redis.getClient()?.lpush(timeSeriesKey, JSON.stringify(record));
    await this.redis.getClient()?.ltrim(timeSeriesKey, 0, 999); // Keep last 1000 records
    await this.redis.expire(timeSeriesKey, 7 * 24 * 60 * 60); // 7 days
  }

  private async getCounterValue(
    metric: string,
    labels: Record<string, string> = {},
  ): Promise<number> {
    const key = this.buildMetricKey('counter', metric, labels);
    const value = await this.redis.get(key);
    return value ? parseInt(value as string) : 0;
  }

  private async getHistogramAverage(
    metric: string,
    labels: Record<string, string> = {},
  ): Promise<number> {
    const key = this.buildMetricKey('histogram', metric, labels);
    const values = await this.redis.getClient()?.zrange(key, 0, -1);

    if (!values || values.length === 0) return 0;

    const sum = values.reduce((acc, val) => acc + parseFloat(val), 0);
    return sum / values.length;
  }

  private async getHistogramSum(
    metric: string,
    labels: Record<string, string> = {},
  ): Promise<number> {
    const key = this.buildMetricKey('histogram', metric, labels);
    const values = await this.redis.getClient()?.zrange(key, 0, -1);

    if (!values || values.length === 0) return 0;

    return values.reduce((acc, val) => acc + parseFloat(val), 0);
  }

  private async calculateErrorRate(tenantId?: string): Promise<number> {
    const tenantFilter = tenantId ? { tenant: tenantId } : {};

    const [successCount, errorCount] = await Promise.all([
      this.getCounterValue('operations_total', { ...tenantFilter, status: 'success' }),
      this.getCounterValue('operations_total', { ...tenantFilter, status: 'error' }),
    ]);

    const total = successCount + errorCount;
    return total > 0 ? (errorCount / total) * 100 : 0;
  }
}
