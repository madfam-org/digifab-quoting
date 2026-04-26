import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Janua Billing Service for Digifab-Quoting
 *
 * Integrates with Janua's multi-provider billing system:
 * - Conekta for Mexico (SPEI, cards, CFDI, facturación)
 * - Polar.sh for international digital products
 * - Stripe as fallback for legacy customers
 *
 * Digifab-specific billing considerations:
 * - B2B manufacturing quotes (higher transaction values)
 * - CFDI requirements for Mexican business customers
 * - Multi-currency support (MXN, USD primarily)
 */
@Injectable()
export class JanuaBillingService {
  private readonly logger = new Logger(JanuaBillingService.name);
  private readonly januaApiUrl: string;
  private readonly januaApiKey: string;
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    this.januaApiUrl = this.config.get<string>('JANUA_API_URL', 'http://janua-api:8001');
    this.januaApiKey = this.config.get<string>('JANUA_API_KEY', '');
    this.enabled = this.config.get<boolean>('JANUA_BILLING_ENABLED', true);

    if (this.enabled && this.januaApiKey) {
      this.logger.log('Janua billing service initialized for Digifab-Quoting');
    } else {
      this.logger.warn('Janua billing disabled - falling back to direct Stripe');
    }
  }

  /**
   * Check if Janua billing is available
   */
  isEnabled(): boolean {
    return this.enabled && !!this.januaApiKey;
  }

  /**
   * Determine the best payment provider for a country
   * Manufacturing/B2B context - prioritize invoice/SPEI for Mexico
   */
  getProviderForCountry(countryCode: string): 'conekta' | 'polar' | 'stripe' {
    // Mexico → Conekta (supports SPEI for large B2B transactions, CFDI)
    if (countryCode === 'MX') {
      return 'conekta';
    }

    // International → Polar.sh (handles tax compliance as MoR)
    return 'polar';
  }

  /**
   * Get supported payment methods for a country
   * B2B manufacturing context may prefer bank transfers
   */
  getPaymentMethods(countryCode: string): string[] {
    if (countryCode === 'MX') {
      return ['card', 'spei', 'oxxo']; // SPEI preferred for B2B
    }
    return ['card'];
  }

  /**
   * Create a customer via Janua's unified API
   */
  async createCustomer(params: {
    email: string;
    name?: string;
    companyName?: string;
    taxId?: string; // RFC for Mexico
    countryCode: string;
    metadata?: Record<string, string>;
  }): Promise<{ customerId: string; provider: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const provider = this.getProviderForCountry(params.countryCode);

    const response = await fetch(`${this.januaApiUrl}/api/billing/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        email: params.email,
        name: params.name,
        company_name: params.companyName,
        tax_id: params.taxId, // RFC for Mexican CFDI
        country_code: params.countryCode,
        provider,
        metadata: {
          ...params.metadata,
          product: 'digifab-quoting',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Janua customer creation failed: ${error}`);
      throw new Error(`Failed to create customer: ${error}`);
    }

    const data = await response.json();
    this.logger.log(`Created customer via Janua (${provider}): ${data.customer_id}`);

    return {
      customerId: data.customer_id,
      provider,
    };
  }

  /**
   * Create a payment session for a quote
   * Supports one-time payments for manufacturing quotes
   */
  async createQuotePaymentSession(params: {
    customerId: string;
    customerEmail: string;
    quoteId: string;
    amount: number; // in smallest currency unit (cents/centavos)
    currency: string;
    countryCode: string;
    description: string;
    lineItems: Array<{
      name: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ checkoutUrl: string; sessionId: string; provider: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const provider = this.getProviderForCountry(params.countryCode);

    const response = await fetch(`${this.januaApiUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        customer_email: params.customerEmail,
        mode: 'payment', // One-time payment for quotes
        amount: params.amount,
        currency: params.currency,
        country_code: params.countryCode,
        provider,
        description: params.description,
        line_items: params.lineItems,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          ...params.metadata,
          quote_id: params.quoteId,
          product: 'digifab-quoting',
        },
        // Mexican B2B: Enable CFDI data collection
        collect_tax_id: params.countryCode === 'MX',
        payment_method_types: this.getPaymentMethods(params.countryCode),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Janua checkout creation failed: ${error}`);
      throw new Error(`Failed to create checkout: ${error}`);
    }

    const data = await response.json();
    this.logger.log(`Created payment session via Janua (${provider}) for quote ${params.quoteId}`);

    return {
      checkoutUrl: data.checkout_url,
      sessionId: data.session_id,
      provider,
    };
  }

  /**
   * Create a subscription checkout for SaaS tier
   */
  async createSubscriptionCheckout(params: {
    customerId: string;
    customerEmail: string;
    planId: string;
    countryCode: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ checkoutUrl: string; sessionId: string; provider: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const provider = this.getProviderForCountry(params.countryCode);

    const response = await fetch(`${this.januaApiUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        customer_email: params.customerEmail,
        mode: 'subscription',
        plan_id: `digifab_${params.planId}`,
        country_code: params.countryCode,
        provider,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          ...params.metadata,
          product: 'digifab-quoting',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Janua subscription checkout failed: ${error}`);
      throw new Error(`Failed to create subscription checkout: ${error}`);
    }

    const data = await response.json();
    this.logger.log(`Created subscription checkout via Janua (${provider})`);

    return {
      checkoutUrl: data.checkout_url,
      sessionId: data.session_id,
      provider,
    };
  }

  /**
   * Create a subscription via Janua
   */
  async createSubscription(params: {
    customerId: string;
    planId: string;
    billingCycle: 'monthly' | 'yearly';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ subscriptionId: string; checkoutUrl?: string; provider: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const response = await fetch(`${this.januaApiUrl}/api/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        plan_id: `digifab_${params.planId}_${params.billingCycle}`,
        billing_cycle: params.billingCycle,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          ...params.metadata,
          product: 'digifab-quoting',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Janua subscription creation failed: ${error}`);
      throw new Error(`Failed to create subscription: ${error}`);
    }

    const data = await response.json();
    this.logger.log(`Created subscription via Janua: ${data.subscription_id}`);

    return {
      subscriptionId: data.subscription_id,
      checkoutUrl: data.checkout_url,
      provider: data.provider,
    };
  }

  /**
   * Create an invoice via Janua
   */
  async createInvoice(params: {
    customerId: string;
    amount: number; // in smallest currency unit (cents/centavos)
    currency: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<{ invoiceId: string; provider: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const response = await fetch(`${this.januaApiUrl}/api/billing/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        metadata: {
          ...params.metadata,
          product: 'digifab-quoting',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Janua invoice creation failed: ${error}`);
      throw new Error(`Failed to create invoice: ${error}`);
    }

    const data = await response.json();
    this.logger.log(`Created invoice via Janua: ${data.invoice_id}`);

    return {
      invoiceId: data.invoice_id,
      provider: data.provider,
    };
  }

  /**
   * Create a billing portal session
   */
  async createPortalSession(params: {
    customerId: string;
    countryCode: string;
    returnUrl: string;
  }): Promise<{ portalUrl: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const provider = this.getProviderForCountry(params.countryCode);

    const response = await fetch(`${this.januaApiUrl}/api/billing/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        customer_id: params.customerId,
        provider,
        return_url: params.returnUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Janua portal creation failed: ${error}`);
      throw new Error(`Failed to create portal session: ${error}`);
    }

    const data = await response.json();
    return { portalUrl: data.portal_url };
  }

  /**
   * Request CFDI (Mexican tax invoice) for a payment
   */
  async requestCFDI(params: {
    paymentId: string;
    rfc: string;
    razonSocial: string;
    usoCfdi: string;
    regimenFiscal: string;
    codigoPostal: string;
  }): Promise<{ cfdiId: string; status: string }> {
    if (!this.isEnabled()) {
      throw new Error('Janua billing not enabled');
    }

    const response = await fetch(`${this.januaApiUrl}/api/billing/cfdi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.januaApiKey}`,
      },
      body: JSON.stringify({
        payment_id: params.paymentId,
        rfc: params.rfc,
        razon_social: params.razonSocial,
        uso_cfdi: params.usoCfdi,
        regimen_fiscal: params.regimenFiscal,
        codigo_postal: params.codigoPostal,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`CFDI request failed: ${error}`);
      throw new Error(`Failed to request CFDI: ${error}`);
    }

    const data = await response.json();
    this.logger.log(`CFDI requested for payment ${params.paymentId}: ${data.cfdi_id}`);

    return {
      cfdiId: data.cfdi_id,
      status: data.status,
    };
  }

  /**
   * Verify webhook signature from Janua
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const webhookSecret = this.config.get<string>('JANUA_WEBHOOK_SECRET', '');

    if (!webhookSecret) {
      this.logger.warn('JANUA_WEBHOOK_SECRET not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  /**
   * Get localized pricing for plans
   */
  async getLocalizedPricing(countryCode: string): Promise<{
    currency: string;
    plans: Array<{
      id: string;
      name: string;
      monthlyPrice: number;
      yearlyPrice: number;
      features: string[];
    }>;
  }> {
    const isMexico = countryCode === 'MX';
    const currency = isMexico ? 'MXN' : 'USD';

    // Digifab pricing tiers for manufacturing quoting platform
    return {
      currency,
      plans: [
        {
          id: 'starter',
          name: 'Starter',
          monthlyPrice: isMexico ? 999 : 59,
          yearlyPrice: isMexico ? 9990 : 590,
          features: ['50 quotes/month', '5 materials', 'Basic pricing calculator', 'Email support'],
        },
        {
          id: 'professional',
          name: 'Professional',
          monthlyPrice: isMexico ? 2499 : 149,
          yearlyPrice: isMexico ? 24990 : 1490,
          features: [
            '500 quotes/month',
            'Unlimited materials',
            'Advanced pricing rules',
            'API access',
            'Priority support',
          ],
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          monthlyPrice: isMexico ? 7999 : 449,
          yearlyPrice: isMexico ? 79990 : 4490,
          features: [
            'Unlimited quotes',
            'Custom materials library',
            'White-label embedding',
            'Dedicated account manager',
            'SLA guarantee',
            'CFDI automation',
          ],
        },
      ],
    };
  }
}
