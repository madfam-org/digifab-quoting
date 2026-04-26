import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { UsageEventType } from './usage-tracking.service';

export interface MeterReading {
  tenantId: string;
  eventType: UsageEventType;
  value: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface MeterSnapshot {
  tenantId: string;
  period: string; // YYYY-MM
  readings: Record<
    UsageEventType,
    {
      total: number;
      count: number;
      average: number;
      peak: number;
      samples: number;
    }
  >;
  aggregatedAt: Date;
}

@Injectable()
export class MeteringService {
  private readonly logger = new Logger(MeteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async recordMeter(reading: MeterReading): Promise<void> {
    const key = `meter:${reading.tenantId}:${reading.eventType}`;
    const timestamp = Math.floor(reading.timestamp.getTime() / 1000);

    // Store time-series data in Redis
    await Promise.all([
      // Raw meter reading with timestamp
      this.redis.zadd(
        key,
        timestamp,
        JSON.stringify({
          value: reading.value,
          metadata: reading.metadata || {},
        }),
      ),

      // Aggregate counters
      this.redis.hincrby(
        `meter:${reading.tenantId}:daily:${this.getDateKey(reading.timestamp)}`,
        reading.eventType,
        reading.value,
      ),
      this.redis.hincrby(
        `meter:${reading.tenantId}:hourly:${this.getHourKey(reading.timestamp)}`,
        reading.eventType,
        reading.value,
      ),

      // Set expiration (30 days for raw data, 90 days for aggregates)
      this.redis.expire(key, 30 * 24 * 60 * 60),
      this.redis.expire(
        `meter:${reading.tenantId}:daily:${this.getDateKey(reading.timestamp)}`,
        90 * 24 * 60 * 60,
      ),
      this.redis.expire(
        `meter:${reading.tenantId}:hourly:${this.getHourKey(reading.timestamp)}`,
        90 * 24 * 60 * 60,
      ),
    ]);

    // Also persist to database for long-term storage
    await this.persistMeterReading(reading);
  }

  async getMeterReadings(
    tenantId: string,
    eventType: UsageEventType,
    startTime: Date,
    endTime: Date,
  ): Promise<Array<{ timestamp: Date; value: number; metadata?: Record<string, unknown> }>> {
    const key = `meter:${tenantId}:${eventType}`;
    const startTimestamp = Math.floor(startTime.getTime() / 1000);
    const endTimestamp = Math.floor(endTime.getTime() / 1000);

    const results = await this.redis.zrangebyscore(key, startTimestamp, endTimestamp);

    return results.map((result) => {
      const data = JSON.parse(result);
      return {
        timestamp: new Date(data.timestamp * 1000),
        value: data.value,
        metadata: data.metadata,
      };
    });
  }

  async getAggregatedMetrics(
    tenantId: string,
    period: 'hour' | 'day' | 'month',
    startDate: Date,
    endDate: Date,
  ): Promise<Record<UsageEventType, number[]>> {
    const metrics: Record<string, number[]> = {};

    if (period === 'hour') {
      const hours = this.getHoursBetween(startDate, endDate);
      for (const hour of hours) {
        const key = `meter:${tenantId}:hourly:${hour}`;
        const data = await this.redis.hgetall(key);

        for (const [eventType, value] of Object.entries(data)) {
          if (!metrics[eventType]) metrics[eventType] = [];
          metrics[eventType].push(parseInt(String(value)));
        }
      }
    } else if (period === 'day') {
      const days = this.getDaysBetween(startDate, endDate);
      for (const day of days) {
        const key = `meter:${tenantId}:daily:${day}`;
        const data = await this.redis.hgetall(key);

        for (const [eventType, value] of Object.entries(data)) {
          if (!metrics[eventType]) metrics[eventType] = [];
          metrics[eventType].push(parseInt(String(value)));
        }
      }
    }

    return metrics as Record<UsageEventType, number[]>;
  }

  async createSnapshot(tenantId: string, period: string): Promise<MeterSnapshot> {
    const [year, month] = period.split('-');
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0);

    const readings: Record<string, any> = {};

    // Get all usage events for the period
    const usageEvents = await this.prisma.usageEvent.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Aggregate by event type
    for (const event of usageEvents) {
      if (!readings[event.eventType]) {
        readings[event.eventType] = {
          total: 0,
          count: 0,
          values: [],
        };
      }

      readings[event.eventType].total += event.quantity;
      readings[event.eventType].count += 1;
      readings[event.eventType].values.push(event.quantity);
    }

    // Calculate statistics
    const processedReadings: Partial<Record<UsageEventType, any>> = {};
    for (const [eventType, data] of Object.entries(readings)) {
      const values = data.values.sort((a: number, b: number) => a - b);
      processedReadings[eventType as UsageEventType] = {
        total: data.total,
        count: data.count,
        average: data.total / data.count,
        peak: Math.max(...values),
        samples: values.length,
      };
    }

    const snapshot: MeterSnapshot = {
      tenantId,
      period,
      readings: processedReadings as Record<UsageEventType, any>,
      aggregatedAt: new Date(),
    };

    // Store snapshot
    await this.redis.set(
      `meter:snapshot:${tenantId}:${period}`,
      JSON.stringify(snapshot),
      365 * 24 * 60 * 60, // 1 year retention
    );

    return snapshot;
  }

  async getSnapshot(tenantId: string, period: string): Promise<MeterSnapshot | null> {
    const cached = await this.redis.get(`meter:snapshot:${tenantId}:${period}`);
    if (cached) {
      return JSON.parse(String(cached));
    }
    return null;
  }

  async getRealtimeMetrics(tenantId: string): Promise<
    Record<
      UsageEventType,
      {
        current: number;
        rate: number; // per minute
        trend: 'up' | 'down' | 'stable';
      }
    >
  > {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const metrics: Record<string, any> = {};

    for (const eventType of Object.values(UsageEventType)) {
      const [currentMinute, previousMinutes] = await Promise.all([
        this.getMeterReadings(tenantId, eventType, oneMinuteAgo, now),
        this.getMeterReadings(tenantId, eventType, fiveMinutesAgo, oneMinuteAgo),
      ]);

      const currentValue = currentMinute.reduce((sum, r) => sum + r.value, 0);
      const averageValue =
        previousMinutes.length > 0
          ? previousMinutes.reduce((sum, r) => sum + r.value, 0) / 4 // 4 minutes average
          : currentValue;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (currentValue > averageValue * 1.1) trend = 'up';
      else if (currentValue < averageValue * 0.9) trend = 'down';

      metrics[eventType] = {
        current: currentValue,
        rate: currentValue, // Already per minute
        trend,
      };
    }

    return metrics;
  }

  private async persistMeterReading(reading: MeterReading): Promise<void> {
    try {
      await this.prisma.usageEvent.create({
        data: {
          tenantId: reading.tenantId,
          eventType: reading.eventType,
          quantity: reading.value,
          timestamp: reading.timestamp,
          metadata: JSON.stringify(reading.metadata || {}) as any,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to persist meter reading: ${error.message}`, error);
    }
  }

  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private getHourKey(date: Date): string {
    return date.toISOString().split(':')[0]; // YYYY-MM-DDTHH
  }

  private getDaysBetween(start: Date, end: Date): string[] {
    const days: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      days.push(this.getDateKey(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  private getHoursBetween(start: Date, end: Date): string[] {
    const hours: string[] = [];
    const current = new Date(start);
    current.setMinutes(0, 0, 0);

    while (current <= end) {
      hours.push(this.getHourKey(current));
      current.setHours(current.getHours() + 1);
    }

    return hours;
  }
}
