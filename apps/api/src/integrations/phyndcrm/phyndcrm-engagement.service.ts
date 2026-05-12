/**
 * PhyndCRM Engagement Integration
 *
 * Writes quote lifecycle events into PhyndCRM's `engagement_events` via
 * the `POST /api/v1/engagements/events` HMAC-signed webhook. Also lets
 * Cotiza announce the signed-proposal artifact PDF into the client's
 * portal view.
 *
 * Kept fire-and-forget — PhyndCRM being offline must never break the
 * Cotiza quote pipeline; on error we log and move on.
 *
 * Environment:
 *   PHYNDCRM_API_URL              Base URL (e.g. https://phynd-crm.madfam.io)
 *   PHYNDCRM_ENGAGEMENT_SECRET    HMAC-SHA256 shared secret (matches
 *                                 PhyndCRM's PHYND_ENGAGEMENT_EVENTS_SECRET)
 *   PHYNDCRM_WEBHOOK_TIMEOUT      HTTP timeout in ms (default: 10000)
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

export interface EngagementArtifactPayload {
  engagement_id: string;
  type: 'quote' | 'signed_proposal' | 'invoice' | 'deliverable' | 'nft_receipt';
  entity_type?: 'quote' | 'order' | 'external_reference';
  entity_id?: string;
  url?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PhyndCrmEngagementService {
  private readonly logger = new Logger(PhyndCrmEngagementService.name);
  private readonly apiUrl: string;
  private readonly secret: string;
  private readonly timeout: number;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('PHYNDCRM_API_URL', '');
    this.secret = this.config.get<string>('PHYNDCRM_ENGAGEMENT_SECRET', '');
    this.timeout = this.config.get<number>('PHYNDCRM_WEBHOOK_TIMEOUT', 10000);
  }

  // Resolve the engagement ID for a given Cotiza quote. Cotiza doesn't
  // own the engagement aggregate — PhyndCRM does — so the link is
  // expected to live in quote.metadata.phyndcrmEngagementId. When
  // absent, the webhook is skipped (quote isn't tied to an engagement
  // yet; staff will link it manually).
  getEngagementId(metadata: Record<string, unknown> | null | undefined): string | null {
    if (!metadata) return null;
    const id = metadata.phyndcrmEngagementId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  async recordEvent(payload: EngagementEventPayload): Promise<void> {
    return this.post('/api/v1/engagements/events', payload, {
      engagement_id: payload.engagement_id,
      event_type: payload.event_type,
    });
  }

  // Push an artifact (signed proposal PDF, invoice, deliverable link,
  // NFT receipt, …) to the engagement so it shows up in the client
  // portal. Called from approve() after the PDF is generated.
  async recordArtifact(payload: EngagementArtifactPayload): Promise<void> {
    return this.post('/api/v1/engagements/artifacts', payload, {
      engagement_id: payload.engagement_id,
      event_type: `artifact:${payload.type}`,
    });
  }

  private async post(
    path: string,
    payload: EngagementEventPayload | EngagementArtifactPayload,
    logCtx: { engagement_id: string; event_type: string },
  ): Promise<void> {
    if (!this.apiUrl || !this.secret) {
      this.logger.debug(
        'PhyndCRM webhook skipped: PHYNDCRM_API_URL or PHYNDCRM_ENGAGEMENT_SECRET not configured',
      );
      return;
    }

    const url = `${this.apiUrl.replace(/\/$/, '')}${path}`;
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
          'PhyndCRM webhook %s returned %d for engagement=%s event=%s',
          path,
          response.status,
          logCtx.engagement_id,
          logCtx.event_type,
        );
      } else {
        this.logger.log(
          'PhyndCRM webhook %s delivered: engagement=%s event=%s',
          path,
          logCtx.engagement_id,
          logCtx.event_type,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'PhyndCRM webhook %s failed (engagement=%s event=%s): %s',
        path,
        logCtx.engagement_id,
        logCtx.event_type,
        msg,
      );
    }
  }

  // Format matches PhyndCRM's shared handleWebhook() signature
  // validator: "t=<ts>,v1=<hex>" with the HMAC computed over the raw
  // body. The timestamp header is already sent separately; signing
  // includes only the body so replay still needs the timestamp window.
  private sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body, 'utf-8').digest('hex');
  }
}
