import * as crypto from 'crypto';

import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CacheService } from '../../modules/redis/cache.service';

/**
 * Forgesight webhook event types.
 */
export enum ForgesightWebhookEventType {
  PRICE_UPDATED = 'price.updated',
  MATERIAL_ADDED = 'material.added',
  MATERIAL_REMOVED = 'material.removed',
}

/**
 * Shape of the webhook payload sent by Forgesight's feed API.
 */
export interface ForgesightWebhookPayload {
  id?: string;
  event?: string;
  type?: string;
  event_type?: string;
  timestamp?: string;
  data?: {
    material_id?: string;
    material?: string;
    category?: string;
    region?: string;
    service?: string;
    [key: string]: unknown;
  };
}

/**
 * =============================================================================
 * Forgesight Webhook Controller
 * =============================================================================
 * Receives price update events from Forgesight's feed webhook system.
 * On valid price.updated events, invalidates all cached Forgesight pricing
 * data so the next pricing request fetches fresh market data.
 *
 * ## Security
 * - HMAC-SHA256 signature verification using FORGESIGHT_WEBHOOK_SECRET
 * - Timing-safe comparison to prevent timing attacks
 * - No JWT required (service-to-service, signature-authenticated)
 *
 * ## Endpoint
 * POST /api/v1/webhooks/forgesight
 *
 * ## Headers
 * - `x-forgesight-signature`: HMAC-SHA256 hex digest of the raw request body
 * =============================================================================
 */
@ApiTags('Webhooks')
@Controller('webhooks/forgesight')
export class ForgesightWebhookController {
  private readonly logger = new Logger(ForgesightWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.webhookSecret = this.config.get<string>('FORGESIGHT_WEBHOOK_SECRET', '');

    if (!this.webhookSecret) {
      this.logger.warn(
        'FORGESIGHT_WEBHOOK_SECRET not configured -- Forgesight webhook endpoint will reject all requests',
      );
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive price update events from Forgesight',
    description:
      'Webhook endpoint for Forgesight pricing feed. ' +
      'Authenticated via HMAC-SHA256 signature in x-forgesight-signature header.',
  })
  @ApiOkResponse({ description: 'Webhook processed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid payload structure' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing webhook signature' })
  async handleForgesightWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-forgesight-signature') signature: string,
    @Body() payload: ForgesightWebhookPayload,
  ): Promise<{ received: boolean; event?: string; error?: string }> {
    // ---------------------------------------------------------------
    // 1. Verify HMAC signature
    // ---------------------------------------------------------------
    const rawBody = req.rawBody?.toString() || JSON.stringify(payload);

    if (!this.verifySignature(rawBody, signature)) {
      this.logger.error('Forgesight webhook signature verification failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Normalize event type from multiple possible field names
    const eventType = payload.event || payload.type || payload.event_type || 'unknown';

    this.logger.log(`Received Forgesight webhook: ${eventType} (id=${payload.id || 'none'})`);

    // ---------------------------------------------------------------
    // 2. Process event
    // ---------------------------------------------------------------
    try {
      if (eventType === ForgesightWebhookEventType.PRICE_UPDATED) {
        await this.handlePriceUpdated(payload);
      } else {
        this.logger.log(`Unhandled Forgesight event type: ${eventType}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Error processing Forgesight webhook ${eventType}: ${message}`, stack);
      return { received: false, error: message };
    }

    return { received: true, event: eventType };
  }

  // ===================================================================
  // Signature verification
  // ===================================================================

  /**
   * Verify HMAC-SHA256 signature using timing-safe comparison.
   */
  private verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.webhookSecret || !signature) {
      return false;
    }

    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');

    // Guard against length mismatch before timingSafeEqual
    if (signature.length !== expected.length) {
      return false;
    }

    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');
    return crypto.timingSafeEqual(
      new Uint8Array(sigBuf.buffer, sigBuf.byteOffset, sigBuf.byteLength),
      new Uint8Array(expBuf.buffer, expBuf.byteOffset, expBuf.byteLength),
    );
  }

  // ===================================================================
  // Event handlers
  // ===================================================================

  /**
   * Invalidate all cached Forgesight pricing data.
   *
   * The ForgeSightService uses @Cacheable with these prefixes:
   * - forgesight:quote-pricing
   * - forgesight:material-trends
   * - forgesight:vendor-comparison
   * - forgesight:regional-pricing
   *
   * We invalidate all of them to ensure fresh data on next request.
   */
  private async handlePriceUpdated(payload: ForgesightWebhookPayload): Promise<void> {
    const materialId = payload.data?.material_id || payload.data?.material;

    const patternsToInvalidate = [
      'forgesight:quote-pricing*',
      'forgesight:material-trends*',
      'forgesight:vendor-comparison*',
      'forgesight:regional-pricing*',
    ];

    let totalInvalidated = 0;
    for (const pattern of patternsToInvalidate) {
      const count = await this.cacheService.invalidate(pattern);
      totalInvalidated += count;
    }

    this.logger.log(
      `Forgesight price.updated: invalidated ${totalInvalidated} cache entries` +
        (materialId ? ` (material=${materialId})` : ''),
    );
  }
}
