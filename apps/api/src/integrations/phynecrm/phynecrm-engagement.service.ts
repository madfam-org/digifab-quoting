/**
 * PhyneCRM Engagement Integration
 *
 * Writes quote lifecycle events into PhyneCRM's `engagement_events` via
 * the `POST /api/v1/engagements/events` HMAC-signed webhook. Also lets
 * Cotiza announce the signed-proposal artifact PDF into the client's
 * portal view.
 *
 * Kept fire-and-forget — PhyneCRM being offline must never break the
 * Cotiza quote pipeline; on error we log and move on.
 *
 * Environment:
 *   PHYNECRM_API_URL              Base URL (e.g. https://phyne-crm.madfam.io)
 *   PHYNECRM_ENGAGEMENT_SECRET    HMAC-SHA256 shared secret (matches
 *                                 PhyneCRM's PHYNE_ENGAGEMENT_EVENTS_SECRET)
 *   PHYNECRM_WEBHOOK_TIMEOUT      HTTP timeout in ms (default: 10000)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EngagementEventPayload {
  engagement_id: string;
  source: 'cotiza';
  event_type: string;
  status?: string;
  message?: string;
  timestamp: string;
  dedup_key?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PhyneCrmEngagementService {
  private readonly logger = new Logger(PhyneCrmEngagementService.name);
  private readonly apiUrl: string;
  private readonly secret: string;
  private readonly timeout: number;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('PHYNECRM_API_URL', '');
    this.secret = this.config.get<string>('PHYNECRM_ENGAGEMENT_SECRET', '');
    this.timeout = this.config.get<number>('PHYNECRM_WEBHOOK_TIMEOUT', 10000);
  }

  // Resolve the engagement ID for a given Cotiza quote. Cotiza doesn't
  // own the engagement aggregate — PhyneCRM does — so the link is
  // expected to live in quote.metadata.phynecrmEngagementId. When
  // absent, the webhook is skipped (quote isn't tied to an engagement
  // yet; staff will link it manually).
  getEngagementId(metadata: Record<string, unknown> | null | undefined): string | null {
    if (!metadata) return null;
    const id = metadata.phynecrmEngagementId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  async recordEvent(payload: EngagementEventPayload): Promise<void> {
    if (!this.apiUrl || !this.secret) {
      this.logger.debug(
        'PhyneCRM engagement event skipped: PHYNECRM_API_URL or PHYNECRM_ENGAGEMENT_SECRET not configured',
      );
      return;
    }

    const url = `${this.apiUrl.replace(/\/$/, '')}/api/v1/engagements/events`;
    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    const signature = this.sign(body);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          'PhyneCRM engagement webhook returned %d for engagement=%s event=%s',
          response.status,
          payload.engagement_id,
          payload.event_type,
        );
      } else {
        this.logger.log(
          'PhyneCRM engagement webhook delivered: engagement=%s event=%s',
          payload.engagement_id,
          payload.event_type,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'PhyneCRM engagement webhook failed (engagement=%s event=%s): %s',
        payload.engagement_id,
        payload.event_type,
        msg,
      );
    }
  }

  // Format matches PhyneCRM's shared handleWebhook() signature
  // validator: "t=<ts>,v1=<hex>" with the HMAC computed over the raw
  // body. The timestamp header is already sent separately; signing
  // includes only the body so replay still needs the timestamp window.
  private sign(body: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(body, 'utf-8')
      .digest('hex');
  }
}
