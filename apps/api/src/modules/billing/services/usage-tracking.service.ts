import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { TenantContextService } from '@/modules/tenant/tenant-context.service';

export interface UsageEvent {
  tenantId: string;
  userId?: string;
  eventType: UsageEventType;
  quantity: number;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export enum UsageEventType {
  API_CALL = 'api_call',
  QUOTE_GENERATION = 'quote_generation',
  FILE_ANALYSIS = 'file_analysis',
  DFM_REPORT = 'dfm_report',
  PDF_GENERATION = 'pdf_generation',
  STORAGE_GB_HOUR = 'storage_gb_hour',
  COMPUTE_SECONDS = 'compute_seconds',
}

export interface UsageSummary {
  tenantId: string;
  period: string; // YYYY-MM format
  events: Record<UsageEventType, number>;
  totalCost: number;
  billingTier: string;
}

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);
  private readonly USAGE_KEY_PREFIX = 'usage';
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async trackUsage(event: Partial<UsageEvent>): Promise<void> {
    try {
      const tenantId = event.tenantId || this.tenantContext.getTenantId();
      const timestamp = event.timestamp || new Date();

      const usageEvent: UsageEvent = {
        tenantId,
        userId: event.userId,
        eventType: event.eventType,
        quantity: event.quantity || 1,
        metadata: event.metadata || {},
        timestamp,
      };

      // Store in Redis for real-time aggregation
      await this.storeInRedis(usageEvent);

      // Queue for persistent storage
      await this.queueForPersistence(usageEvent);

      this.logger.debug(`Tracked usage: ${event.eventType} for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to track usage: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async storeInRedis(event: UsageEvent): Promise<void> {
    const period = this.getCurrentPeriod();
    const key = this.buildUsageKey(event.tenantId, period, event.eventType);

    // Increment usage counter
    await this.redis.incrby(key, event.quantity);

    // Set expiry to 3 months
    await this.redis.expire(key, 90 * 24 * 60 * 60);

    // Store detailed event for recent lookups
    const eventKey = `${this.USAGE_KEY_PREFIX}:events:${event.tenantId}:${period}`;
    await this.redis.lpush(eventKey, JSON.stringify(event));
    await this.redis.ltrim(eventKey, 0, 9999); // Keep last 10k events
    await this.redis.expire(eventKey, 30 * 24 * 60 * 60); // 30 days
  }

  private async queueForPersistence(event: UsageEvent): Promise<void> {
    // Batch events for efficient database writes
    const batchKey = `${this.USAGE_KEY_PREFIX}:batch:${this.getCurrentPeriod()}`;
    await this.redis.lpush(batchKey, JSON.stringify(event));

    const batchSize = await this.redis.llen(batchKey);
    if (batchSize >= this.BATCH_SIZE) {
      await this.flushBatchToDatabase(batchKey);
    }
  }

  private async flushBatchToDatabase(batchKey: string): Promise<void> {
    try {
      const events = await this.redis.lrange(batchKey, 0, this.BATCH_SIZE - 1);
      if (events.length === 0) return;

      const parsedEvents = events.map((e) => JSON.parse(e));

      await this.prisma.usageEvent.createMany({
        data: parsedEvents.map((event) => ({
          tenantId: event.tenantId,
          userId: event.userId,
          eventType: event.eventType,
          quantity: event.quantity,
          metadata: event.metadata,
          timestamp: new Date(event.timestamp),
        })),
      });

      await this.redis.ltrim(batchKey, this.BATCH_SIZE, -1);

      this.logger.debug(`Flushed ${events.length} usage events to database`);
    } catch (error) {
      this.logger.error(`Failed to flush usage batch: ${error.message}`);
    }
  }

  async getUsageSummary(tenantId: string, period?: string): Promise<UsageSummary> {
    const targetPeriod = period || this.getCurrentPeriod();

    // Try Redis first for current period
    if (targetPeriod === this.getCurrentPeriod()) {
      const redisSummary = await this.getUsageFromRedis(tenantId, targetPeriod);
      if (redisSummary) return redisSummary;
    }

    // Fallback to database for historical data
    return this.getUsageFromDatabase(tenantId, targetPeriod);
  }

  private async getUsageFromRedis(tenantId: string, period: string): Promise<UsageSummary | null> {
    try {
      const events: Record<UsageEventType, number> = {} as Record<UsageEventType, number>;

      for (const eventType of Object.values(UsageEventType)) {
        const key = this.buildUsageKey(tenantId, period, eventType);
        const count = await this.redis.get(key);
        events[eventType] = parseInt(String(count) || '0');
      }

      const totalCost = await this.calculateCost(tenantId, events);
      const billingTier = await this.getBillingTier(tenantId);

      return {
        tenantId,
        period,
        events,
        totalCost,
        billingTier,
      };
    } catch (error) {
      this.logger.error(`Failed to get usage from Redis: ${error.message}`);
      return null;
    }
  }

  private async getUsageFromDatabase(tenantId: string, period: string): Promise<UsageSummary> {
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const usage = await this.prisma.usageEvent.groupBy({
      by: ['eventType'],
      where: {
        tenantId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const events: Record<UsageEventType, number> = {} as Record<UsageEventType, number>;

    Object.values(UsageEventType).forEach((eventType) => {
      events[eventType] = 0;
    });

    usage.forEach((item) => {
      events[item.eventType as UsageEventType] = item._sum.quantity || 0;
    });

    const totalCost = await this.calculateCost(tenantId, events);
    const billingTier = await this.getBillingTier(tenantId);

    return {
      tenantId,
      period,
      events,
      totalCost,
      billingTier,
    };
  }

  private async calculateCost(
    tenantId: string,
    events: Record<UsageEventType, number>,
  ): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) {
      return 0;
    }

    let totalCost = 0;
    const overageRates = tenant.billingPlan.overageRates as Record<string, number>;
    const includedQuotas = tenant.billingPlan.includedQuotas as Record<string, number>;

    Object.entries(events).forEach(([eventType, quantity]) => {
      const included = includedQuotas[eventType] || 0;
      const overage = Math.max(0, quantity - included);
      const unitPrice = overageRates[eventType] || 0;
      totalCost += overage * unitPrice;
    });

    return totalCost;
  }

  private async getBillingTier(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    return tenant?.billingPlan?.name || 'free';
  }

  async trackApiCall(endpoint: string, method: string, responseTime: number): Promise<void> {
    const _tenantId = this.tenantContext.getTenantId();

    await this.trackUsage({
      eventType: UsageEventType.API_CALL,
      quantity: 1,
      metadata: {
        endpoint,
        method,
        responseTime,
      },
    });
  }

  async trackFileAnalysis(
    fileSize: number,
    analysisType: string,
    processingTime: number,
  ): Promise<void> {
    await this.trackUsage({
      eventType: UsageEventType.FILE_ANALYSIS,
      quantity: 1,
      metadata: {
        fileSize,
        analysisType,
        processingTime,
        computeSeconds: Math.ceil(processingTime / 1000),
      },
    });

    // Track compute time separately for granular billing
    await this.trackUsage({
      eventType: UsageEventType.COMPUTE_SECONDS,
      quantity: Math.ceil(processingTime / 1000),
      metadata: {
        fileSize,
        analysisType,
      },
    });
  }

  async trackQuoteGeneration(quoteValue: number, itemCount: number): Promise<void> {
    await this.trackUsage({
      eventType: UsageEventType.QUOTE_GENERATION,
      quantity: 1,
      metadata: {
        quoteValue,
        itemCount,
      },
    });
  }

  private buildUsageKey(tenantId: string, period: string, eventType: UsageEventType): string {
    return `${this.USAGE_KEY_PREFIX}:${tenantId}:${period}:${eventType}`;
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async resetUsage(tenantId: string, period?: string): Promise<void> {
    const targetPeriod = period || this.getCurrentPeriod();

    // Clear Redis counters
    for (const eventType of Object.values(UsageEventType)) {
      const key = this.buildUsageKey(tenantId, targetPeriod, eventType);
      await this.redis.del(key);
    }

    // Clear event history
    const eventKey = `${this.USAGE_KEY_PREFIX}:events:${tenantId}:${targetPeriod}`;
    await this.redis.del(eventKey);

    this.logger.log(`Reset usage for tenant ${tenantId}, period ${targetPeriod}`);
  }

  async getCurrentMonthUsage(tenantId: string): Promise<Record<UsageEventType, number>> {
    const currentPeriod = new Date().toISOString().substring(0, 7); // YYYY-MM
    const summary = await this.getUsageSummary(tenantId, currentPeriod);
    return summary.events;
  }

  async getTenantLimits(tenantId: string): Promise<Record<UsageEventType, number>> {
    // Get tenant's billing plan limits
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) {
      // Return default limits if no billing plan
      return {
        [UsageEventType.API_CALL]: 1000,
        [UsageEventType.QUOTE_GENERATION]: 100,
        [UsageEventType.FILE_ANALYSIS]: 50,
        [UsageEventType.DFM_REPORT]: 25,
        [UsageEventType.PDF_GENERATION]: 100,
        [UsageEventType.STORAGE_GB_HOUR]: 10,
        [UsageEventType.COMPUTE_SECONDS]: 3600,
      };
    }

    const includedQuotas = tenant.billingPlan.includedQuotas as Record<UsageEventType, number>;
    return includedQuotas;
  }
}
