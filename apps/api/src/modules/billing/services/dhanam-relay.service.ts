import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Dhanam Billing Relay Service
 *
 * Fire-and-forget webhook relay that forwards payment events from Cotiza
 * (digifab-quoting) to Dhanam's billing system. This enables Dhanam to
 * maintain a unified financial view across MADFAM ecosystem products.
 *
 * ## Architecture
 * ```
 * Cotiza Payment Event
 *   → BillingService handler
 *     → DhanamRelayService.relay()  (non-blocking)
 *       → POST /api/v1/webhooks/cotiza  (Dhanam)
 * ```
 *
 * ## Security
 * - Payloads are signed with HMAC-SHA256 using a shared secret
 * - Signature sent via `x-cotiza-signature` header
 * - Dhanam verifies before processing
 *
 * ## Reliability
 * - Non-blocking: relay errors are logged but never fail the calling operation
 * - Configurable timeout to prevent upstream latency from propagating
 * - Service gracefully degrades when DHANAM_WEBHOOK_URL is not configured
 *
 * ## Configuration
 * - `DHANAM_WEBHOOK_URL`: Full URL of Dhanam's Cotiza webhook endpoint
 *   (e.g., https://api.dhan.am/v1/webhooks/cotiza)
 * - `DHANAM_WEBHOOK_SECRET`: HMAC-SHA256 shared secret for payload signing
 */
@Injectable()
export class DhanamRelayService {
  private readonly logger = new Logger(DhanamRelayService.name);
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.webhookUrl = this.config.get<string>('DHANAM_WEBHOOK_URL', '');
    this.webhookSecret = this.config.get<string>('DHANAM_WEBHOOK_SECRET', '');
    this.timeoutMs = this.config.get<number>('DHANAM_WEBHOOK_TIMEOUT_MS', 5000);
    this.enabled = !!this.webhookUrl && !!this.webhookSecret;

    if (this.enabled) {
      this.logger.log(`Dhanam billing relay initialized -> ${this.webhookUrl}`);
    } else {
      this.logger.warn(
        'Dhanam billing relay disabled: DHANAM_WEBHOOK_URL or DHANAM_WEBHOOK_SECRET not set',
      );
    }
  }

  /**
   * Check whether the relay is configured and active.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Compute HMAC-SHA256 signature for a payload string.
   *
   * Uses the shared secret from DHANAM_WEBHOOK_SECRET.
   * Dhanam verifies this signature before processing.
   */
  private sign(payload: string): string {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Relay a payment event to Dhanam.
   *
   * This method is intentionally fire-and-forget. It catches all errors
   * internally so the calling payment handler is never impacted by
   * downstream Dhanam availability.
   *
   * @param eventType - The Cotiza billing event type (e.g., 'payment.succeeded')
   * @param data - Event payload to forward
   */
  async relay(
    eventType: string,
    data: {
      tenantId: string;
      quoteId?: string;
      invoiceId?: string;
      amount?: number;
      currency?: string;
      provider?: string;
      customerId?: string;
      subscriptionId?: string;
      planId?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      source_app: 'cotiza',
      data: {
        tenant_id: data.tenantId,
        quote_id: data.quoteId,
        invoice_id: data.invoiceId,
        amount: data.amount,
        currency: data.currency,
        provider: data.provider,
        customer_id: data.customerId,
        subscription_id: data.subscriptionId,
        plan_id: data.planId,
        status: data.status,
        metadata: data.metadata,
      },
    });

    const signature = this.sign(payload);

    // Fire-and-forget: do not await in the calling context
    this.sendWebhook(payload, signature).catch((err) => {
      this.logger.error(
        `Dhanam relay failed for ${eventType}: ${err.message}`,
        err.stack,
      );
    });
  }

  /**
   * Perform the actual HTTP POST to Dhanam.
   *
   * Isolated in its own method so the fire-and-forget pattern in relay()
   * remains clean and testable.
   */
  private async sendWebhook(payload: string, signature: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cotiza-signature': signature,
          'User-Agent': 'Cotiza-BillingRelay/1.0',
        },
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>');
        this.logger.warn(
          `Dhanam webhook returned HTTP ${response.status}: ${body}`,
        );
      } else {
        this.logger.debug(`Dhanam relay delivered: ${JSON.parse(payload).type}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
