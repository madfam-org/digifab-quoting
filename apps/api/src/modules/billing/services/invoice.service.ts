import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { UsageTrackingService, UsageEventType } from './usage-tracking.service';
import { PricingTierService } from './pricing-tier.service';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  metadata?: Record<string, unknown>;
}

export interface InvoiceData {
  tenantId: string;
  period: string; // YYYY-MM
  baseFee: number;
  usageCharges: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  dueDate: Date;
  metadata?: Record<string, unknown>;
}

export interface InvoiceGeneration {
  success: boolean;
  invoiceId?: string;
  errors?: string[];
  lineItems?: InvoiceLineItem[];
  totals?: {
    subtotal: number;
    tax: number;
    total: number;
  };
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly usageTracking: UsageTrackingService,
    private readonly _pricingTier: PricingTierService,
  ) {}

  async generateInvoice(tenantId: string, period: string): Promise<InvoiceGeneration> {
    try {
      // Get tenant and billing plan
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { billingPlan: true },
      });

      if (!tenant) {
        return { success: false, errors: ['Tenant not found'] };
      }

      if (!tenant.billingPlan) {
        return { success: false, errors: ['No billing plan configured'] };
      }

      // Calculate period dates
      const [year, month] = period.split('-').map(Number);
      const _unused_periodStart = new Date(year, month - 1, 1);
      const _unused_periodEnd = new Date(year, month, 0);

      // Get usage data for the period
      const usage = await this.usageTracking.getUsageSummary(tenantId, period);
      const usageEvents = usage.events || {};

      // Calculate base fee
      const plan = tenant.billingPlan;
      const baseFee = Number(plan.monthlyPrice) || 0;

      // Calculate usage charges
      const usageCharges: InvoiceLineItem[] = [];
      let usageTotal = 0;

      for (const [eventType, quantity] of Object.entries(usageEvents)) {
        if (quantity === 0) continue;

        const includedQuota = (plan.includedQuotas as any)[eventType] || 0;
        const overageQuantity = Math.max(0, Number(quantity) - Number(includedQuota));

        if (overageQuantity > 0) {
          const overageRate = (plan.overageRates as any)[eventType] || 0;
          const overageTotal = overageQuantity * overageRate;

          usageCharges.push({
            description: `${this.getEventTypeLabel(eventType as UsageEventType)} overage (${overageQuantity} units)`,
            quantity: overageQuantity,
            unitPrice: overageRate,
            total: overageTotal,
            metadata: {
              eventType,
              includedQuota,
              totalUsage: quantity,
            },
          });

          usageTotal += overageTotal;
        }
      }

      // Calculate totals
      const subtotal = baseFee + usageTotal;
      const taxRate = 0.08; // 8% tax rate - would be configurable per tenant/region
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      // Check if invoice already exists
      const existingInvoice = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          period,
        },
      });

      let invoiceId: string;

      if (existingInvoice) {
        // Update existing invoice
        const updated = await this.prisma.invoice.update({
          where: { id: existingInvoice.id },
          data: {
            baseFee,
            usageCost: usageTotal,
            totalAmount: total,
            metadata: JSON.stringify({
              lineItems: usageCharges,
              generatedAt: new Date().toISOString(),
              planId: plan.id,
            }) as any,
          },
        });
        invoiceId = updated.id;
      } else {
        // Create new invoice
        const invoice = await this.prisma.invoice.create({
          data: {
            tenantId,
            period,
            baseFee,
            usageCost: usageTotal,
            totalAmount: total,
            currency: tenant.defaultCurrency,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            metadata: JSON.stringify({
              lineItems: usageCharges,
              generatedAt: new Date().toISOString(),
              planId: plan.id,
            }) as any,
          },
        });
        invoiceId = invoice.id;
      }

      // Cache invoice data for quick access
      const cacheKey = `invoice:${tenantId}:${period}`;
      await this.redis.set(
        cacheKey,
        JSON.stringify({
          invoiceId,
          baseFee,
          usageCharges,
          subtotal,
          tax,
          total,
        }),
        30 * 24 * 60 * 60,
      ); // 30 days

      this.logger.log(`Generated invoice ${invoiceId} for tenant ${tenantId}, period ${period}`);

      return {
        success: true,
        invoiceId,
        lineItems: [
          {
            description: 'Monthly Plan Fee',
            quantity: 1,
            unitPrice: baseFee,
            total: baseFee,
          },
          ...usageCharges,
        ],
        totals: { subtotal, tax, total },
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate invoice for tenant ${tenantId}: ${error.message}`,
        error,
      );
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<any> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
      },
    });

    if (!invoice) {
      return null;
    }

    return {
      id: invoice.id,
      period: invoice.period,
      baseFee: invoice.baseFee,
      usageCost: invoice.usageCost,
      total: Number(invoice.totalAmount || 0),
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      lineItems: (invoice.metadata as any)?.lineItems || [],
    };
  }

  async listInvoices(tenantId: string, limit: number = 50): Promise<any[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      period: invoice.period,
      total: Number(invoice.totalAmount || 0),
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
    }));
  }

  async markInvoicePaid(invoiceId: string): Promise<boolean> {
    try {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'paid',
          paidAt: new Date(),
        },
      });

      this.logger.log(`Marked invoice ${invoiceId} as paid`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to mark invoice ${invoiceId} as paid: ${error.message}`);
      return false;
    }
  }

  async processOverdueInvoices(): Promise<{ processed: number; errors: string[] }> {
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 30); // 30 days overdue

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'pending',
        dueDate: { lt: overdueDate },
      },
    });

    let processed = 0;
    const errors: string[] = [];

    for (const invoice of overdueInvoices) {
      try {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'overdue' },
        });
        processed++;

        // Send overdue notification (would integrate with email service)
        this.logger.warn(`Invoice ${invoice.id} is overdue for tenant ${invoice.tenantId}`);
      } catch (error) {
        errors.push(`Failed to process overdue invoice ${invoice.id}: ${error.message}`);
      }
    }

    return { processed, errors };
  }

  async getInvoicesByStatus(status: string, limit: number = 100): Promise<any[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        tenant: {
          select: { name: true, code: true },
        },
      },
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      tenantId: invoice.tenantId,
      tenantName: invoice.tenant?.name,
      tenantCode: invoice.tenant?.code,
      period: invoice.period,
      total: Number(invoice.totalAmount || 0),
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
    }));
  }

  async calculateProjectedRevenue(tenantIds?: string[]): Promise<{
    thisMonth: number;
    nextMonth: number;
    recurring: number;
    usage: number;
  }> {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const _unused_nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const where: any = {};
    if (tenantIds) {
      where.tenantId = { in: tenantIds };
    }

    const [thisMonthInvoices, _unused_activeTenantsCount] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { ...where, period: thisMonth },
      }),
      this.prisma.tenant.count({
        where: {
          active: true,
          ...(tenantIds && { id: { in: tenantIds } }),
        },
      }),
    ]);

    // Calculate current month revenue
    const thisMonthRevenue = thisMonthInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount || 0),
      0,
    );

    // Estimate next month (assumes similar usage patterns)
    const recurringRevenue = thisMonthInvoices.reduce(
      (sum, inv) => sum + Number(inv.baseFee || 0),
      0,
    );
    const usageRevenue = thisMonthInvoices.reduce(
      (sum, inv) => sum + Number(inv.usageCost || 0),
      0,
    );

    // Project based on growth
    const projectedNextMonth = recurringRevenue + usageRevenue * 1.1; // 10% usage growth

    return {
      thisMonth: thisMonthRevenue,
      nextMonth: projectedNextMonth,
      recurring: recurringRevenue,
      usage: usageRevenue,
    };
  }

  private getEventTypeLabel(eventType: UsageEventType): string {
    const labels: Record<UsageEventType, string> = {
      [UsageEventType.API_CALL]: 'API Calls',
      [UsageEventType.QUOTE_GENERATION]: 'Quote Generations',
      [UsageEventType.FILE_ANALYSIS]: 'File Analyses',
      [UsageEventType.DFM_REPORT]: 'DFM Reports',
      [UsageEventType.PDF_GENERATION]: 'PDF Generations',
      [UsageEventType.STORAGE_GB_HOUR]: 'Storage GB-Hours',
      [UsageEventType.COMPUTE_SECONDS]: 'Compute Seconds',
    };

    return labels[eventType] || eventType;
  }
}
