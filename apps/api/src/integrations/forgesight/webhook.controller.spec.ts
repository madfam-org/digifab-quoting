import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ForgesightWebhookController,
  ForgesightWebhookEventType,
  ForgesightWebhookPayload,
} from './webhook.controller';
import { CacheService } from '../../modules/redis/cache.service';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'test-forgesight-webhook-secret-256';

function mockConfigService(
  overrides: Record<string, unknown> = {},
): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    FORGESIGHT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function mockCacheService(): jest.Mocked<Pick<CacheService, 'invalidate'>> {
  return {
    invalidate: jest.fn().mockResolvedValue(0),
  };
}

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string): any {
  return {
    rawBody: Buffer.from(body),
  };
}

function samplePricePayload(
  overrides: Partial<ForgesightWebhookPayload> = {},
): ForgesightWebhookPayload {
  return {
    id: 'evt-001',
    event: 'price.updated',
    timestamp: new Date().toISOString(),
    data: {
      material_id: 'pla',
      category: 'FDM - PLA',
      region: 'CDMX',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForgesightWebhookController', () => {
  let controller: ForgesightWebhookController;
  let cacheService: jest.Mocked<Pick<CacheService, 'invalidate'>>;

  beforeEach(async () => {
    cacheService = mockCacheService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ForgesightWebhookController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService() },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    controller = module.get<ForgesightWebhookController>(
      ForgesightWebhookController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------- Signature verification ----------

  describe('signature verification', () => {
    it('should reject requests with missing signature', async () => {
      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);

      await expect(
        controller.handleForgesightWebhook(req, undefined as any, payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject requests with invalid signature', async () => {
      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);

      await expect(
        controller.handleForgesightWebhook(req, 'bad-signature', payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject requests signed with wrong secret', async () => {
      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const wrongSig = sign(body, 'wrong-secret-entirely');

      await expect(
        controller.handleForgesightWebhook(req, wrongSig, payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept requests with valid signature', async () => {
      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      const result = await controller.handleForgesightWebhook(
        req,
        sig,
        payload,
      );

      expect(result.received).toBe(true);
      expect(result.event).toBe('price.updated');
    });

    it('should reject when secret is not configured', async () => {
      const module = await Test.createTestingModule({
        controllers: [ForgesightWebhookController],
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService({ FORGESIGHT_WEBHOOK_SECRET: '' }),
          },
          { provide: CacheService, useValue: mockCacheService() },
        ],
      }).compile();

      const noSecretController = module.get<ForgesightWebhookController>(
        ForgesightWebhookController,
      );

      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);

      await expect(
        noSecretController.handleForgesightWebhook(req, sign(body), payload),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------- Cache invalidation on price.updated ----------

  describe('cache invalidation on price.updated', () => {
    it('should invalidate all forgesight cache patterns', async () => {
      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      await controller.handleForgesightWebhook(req, sig, payload);

      // Expect 4 invalidation calls (quote-pricing, material-trends, vendor-comparison, regional-pricing)
      expect(cacheService.invalidate).toHaveBeenCalledTimes(4);
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'forgesight:quote-pricing*',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'forgesight:material-trends*',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'forgesight:vendor-comparison*',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'forgesight:regional-pricing*',
      );
    });

    it('should not invalidate cache for non-price events', async () => {
      const payload = samplePricePayload({ event: 'material.added' });
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      await controller.handleForgesightWebhook(req, sig, payload);

      expect(cacheService.invalidate).not.toHaveBeenCalled();
    });
  });

  // ---------- Event type normalization ----------

  describe('event type normalization', () => {
    it('should normalize from "event" field', async () => {
      const payload: ForgesightWebhookPayload = { event: 'price.updated' };
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      const result = await controller.handleForgesightWebhook(
        req,
        sig,
        payload,
      );
      expect(result.event).toBe('price.updated');
    });

    it('should normalize from "type" field', async () => {
      const payload: ForgesightWebhookPayload = { type: 'price.updated' };
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      const result = await controller.handleForgesightWebhook(
        req,
        sig,
        payload,
      );
      expect(result.event).toBe('price.updated');
    });

    it('should normalize from "event_type" field', async () => {
      const payload: ForgesightWebhookPayload = {
        event_type: 'price.updated',
      };
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      const result = await controller.handleForgesightWebhook(
        req,
        sig,
        payload,
      );
      expect(result.event).toBe('price.updated');
    });

    it('should default to "unknown" when no event field present', async () => {
      const payload: ForgesightWebhookPayload = { id: 'evt-no-type' };
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      const result = await controller.handleForgesightWebhook(
        req,
        sig,
        payload,
      );
      expect(result.event).toBe('unknown');
    });
  });

  // ---------- Error resilience ----------

  describe('error resilience', () => {
    it('should return received: false when cache invalidation throws', async () => {
      cacheService.invalidate.mockRejectedValueOnce(
        new Error('Redis connection lost'),
      );

      const payload = samplePricePayload();
      const body = JSON.stringify(payload);
      const req = makeRequest(body);
      const sig = sign(body);

      const result = await controller.handleForgesightWebhook(
        req,
        sig,
        payload,
      );

      expect(result.received).toBe(false);
      expect(result.error).toContain('Redis connection lost');
    });
  });
});
