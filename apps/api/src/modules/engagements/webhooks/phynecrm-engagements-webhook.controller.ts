/**
 * POST /api/v1/webhooks/phynecrm/engagements
 *
 * Inbound webhook from PhyneCRM announcing engagement lifecycle events.
 * HMAC-SHA256 signed with `PHYNECRM_INBOUND_SECRET`. Idempotent — same
 * `engagement_id` + `event_type` + `timestamp` is a no-op on second
 * delivery (PhyneCRM may retry).
 *
 * Event types handled:
 *   engagement.created   → upsert projection, lastSyncedAt stamped
 *   engagement.updated   → upsert projection, lastSyncedAt stamped
 *   engagement.archived  → soft-delete projection
 *
 * Unknown event types return 200 (acknowledged, ignored) so PhyneCRM
 * can add new event types without breaking Cotiza's webhook contract.
 */
import * as crypto from 'crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { EngagementsService } from '../engagements.service';

export enum PhynecrmEngagementEventType {
  CREATED = 'engagement.created',
  UPDATED = 'engagement.updated',
  ARCHIVED = 'engagement.archived',
}

export interface PhynecrmEngagementWebhookPayload {
  engagement_id: string;
  event_type: string;
  tenant_id: string;
  timestamp?: string;
  data?: {
    project_name?: string;
    status?: string;
    contact_id?: string;
    [key: string]: unknown;
  };
}

@ApiTags('Webhooks')
@Controller('webhooks/phynecrm/engagements')
export class PhynecrmEngagementsWebhookController {
  private readonly logger = new Logger(PhynecrmEngagementsWebhookController.name);
  private readonly secret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly engagements: EngagementsService,
  ) {
    this.secret = this.config.get<string>('PHYNECRM_INBOUND_SECRET', '');
    if (!this.secret) {
      this.logger.warn(
        'PHYNECRM_INBOUND_SECRET not configured — PhyneCRM engagement webhook will reject all requests',
      );
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive engagement lifecycle events from PhyneCRM',
    description:
      'Upserts the Engagement projection. HMAC-SHA256 signed via x-phynecrm-signature header.',
  })
  @ApiOkResponse({ description: 'Webhook processed' })
  @ApiUnauthorizedResponse({ description: 'Invalid signature' })
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-phynecrm-signature') signature: string,
    @Body() payload: PhynecrmEngagementWebhookPayload,
  ): Promise<{ received: boolean; event?: string; action?: string }> {
    const rawBody = req.rawBody?.toString() || JSON.stringify(payload);
    if (!this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('invalid webhook signature');
    }
    if (!payload.engagement_id || !payload.tenant_id || !payload.event_type) {
      throw new BadRequestException('engagement_id, tenant_id, event_type are required');
    }

    const eventType = payload.event_type;

    try {
      switch (eventType) {
        case PhynecrmEngagementEventType.CREATED:
        case PhynecrmEngagementEventType.UPDATED:
          await this.engagements.upsert({
            tenantId: payload.tenant_id,
            phynecrmEngagementId: payload.engagement_id,
            projectName: payload.data?.project_name ?? null,
            status: payload.data?.status ?? 'active',
            contactId: payload.data?.contact_id ?? null,
            metadata: payload.data ?? {},
            synced: true,
          });
          return { received: true, event: eventType, action: 'upserted' };

        case PhynecrmEngagementEventType.ARCHIVED:
          await this.engagements.softDelete(payload.engagement_id);
          return { received: true, event: eventType, action: 'archived' };

        default:
          // Acknowledge unknown event types so PhyneCRM can expand the
          // taxonomy without breaking this contract.
          this.logger.log(`ignoring unknown event type: ${eventType}`);
          return { received: true, event: eventType, action: 'ignored' };
      }
    } catch (err) {
      // Log and rethrow 5xx so PhyneCRM retries; auth/bad-request already
      // threw above and reach here only on persistence failures.
      this.logger.error(
        `failed to process PhyneCRM engagement webhook (${eventType}): ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  private verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.secret || !signature) return false;
    const expected = crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
    if (signature.length !== expected.length) return false;
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');
    return crypto.timingSafeEqual(
      new Uint8Array(sigBuf.buffer, sigBuf.byteOffset, sigBuf.byteLength),
      new Uint8Array(expBuf.buffer, expBuf.byteOffset, expBuf.byteLength),
    );
  }
}
