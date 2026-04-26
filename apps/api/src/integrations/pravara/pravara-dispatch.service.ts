/**
 * Pravara MES Dispatch Integration
 *
 * When a FAB-mode Cotiza quote (or the fab items inside a mixed quote)
 * transitions to ORDERED, dispatch a job to PravaraMES for production
 * scheduling. HMAC-SHA256 signed body, fire-and-forget — Pravara being
 * offline must never block the Cotiza pipeline; staff can re-dispatch
 * from the Cotiza admin if the initial call drops.
 *
 * Environment:
 *   PRAVARA_API_URL            Base URL (e.g. https://pravara.madfam.io)
 *   PRAVARA_DISPATCH_SECRET    HMAC-SHA256 shared secret
 *   PRAVARA_WEBHOOK_TIMEOUT    HTTP timeout in ms (default: 15000)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface PravaraJobItem {
  quoteItemId: string;
  process: string;
  material: string;
  quantity: number;
  selections?: Record<string, unknown>;
  files?: Array<{ id: string; filename?: string; s3Key?: string }>;
  leadTimeDays?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface PravaraDispatchContext {
  tenantId: string;
  quoteId: string;
  quoteNumber: string;
  orderId?: string;
  engagementId?: string;
  dueBy?: string;
  currency: string;
  items: PravaraJobItem[];
  metadata?: Record<string, unknown>;
}

export interface PravaraJobRequest {
  orderId: string;
  externalId: string;
  engagement_id?: string;
  currency: string;
  dueBy?: string;
  items: Array<{
    process: string;
    material: string;
    quantity: number;
    selections: Record<string, unknown>;
    files: Array<{ id: string; filename?: string; s3Key?: string }>;
    leadTimeDays?: number;
    unitPrice?: number;
    totalPrice?: number;
    quoteItemId: string;
  }>;
  metadata?: Record<string, unknown>;
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

@Injectable()
export class PravaraDispatchService {
  private readonly logger = new Logger(PravaraDispatchService.name);
  private readonly apiUrl: string;
  private readonly secret: string;
  private readonly timeout: number;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('PRAVARA_API_URL', '');
    this.secret = this.config.get<string>('PRAVARA_DISPATCH_SECRET', '');
    this.timeout = this.config.get<number>('PRAVARA_WEBHOOK_TIMEOUT', 15000);
  }

  async dispatchJob(ctx: PravaraDispatchContext): Promise<void> {
    if (!this.apiUrl || !this.secret) {
      this.logger.debug(
        'Pravara dispatch skipped: PRAVARA_API_URL or PRAVARA_DISPATCH_SECRET not configured',
      );
      return;
    }

    if (!ctx.items || ctx.items.length === 0) {
      this.logger.debug('Pravara dispatch skipped: no fab items for quote=%s', ctx.quoteId);
      return;
    }

    const payload: PravaraJobRequest = {
      orderId: ctx.orderId ?? ctx.quoteId,
      externalId: ctx.quoteId,
      engagement_id: ctx.engagementId,
      currency: ctx.currency,
      dueBy: ctx.dueBy,
      items: ctx.items.map((it) => ({
        quoteItemId: it.quoteItemId,
        process: it.process,
        material: it.material,
        quantity: it.quantity,
        selections: it.selections ?? {},
        files: it.files ?? [],
        leadTimeDays: it.leadTimeDays,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
      })),
      metadata: {
        quote_id: ctx.quoteId,
        quote_number: ctx.quoteNumber,
        source: 'cotiza',
        ...(ctx.metadata ?? {}),
      },
    };

    const url = `${this.apiUrl.replace(/\/$/, '')}/api/v1/mes/jobs`;
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
          'Pravara dispatch returned %d for quote=%s (items=%d)',
          response.status,
          ctx.quoteId,
          ctx.items.length,
        );
      } else {
        this.logger.log(
          'Pravara dispatch delivered: quote=%s items=%d',
          ctx.quoteId,
          ctx.items.length,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Pravara dispatch failed (quote=%s): %s', ctx.quoteId, msg);
    }
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body, 'utf-8').digest('hex');
  }
}
