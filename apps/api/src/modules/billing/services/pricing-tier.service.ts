import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UsageEventType } from './usage-tracking.service';

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  includedQuotas: Record<UsageEventType, number>;
  overageRates: Record<UsageEventType, number>;
  features: string[];
  maxTeamMembers: number;
  apiRateLimit: number;
  supportLevel: 'community' | 'email' | 'priority' | 'white-glove';
  customBranding: boolean;
  whiteLabel: boolean;
  sla: string | null;
}

export interface UsageLimit {
  eventType: UsageEventType;
  limit: number;
  period: 'monthly' | 'daily' | 'hourly';
  enforced: boolean;
}

@Injectable()
export class PricingTierService {
  private readonly logger = new Logger(PricingTierService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTier(tierName: string): Promise<PricingTier | null> {
    const tier = await this.prisma.billingPlan.findUnique({
      where: { name: tierName },
    });

    if (!tier) return null;

    return {
      id: tier.id,
      name: tier.name,
      description: tier.description || '',
      monthlyPrice: Number(tier.monthlyPrice) || 0,
      yearlyPrice: Number(tier.yearlyPrice) || 0,
      includedQuotas: tier.includedQuotas as Record<UsageEventType, number>,
      overageRates: tier.overageRates as Record<UsageEventType, number>,
      features: tier.features as string[],
      maxTeamMembers: tier.maxTeamMembers || 1,
      apiRateLimit: tier.apiRateLimit || 100,
      supportLevel: (tier.supportLevel as any) || 'community',
      customBranding: tier.customBranding || false,
      whiteLabel: tier.whiteLabel || false,
      sla: tier.sla,
    };
  }

  async getAllTiers(): Promise<PricingTier[]> {
    const tiers = await this.prisma.billingPlan.findMany({
      where: { active: true },
      orderBy: { monthlyPrice: 'asc' },
    });

    return tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      description: tier.description || '',
      monthlyPrice: Number(tier.monthlyPrice) || 0,
      yearlyPrice: Number(tier.yearlyPrice) || 0,
      includedQuotas: tier.includedQuotas as Record<UsageEventType, number>,
      overageRates: tier.overageRates as Record<UsageEventType, number>,
      features: tier.features as string[],
      maxTeamMembers: tier.maxTeamMembers || 1,
      apiRateLimit: tier.apiRateLimit || 100,
      supportLevel: (tier.supportLevel as any) || 'community',
      customBranding: tier.customBranding || false,
      whiteLabel: tier.whiteLabel || false,
      sla: tier.sla,
    }));
  }

  async createDefaultTiers(): Promise<void> {
    const defaultTiers: Partial<PricingTier>[] = [
      {
        name: 'free',
        description: 'Perfect for individuals and small projects',
        monthlyPrice: 0,
        yearlyPrice: 0,
        includedQuotas: {
          [UsageEventType.API_CALL]: 1000,
          [UsageEventType.QUOTE_GENERATION]: 10,
          [UsageEventType.FILE_ANALYSIS]: 5,
          [UsageEventType.DFM_REPORT]: 1,
          [UsageEventType.PDF_GENERATION]: 3,
          [UsageEventType.STORAGE_GB_HOUR]: 1,
          [UsageEventType.COMPUTE_SECONDS]: 300,
        },
        overageRates: {
          [UsageEventType.API_CALL]: 0,
          [UsageEventType.QUOTE_GENERATION]: 0,
          [UsageEventType.FILE_ANALYSIS]: 0,
          [UsageEventType.DFM_REPORT]: 0,
          [UsageEventType.PDF_GENERATION]: 0,
          [UsageEventType.STORAGE_GB_HOUR]: 0,
          [UsageEventType.COMPUTE_SECONDS]: 0,
        },
        features: ['Basic quoting', 'File upload', 'Email support'],
        maxTeamMembers: 1,
        apiRateLimit: 10,
        supportLevel: 'community' as const,
        customBranding: false,
        whiteLabel: false,
        sla: null,
      },
      {
        name: 'pro',
        description: 'For growing businesses and teams',
        monthlyPrice: 99,
        yearlyPrice: 990,
        includedQuotas: {
          [UsageEventType.API_CALL]: 10000,
          [UsageEventType.QUOTE_GENERATION]: 500,
          [UsageEventType.FILE_ANALYSIS]: 200,
          [UsageEventType.DFM_REPORT]: 50,
          [UsageEventType.PDF_GENERATION]: 100,
          [UsageEventType.STORAGE_GB_HOUR]: 100,
          [UsageEventType.COMPUTE_SECONDS]: 3600,
        },
        overageRates: {
          [UsageEventType.API_CALL]: 0.01,
          [UsageEventType.QUOTE_GENERATION]: 0.5,
          [UsageEventType.FILE_ANALYSIS]: 1.0,
          [UsageEventType.DFM_REPORT]: 5.0,
          [UsageEventType.PDF_GENERATION]: 0.25,
          [UsageEventType.STORAGE_GB_HOUR]: 0.1,
          [UsageEventType.COMPUTE_SECONDS]: 0.05,
        },
        features: [
          'Advanced quoting',
          'Team collaboration',
          'API access',
          'Advanced analytics',
          'Priority support',
        ],
        maxTeamMembers: 10,
        apiRateLimit: 100,
        supportLevel: 'email' as const,
        customBranding: true,
        whiteLabel: false,
        sla: '99.5% uptime',
      },
      {
        name: 'enterprise',
        description: 'For large organizations with custom needs',
        monthlyPrice: 499,
        yearlyPrice: 4990,
        includedQuotas: {
          [UsageEventType.API_CALL]: 100000,
          [UsageEventType.QUOTE_GENERATION]: 5000,
          [UsageEventType.FILE_ANALYSIS]: 2000,
          [UsageEventType.DFM_REPORT]: 500,
          [UsageEventType.PDF_GENERATION]: 1000,
          [UsageEventType.STORAGE_GB_HOUR]: 1000,
          [UsageEventType.COMPUTE_SECONDS]: 36000,
        },
        overageRates: {
          [UsageEventType.API_CALL]: 0.005,
          [UsageEventType.QUOTE_GENERATION]: 0.25,
          [UsageEventType.FILE_ANALYSIS]: 0.5,
          [UsageEventType.DFM_REPORT]: 2.5,
          [UsageEventType.PDF_GENERATION]: 0.1,
          [UsageEventType.STORAGE_GB_HOUR]: 0.05,
          [UsageEventType.COMPUTE_SECONDS]: 0.02,
        },
        features: [
          'Unlimited quotes',
          'Advanced team features',
          'White-label options',
          'Custom integrations',
          'Dedicated support',
          'SLA guarantee',
          'Advanced security',
        ],
        maxTeamMembers: -1, // unlimited
        apiRateLimit: 1000,
        supportLevel: 'white-glove' as const,
        customBranding: true,
        whiteLabel: true,
        sla: '99.9% uptime with 4-hour response',
      },
    ];

    for (const tierData of defaultTiers) {
      await this.prisma.billingPlan.upsert({
        where: { name: tierData.name! },
        create: {
          name: tierData.name!,
          description: tierData.description!,
          monthlyPrice: tierData.monthlyPrice!,
          yearlyPrice: tierData.yearlyPrice!,
          includedQuotas: tierData.includedQuotas as any,
          overageRates: tierData.overageRates as any,
          features: tierData.features!,
          maxTeamMembers: tierData.maxTeamMembers!,
          apiRateLimit: tierData.apiRateLimit!,
          supportLevel: tierData.supportLevel!,
          customBranding: tierData.customBranding!,
          whiteLabel: tierData.whiteLabel!,
          sla: tierData.sla,
          active: true,
        },
        update: {
          description: tierData.description!,
          monthlyPrice: tierData.monthlyPrice!,
          yearlyPrice: tierData.yearlyPrice!,
          includedQuotas: tierData.includedQuotas as any,
          overageRates: tierData.overageRates as any,
          features: tierData.features!,
          maxTeamMembers: tierData.maxTeamMembers!,
          apiRateLimit: tierData.apiRateLimit!,
          supportLevel: tierData.supportLevel!,
          customBranding: tierData.customBranding!,
          whiteLabel: tierData.whiteLabel!,
          sla: tierData.sla,
        },
      });
    }

    this.logger.log('Created/updated default pricing tiers');
  }

  async checkUsageLimit(
    tenantId: string,
    eventType: UsageEventType,
    requestedQuantity: number = 1,
  ): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) {
      return { allowed: false, remaining: 0, limit: 0 };
    }

    const includedQuotas = tenant.billingPlan.includedQuotas as Record<UsageEventType, number>;
    const limit = includedQuotas[eventType] || 0;

    if (limit <= 0) {
      return { allowed: false, remaining: 0, limit: 0 };
    }

    // Get current usage from database for accuracy
    const currentPeriod = this.getCurrentPeriod();
    const [year, month] = currentPeriod.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const currentUsage = await this.prisma.usageEvent.aggregate({
      where: {
        tenantId,
        eventType,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const used = currentUsage._sum.quantity || 0;
    const remaining = Math.max(0, limit - used);
    const allowed = remaining >= requestedQuantity;

    return { allowed, remaining, limit };
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async calculateOverageCost(tenantId: string, period: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) return 0;

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

    const includedQuotas = tenant.billingPlan.includedQuotas as Record<UsageEventType, number>;
    const overageRates = tenant.billingPlan.overageRates as Record<UsageEventType, number>;

    let totalOverageCost = 0;

    usage.forEach((item) => {
      const eventType = item.eventType as UsageEventType;
      const used = item._sum.quantity || 0;
      const included = includedQuotas[eventType] || 0;
      const overage = Math.max(0, used - included);
      const rate = overageRates[eventType] || 0;

      totalOverageCost += overage * rate;
    });

    return totalOverageCost;
  }
}
