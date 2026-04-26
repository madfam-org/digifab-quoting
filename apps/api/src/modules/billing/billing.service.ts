import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UsageTrackingService, UsageEventType } from './services/usage-tracking.service';
import { PricingTierService } from './services/pricing-tier.service';
import { JanuaBillingService } from './services/janua-billing.service';
// NOTE: All payment processing now goes through Janua Payment Gateway
// Direct Stripe usage removed - Janua handles provider routing (Conekta, Stripe, Polar)

export interface UsageLimit {
  eventType: UsageEventType;
  limit: number;
  used: number;
  remaining: number;
  overageRate: number;
}

export interface CostEstimate {
  baseCost: number;
  overageCost: number;
  totalCost: number;
  breakdown: Record<UsageEventType, { quantity: number; cost: number; overage?: number }>;
  recommendedTier?: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  period: string;
  baseFee: number;
  usageCost: number;
  totalAmount: number;
  status: 'pending' | 'paid' | 'overdue' | 'failed';
  dueDate: Date;
  paidAt?: Date;
  stripeInvoiceId?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageTracking: UsageTrackingService,
    private readonly pricingTierService: PricingTierService,
    private readonly januaBilling: JanuaBillingService,
  ) {}

  /**
   * Get localized pricing based on country
   * Uses Janua for multi-provider pricing (Conekta for MX, Polar for international)
   */
  async getLocalizedPricing(countryCode: string = 'US') {
    if (this.januaBilling.isEnabled()) {
      return this.januaBilling.getLocalizedPricing(countryCode);
    }
    // Fallback to USD pricing
    return this.januaBilling.getLocalizedPricing('US');
  }

  /**
   * Create checkout for quote payment via Janua Payment Gateway
   * Routes to appropriate provider based on country (Conekta for MX, Stripe/Polar for others)
   */
  async createQuoteCheckout(
    tenantId: string,
    quoteId: string,
    countryCode: string = 'US',
  ): Promise<{ checkoutUrl: string; provider: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { quotes: { where: { id: quoteId } } },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const quote = tenant.quotes?.[0];
    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    // Ensure Janua is enabled
    if (!this.januaBilling.isEnabled()) {
      throw new BadRequestException(
        'Payment gateway not configured. Please set JANUA_API_URL and JANUA_API_KEY.',
      );
    }

    // Get or create Janua customer
    let customerId = tenant.januaCustomerId;

    if (!customerId) {
      const result = await this.januaBilling.createCustomer({
        email: tenant.email,
        name: tenant.name,
        companyName: tenant.companyName,
        taxId: tenant.taxId, // RFC for Mexico
        countryCode,
      });
      customerId = result.customerId;

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          januaCustomerId: customerId,
          billingProvider: result.provider,
          countryCode,
        },
      });
    }

    const webUrl = process.env.WEB_URL || 'http://localhost:3000';
    const result = await this.januaBilling.createQuotePaymentSession({
      customerId,
      customerEmail: tenant.email,
      quoteId,
      // Decimal (Prisma) -> number before arithmetic; schema is `totalPrice: Decimal?`.
      amount: Math.round(Number(quote.totalPrice ?? 0) * 100), // Convert to cents/centavos
      currency: countryCode === 'MX' ? 'MXN' : 'USD',
      countryCode,
      description: `Quote #${quote.number}`,
      lineItems: [], // Could populate from quote line items
      successUrl: `${webUrl}/quotes/${quoteId}/success`,
      cancelUrl: `${webUrl}/quotes/${quoteId}`,
      metadata: { tenantId },
    });

    return {
      checkoutUrl: result.checkoutUrl,
      provider: result.provider,
    };
  }

  async getUsageLimits(tenantId: string): Promise<UsageLimit[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) {
      throw new BadRequestException('No billing plan found for tenant');
    }

    const includedQuotas = tenant.billingPlan.includedQuotas as Record<UsageEventType, number>;
    const overageRates = tenant.billingPlan.overageRates as Record<UsageEventType, number>;

    const currentUsage = await this.usageTracking.getUsageSummary(tenantId);

    const limits: UsageLimit[] = [];

    Object.values(UsageEventType).forEach((eventType) => {
      const limit = includedQuotas[eventType] || 0;
      const used = currentUsage.events[eventType] || 0;
      const remaining = Math.max(0, limit - used);
      const overageRate = overageRates[eventType] || 0;

      limits.push({
        eventType,
        limit,
        used,
        remaining,
        overageRate,
      });
    });

    return limits;
  }

  async upgradeTier(
    tenantId: string,
    tierName: string,
    billingCycle: 'monthly' | 'yearly',
  ): Promise<{ subscriptionId: string; checkoutUrl?: string }> {
    const tier = await this.pricingTierService.getTier(tierName);
    if (!tier) {
      throw new BadRequestException(`Pricing tier '${tierName}' not found`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Calculate prorated amount if upgrading mid-cycle
    const amount = billingCycle === 'yearly' ? tier.yearlyPrice : tier.monthlyPrice;

    if (amount > 0) {
      // Use Janua for subscription management
      if (!this.januaBilling.isEnabled()) {
        throw new BadRequestException(
          'Payment gateway not configured. Please set JANUA_API_URL and JANUA_API_KEY.',
        );
      }

      // Get or create Janua customer
      let customerId = tenant.januaCustomerId;
      if (!customerId) {
        const customerResult = await this.januaBilling.createCustomer({
          email: tenant.email,
          name: tenant.name,
          companyName: tenant.companyName,
          countryCode: tenant.countryCode || 'US',
        });
        customerId = customerResult.customerId;

        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            januaCustomerId: customerId,
            billingProvider: customerResult.provider,
          },
        });
      }

      // Create subscription via Janua
      const webUrl = process.env.WEB_URL || 'http://localhost:3000';
      const subscription = await this.januaBilling.createSubscription({
        customerId,
        planId: tierName,
        billingCycle,
        successUrl: `${webUrl}/billing/success`,
        cancelUrl: `${webUrl}/billing`,
        metadata: {
          tenantId,
          tierName,
          billingCycle,
        },
      });

      // Update tenant billing plan
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          billingPlanId: tier.id,
          billingProvider: subscription.provider,
        },
      });

      return {
        subscriptionId: subscription.subscriptionId,
        checkoutUrl: subscription.checkoutUrl,
      };
    } else {
      // Free tier - just update the plan
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          billingPlanId: tier.id,
        },
      });

      return {
        subscriptionId: 'free',
      };
    }
  }

  async getInvoices(tenantId: string, limit: number = 20, offset: number = 0): Promise<Invoice[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      tenantId: invoice.tenantId,
      period: invoice.period,
      baseFee: invoice.baseFee ? Number(invoice.baseFee) : 0,
      usageCost: invoice.usageCost ? Number(invoice.usageCost) : 0,
      totalAmount: Number(invoice.totalAmount),
      status: invoice.status as Invoice['status'],
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt || undefined,
      stripeInvoiceId: invoice.stripeInvoiceId || undefined,
    }));
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<Invoice | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
      },
    });

    if (!invoice) return null;

    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      period: invoice.period,
      baseFee: invoice.baseFee ? Number(invoice.baseFee) : 0,
      usageCost: invoice.usageCost ? Number(invoice.usageCost) : 0,
      totalAmount: Number(invoice.totalAmount),
      status: invoice.status as Invoice['status'],
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt || undefined,
      stripeInvoiceId: invoice.stripeInvoiceId || undefined,
    };
  }

  async createPaymentSession(tenantId: string, invoiceId: string): Promise<{ sessionUrl: string }> {
    const invoice = await this.getInvoice(tenantId, invoiceId);
    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }

    if (invoice.status === 'paid') {
      throw new BadRequestException('Invoice is already paid');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { take: 1 } },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Ensure Janua is enabled
    if (!this.januaBilling.isEnabled()) {
      throw new BadRequestException(
        'Payment gateway not configured. Please set JANUA_API_URL and JANUA_API_KEY.',
      );
    }

    // Get or create Janua customer
    let customerId = tenant.januaCustomerId;
    const countryCode = tenant.countryCode || 'US';

    if (!customerId) {
      const customerResult = await this.januaBilling.createCustomer({
        email: tenant.users[0]?.email || tenant.email,
        name: tenant.name,
        companyName: tenant.companyName,
        countryCode,
      });
      customerId = customerResult.customerId;

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          januaCustomerId: customerId,
          billingProvider: customerResult.provider,
        },
      });
    }

    const webUrl = process.env.WEB_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const result = await this.januaBilling.createQuotePaymentSession({
      customerId,
      customerEmail: tenant.users[0]?.email || tenant.email,
      quoteId: invoiceId, // Using invoice ID as quote ID for billing context
      amount: Math.round(Number(invoice.totalAmount) * 100), // Convert to cents/centavos
      currency: countryCode === 'MX' ? 'MXN' : 'USD',
      countryCode,
      description: `Invoice for ${invoice.period} - Cotiza Studio`,
      lineItems: [],
      successUrl: `${webUrl}/billing/success?invoice=${invoiceId}`,
      cancelUrl: `${webUrl}/billing/invoices`,
      metadata: {
        tenantId,
        invoiceId,
        type: 'billing_invoice',
      },
    });

    return {
      sessionUrl: result.checkoutUrl,
    };
  }

  async estimateCosts(
    tenantId: string,
    projectedUsage: Record<string, number>,
  ): Promise<CostEstimate> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) {
      throw new BadRequestException('No billing plan found for tenant');
    }

    const includedQuotas = tenant.billingPlan.includedQuotas as Record<UsageEventType, number>;
    const overageRates = tenant.billingPlan.overageRates as Record<UsageEventType, number>;

    const baseCost = Number(tenant.billingPlan.monthlyPrice) || 0;
    let overageCost = 0;
    const breakdown: Record<string, { quantity: number; cost: number; overage?: number }> = {};

    Object.entries(projectedUsage).forEach(([eventTypeStr, quantity]) => {
      const eventType = eventTypeStr as UsageEventType;
      const included = includedQuotas[eventType] || 0;
      const overage = Math.max(0, quantity - included);
      const overageRate = overageRates[eventType] || 0;
      const eventOverageCost = overage * overageRate;

      overageCost += eventOverageCost;

      breakdown[eventType] = {
        quantity,
        cost: eventOverageCost,
        overage: overage > 0 ? overage : undefined,
      };
    });

    const totalCost = baseCost + overageCost;

    // Suggest tier upgrade if significant overage
    let recommendedTier: string | undefined;
    if (overageCost > baseCost * 0.5) {
      const allTiers = await this.pricingTierService.getAllTiers();
      const currentTierIndex = allTiers.findIndex((t) => t.id === tenant.billingPlan!.id);

      if (currentTierIndex >= 0 && currentTierIndex < allTiers.length - 1) {
        recommendedTier = allTiers[currentTierIndex + 1].name;
      }
    }

    return {
      baseCost,
      overageCost,
      totalCost,
      breakdown,
      recommendedTier,
    };
  }

  async generateInvoice(tenantId: string, period: string): Promise<Invoice> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { billingPlan: true },
    });

    if (!tenant?.billingPlan) {
      throw new BadRequestException('No billing plan found for tenant');
    }

    const _unused_usage = await this.usageTracking.getUsageSummary(tenantId, period);
    const overageCost = await this.pricingTierService.calculateOverageCost(tenantId, period);
    const baseFee = Number(tenant.billingPlan.monthlyPrice) || 0;
    const totalAmount = baseFee + overageCost;

    // Check if invoice already exists
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        period,
      },
    });

    if (existingInvoice) {
      return {
        id: existingInvoice.id,
        tenantId: existingInvoice.tenantId,
        period: existingInvoice.period,
        baseFee: existingInvoice.baseFee ? Number(existingInvoice.baseFee) : 0,
        usageCost: existingInvoice.usageCost ? Number(existingInvoice.usageCost) : 0,
        totalAmount: Number(existingInvoice.totalAmount),
        status: existingInvoice.status as Invoice['status'],
        dueDate: existingInvoice.dueDate,
        paidAt: existingInvoice.paidAt || undefined,
        stripeInvoiceId: existingInvoice.stripeInvoiceId || undefined,
      };
    }

    // Create new invoice
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // 30 days payment term

    const countryCode = tenant.countryCode || 'US';
    const currency = countryCode === 'MX' ? 'MXN' : 'USD';

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        period,
        baseFee,
        usageCost: overageCost,
        totalAmount,
        currency,
        status: 'pending',
        dueDate,
      },
    });

    // Create Janua invoice if amount > 0 and Janua is enabled
    if (totalAmount > 0 && this.januaBilling.isEnabled() && tenant.januaCustomerId) {
      try {
        const januaInvoice = await this.januaBilling.createInvoice({
          customerId: tenant.januaCustomerId,
          amount: Math.round(totalAmount * 100), // Convert to cents/centavos
          currency,
          description: `Cotiza Studio Quoting - ${period}`,
          metadata: {
            tenantId,
            invoiceId: invoice.id,
            period,
          },
        });

        // The Invoice model doesn't have a dedicated `januaInvoiceId` column;
        // stash the provider reference in metadata alongside any existing keys.
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            metadata: {
              ...((invoice.metadata as Record<string, unknown> | null) ?? {}),
              januaInvoiceId: januaInvoice.invoiceId,
            },
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to create Janua invoice: ${err.message}`);
        // Continue without Janua invoice - can be created later when payment is attempted
      }
    }

    this.logger.log(
      `Generated invoice for tenant ${tenantId}, period ${period}, amount ${currency} ${totalAmount}`,
    );

    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      period: invoice.period,
      baseFee: invoice.baseFee ? Number(invoice.baseFee) : 0,
      usageCost: invoice.usageCost ? Number(invoice.usageCost) : 0,
      totalAmount: Number(invoice.totalAmount),
      status: invoice.status as Invoice['status'],
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt || undefined,
      stripeInvoiceId: invoice.stripeInvoiceId || undefined,
    };
  }

  // ==========================================
  // Janua Webhook Handlers
  // All payment processing now goes through Janua Payment Gateway
  // ==========================================

  /**
   * Handle Janua subscription created event
   */
  async handleJanuaSubscriptionCreated(payload: any): Promise<void> {
    const { customer_id, subscription_id: _subscription_id, plan_id, provider } = payload.data;

    const tenant = await this.prisma.tenant.findFirst({
      where: { januaCustomerId: customer_id },
    });

    if (!tenant) {
      this.logger.warn(`Tenant not found for Janua customer: ${customer_id}`);
      return;
    }

    // Find the matching pricing tier
    const tier = await this.pricingTierService.getTier(plan_id || 'professional');

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        billingPlanId: tier?.id,
        billingProvider: provider,
      },
    });

    this.logger.log(`Janua subscription created for tenant ${tenant.id} via ${provider}`);
  }

  /**
   * Handle Janua subscription updated event
   */
  async handleJanuaSubscriptionUpdated(payload: any): Promise<void> {
    const { customer_id, plan_id, status } = payload.data;

    const tenant = await this.prisma.tenant.findFirst({
      where: { januaCustomerId: customer_id },
    });

    if (!tenant) {
      this.logger.warn(`Tenant not found for Janua customer: ${customer_id}`);
      return;
    }

    if (status === 'active' && plan_id) {
      const tier = await this.pricingTierService.getTier(plan_id);
      if (tier) {
        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: { billingPlanId: tier.id },
        });
      }
    }

    this.logger.log(`Janua subscription updated for tenant ${tenant.id}: ${status}`);
  }

  /**
   * Handle Janua subscription cancelled event
   */
  async handleJanuaSubscriptionCancelled(payload: any): Promise<void> {
    const { customer_id, provider: _provider } = payload.data;

    const tenant = await this.prisma.tenant.findFirst({
      where: { januaCustomerId: customer_id },
    });

    if (!tenant) {
      this.logger.warn(`Tenant not found for Janua customer: ${customer_id}`);
      return;
    }

    // Downgrade to free tier
    const freeTier = await this.pricingTierService.getTier('free');

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        billingPlanId: freeTier?.id,
      },
    });

    this.logger.log(`Janua subscription cancelled for tenant ${tenant.id}`);
  }

  /**
   * Handle Janua payment succeeded event
   */
  async handleJanuaPaymentSucceeded(payload: any): Promise<void> {
    const { customer_id, amount, currency, provider } = payload.data;

    const tenant = await this.prisma.tenant.findFirst({
      where: { januaCustomerId: customer_id },
    });

    if (!tenant) {
      this.logger.warn(`Tenant not found for Janua customer: ${customer_id}`);
      return;
    }

    // Invoice schema uses `totalAmount` (maps to `total`), requires `period` +
    // `dueDate`, and has no `lineItems` column — fold line-item detail into
    // metadata JSON.
    const now = new Date();
    await this.prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        totalAmount: amount || 0,
        currency: currency || 'USD',
        status: 'paid',
        paidAt: now,
        period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        dueDate: now,
        metadata: {
          lineItems: [{ description: `Subscription payment via ${provider}`, amount: amount || 0 }],
        },
      },
    });

    this.logger.log(`Janua payment succeeded for tenant ${tenant.id}: ${currency} ${amount}`);
  }

  /**
   * Handle Janua payment failed event
   */
  async handleJanuaPaymentFailed(payload: any): Promise<void> {
    const { customer_id, amount, currency, provider } = payload.data;

    const tenant = await this.prisma.tenant.findFirst({
      where: { januaCustomerId: customer_id },
    });

    if (!tenant) {
      this.logger.warn(`Tenant not found for Janua customer: ${customer_id}`);
      return;
    }

    // Same schema alignment as `handleJanuaPaymentSucceeded`: totalAmount +
    // required period/dueDate; lineItems into metadata.
    const failedAt = new Date();
    await this.prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        totalAmount: amount || 0,
        currency: currency || 'USD',
        status: 'failed',
        period: `${failedAt.getUTCFullYear()}-${String(failedAt.getUTCMonth() + 1).padStart(2, '0')}`,
        dueDate: failedAt,
        metadata: {
          lineItems: [
            {
              description: `Failed payment via ${provider}`,
              amount: amount || 0,
            },
          ],
        },
      },
    });

    this.logger.warn(`Janua payment failed for tenant ${tenant.id}`);
  }
}
