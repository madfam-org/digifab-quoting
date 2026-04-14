/**
 * Yantra4D Webhook Service
 *
 * Fires webhook notifications to Yantra4D when a quote that originated
 * from Yantra4D reaches a terminal status (ordered, approved, cancelled).
 *
 * The webhook is signed with HMAC-SHA256 via the `x-cotiza-signature` header.
 *
 * Environment:
 *   YANTRA4D_API_URL          -- Base URL of the Yantra4D API
 *   YANTRA4D_WEBHOOK_SECRET   -- HMAC-SHA256 shared secret
 *   YANTRA4D_WEBHOOK_TIMEOUT  -- HTTP timeout in ms (default: 10000)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface Yantra4dWebhookPayload {
  event_type: 'quote.completed' | 'quote.approved' | 'quote.cancelled';
  quote_id: string;
  quote_number: string;
  project_slug: string;
  status: string;
  total_amount: number;
  currency: string;
  timestamp: string;
}

@Injectable()
export class Yantra4dWebhookService {
  private readonly logger = new Logger(Yantra4dWebhookService.name);
  private readonly apiUrl: string;
  private readonly secret: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('YANTRA4D_API_URL', '');
    this.secret = this.configService.get<string>('YANTRA4D_WEBHOOK_SECRET', '');
    this.timeout = this.configService.get<number>('YANTRA4D_WEBHOOK_TIMEOUT', 10000);
  }

  /**
   * Check whether a quote originated from Yantra4D by inspecting its metadata.
   */
  isYantra4dQuote(metadata: Record<string, unknown> | null): boolean {
    if (!metadata) return false;
    return metadata.source === 'yantra4d' && typeof metadata.yantra4dProject === 'string';
  }

  /**
   * Extract the Yantra4D project slug from quote metadata.
   */
  getProjectSlug(metadata: Record<string, unknown>): string {
    return metadata.yantra4dProject as string;
  }

  /**
   * Fire a webhook to Yantra4D. This is fire-and-forget -- errors are logged,
   * never thrown, so they cannot disrupt the primary payment/order flow.
   */
  async notify(payload: Yantra4dWebhookPayload): Promise<void> {
    if (!this.apiUrl || !this.secret) {
      this.logger.debug(
        'Yantra4D webhook skipped: YANTRA4D_API_URL or YANTRA4D_WEBHOOK_SECRET not configured',
      );
      return;
    }

    const url = `${this.apiUrl}/api/webhooks/cotiza`;
    const body = JSON.stringify(payload);
    const signature = this.sign(body);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cotiza-signature': signature,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          'Yantra4D webhook returned %d for quote %s (project=%s)',
          response.status,
          payload.quote_id,
          payload.project_slug,
        );
      } else {
        this.logger.log(
          'Yantra4D webhook delivered: event=%s quote=%s project=%s',
          payload.event_type,
          payload.quote_id,
          payload.project_slug,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Yantra4D webhook failed for quote %s (project=%s): %s',
        payload.quote_id,
        payload.project_slug,
        msg,
      );
    }
  }

  /**
   * Compute HMAC-SHA256 hex digest of the payload.
   */
  private sign(body: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(body, 'utf-8')
      .digest('hex');
  }
}
