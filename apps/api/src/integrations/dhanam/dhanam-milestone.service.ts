/**
 * Dhanam Milestone Invoicing Integration
 *
 * When a services-mode Cotiza quote with billableType=MILESTONE
 * transitions to ORDERED, fan out one invoice per milestone to Dhanam.
 *
 * HMAC-SHA256 signed body (same pattern as PhyneCRM engagement
 * webhooks). Fire-and-forget: per-milestone, so one failing milestone
 * doesn't stop the others. Retries won't double-create thanks to a
 * deterministic Idempotency-Key per milestone.
 *
 * Environment:
 *   DHANAM_API_URL             Base URL (e.g. https://dhanam.madfam.io)
 *   DHANAM_BILLING_SECRET      HMAC-SHA256 shared secret
 *   DHANAM_WEBHOOK_TIMEOUT     HTTP timeout in ms (default: 10000)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface DhanamMilestoneItem {
  quoteItemId: string;
  milestoneId: string;
  name: string;
  amount: number;
  currency: string;
  dueDate?: string;
}

export interface DhanamMilestoneContext {
  tenantId: string;
  quoteId: string;
  quoteNumber: string;
  customerId: string;
  currency: string;
  engagementId?: string;
  /**
   * Cotiza Order ID (post-acceptance bundle). Stamped onto each Stripe
   * PaymentIntent so Dhanam's ecosystem extractor can pass it through
   * to PhyneCRM's engagement timeline. Absent when invoicing runs from
   * a flow that doesn't materialize an Order row.
   */
  orderId?: string;
  items: DhanamMilestoneItem[];
}

export interface DhanamInvoiceRequest {
  customerId: string;
  amount: number;
  currency: string;
  description: string;
  dueDate?: string;
  /**
   * snake_case so downstream services (Stripe PI metadata, Dhanam's
   * `extractEcosystemMetadata`, Karafiel CFDI mapper) all pick it up
   * without key-case translation. Matches the ecosystem convention
   * used by RouteCraft and other payment producers.
   */
  metadata: {
    cotiza_quote_id: string;
    cotiza_quote_item_id: string;
    milestone_id: string;
    quote_number?: string;
    engagement_id?: string;
    order_id?: string;
    source: 'cotiza';
  };
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

@Injectable()
export class DhanamMilestoneService {
  private readonly logger = new Logger(DhanamMilestoneService.name);
  private readonly apiUrl: string;
  private readonly secret: string;
  private readonly timeout: number;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('DHANAM_API_URL', '');
    this.secret = this.config.get<string>('DHANAM_BILLING_SECRET', '');
    this.timeout = this.config.get<number>('DHANAM_WEBHOOK_TIMEOUT', 10000);
  }

  // Idempotency-Key format (stable across retries).
  static idempotencyKey(quoteItemId: string, milestoneId: string): string {
    return `dhanam-milestone:${quoteItemId}:${milestoneId}`;
  }

  async createInvoicesForMilestones(ctx: DhanamMilestoneContext): Promise<void> {
    if (!this.apiUrl || !this.secret) {
      this.logger.debug(
        'Dhanam milestone invoicing skipped: DHANAM_API_URL or DHANAM_BILLING_SECRET not configured',
      );
      return;
    }

    if (!ctx.items || ctx.items.length === 0) {
      this.logger.debug(
        'Dhanam milestone invoicing skipped: no milestone items for quote=%s',
        ctx.quoteId,
      );
      return;
    }

    // Fire-and-forget per-milestone; one failure doesn't cascade.
    await Promise.allSettled(
      ctx.items.map((item) => this.postInvoice(ctx, item)),
    );
  }

  private async postInvoice(
    ctx: DhanamMilestoneContext,
    item: DhanamMilestoneItem,
  ): Promise<void> {
    const payload: DhanamInvoiceRequest = {
      customerId: ctx.customerId,
      amount: item.amount,
      currency: item.currency || ctx.currency,
      dueDate: item.dueDate,
      description: `${ctx.quoteNumber} — ${item.name}`,
      metadata: {
        cotiza_quote_id: ctx.quoteId,
        cotiza_quote_item_id: item.quoteItemId,
        milestone_id: item.milestoneId,
        quote_number: ctx.quoteNumber,
        engagement_id: ctx.engagementId,
        order_id: ctx.orderId,
        source: 'cotiza',
      },
    };

    const url = `${this.apiUrl.replace(/\/$/, '')}/api/v1/invoices`;
    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    const signature = this.sign(body);
    const idempotencyKey = DhanamMilestoneService.idempotencyKey(
      item.quoteItemId,
      item.milestoneId,
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
          'Idempotency-Key': idempotencyKey,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          'Dhanam invoice creation returned %d for quote=%s milestone=%s',
          response.status,
          ctx.quoteId,
          item.milestoneId,
        );
      } else {
        this.logger.log(
          'Dhanam invoice created: quote=%s milestone=%s amount=%s %s',
          ctx.quoteId,
          item.milestoneId,
          item.amount,
          item.currency || ctx.currency,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Dhanam invoice creation failed (quote=%s milestone=%s): %s',
        ctx.quoteId,
        item.milestoneId,
        msg,
      );
    }
  }

  private sign(body: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(body, 'utf-8')
      .digest('hex');
  }
}
