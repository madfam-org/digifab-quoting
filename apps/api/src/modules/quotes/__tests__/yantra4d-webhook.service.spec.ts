import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  Yantra4dWebhookService,
  Yantra4dWebhookPayload,
} from '../services/yantra4d-webhook.service';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const API_URL = 'https://api.yantra4d.com';
const WEBHOOK_SECRET = 'test-yantra4d-webhook-secret-256';

function mockConfigService(
  overrides: Record<string, unknown> = {},
): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    YANTRA4D_API_URL: API_URL,
    YANTRA4D_WEBHOOK_SECRET: WEBHOOK_SECRET,
    YANTRA4D_WEBHOOK_TIMEOUT: 10000,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function samplePayload(
  overrides: Partial<Yantra4dWebhookPayload> = {},
): Yantra4dWebhookPayload {
  return {
    event_type: 'quote.completed',
    quote_id: 'quote-abc-123',
    quote_number: 'Q-2026-04-0012',
    project_slug: 'rugged-box',
    status: 'ordered',
    total_amount: 1234.56,
    currency: 'MXN',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Yantra4dWebhookService', () => {
  let service: Yantra4dWebhookService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Yantra4dWebhookService,
        { provide: ConfigService, useValue: mockConfigService() },
      ],
    }).compile();

    service = module.get<Yantra4dWebhookService>(Yantra4dWebhookService);

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('OK'),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  // ---------- isYantra4dQuote ----------

  describe('isYantra4dQuote', () => {
    it('should return true when metadata.source === "yantra4d" and yantra4dProject is a string', () => {
      const metadata = {
        source: 'yantra4d',
        yantra4dProject: 'rugged-box',
      };
      expect(service.isYantra4dQuote(metadata)).toBe(true);
    });

    it('should return false when metadata is null', () => {
      expect(service.isYantra4dQuote(null)).toBe(false);
    });

    it('should return false when source is not "yantra4d"', () => {
      const metadata = {
        source: 'manual',
        yantra4dProject: 'rugged-box',
      };
      expect(service.isYantra4dQuote(metadata)).toBe(false);
    });

    it('should return false when yantra4dProject is missing', () => {
      const metadata = { source: 'yantra4d' };
      expect(service.isYantra4dQuote(metadata)).toBe(false);
    });

    it('should return false when yantra4dProject is not a string', () => {
      const metadata = { source: 'yantra4d', yantra4dProject: 42 };
      expect(service.isYantra4dQuote(metadata)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(service.isYantra4dQuote({})).toBe(false);
    });
  });

  // ---------- getProjectSlug ----------

  describe('getProjectSlug', () => {
    it('should extract yantra4dProject from metadata', () => {
      const metadata = { source: 'yantra4d', yantra4dProject: 'slide-holder' };
      expect(service.getProjectSlug(metadata)).toBe('slide-holder');
    });
  });

  // ---------- notify ----------

  describe('notify', () => {
    it('should POST to the configured Yantra4D webhook URL', async () => {
      await service.notify(samplePayload());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/webhooks/cotiza`);
    });

    it('should send JSON payload with correct structure', async () => {
      const payload = samplePayload();
      await service.notify(payload);

      const [, options] = fetchSpy.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body).toMatchObject({
        event_type: 'quote.completed',
        quote_id: 'quote-abc-123',
        quote_number: 'Q-2026-04-0012',
        project_slug: 'rugged-box',
        status: 'ordered',
        total_amount: 1234.56,
        currency: 'MXN',
      });
    });

    it('should include HMAC-SHA256 signature in x-cotiza-signature header', async () => {
      await service.notify(samplePayload());

      const [, options] = fetchSpy.mock.calls[0];
      const signature = options.headers['x-cotiza-signature'];

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64); // SHA-256 hex = 64 chars

      // Verify the signature is valid HMAC-SHA256
      const expectedSig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(options.body, 'utf-8')
        .digest('hex');
      expect(signature).toBe(expectedSig);
    });

    it('should include Content-Type header', async () => {
      await service.notify(samplePayload());

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should use AbortController with configured timeout', async () => {
      await service.notify(samplePayload());

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.signal).toBeDefined();
    });
  });

  // ---------- notify - disabled / missing config ----------

  describe('notify - when disabled', () => {
    it('should skip webhook when YANTRA4D_API_URL is empty', async () => {
      const module = await Test.createTestingModule({
        providers: [
          Yantra4dWebhookService,
          {
            provide: ConfigService,
            useValue: mockConfigService({ YANTRA4D_API_URL: '' }),
          },
        ],
      }).compile();

      const disabledService = module.get<Yantra4dWebhookService>(
        Yantra4dWebhookService,
      );
      await disabledService.notify(samplePayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip webhook when YANTRA4D_WEBHOOK_SECRET is empty', async () => {
      const module = await Test.createTestingModule({
        providers: [
          Yantra4dWebhookService,
          {
            provide: ConfigService,
            useValue: mockConfigService({ YANTRA4D_WEBHOOK_SECRET: '' }),
          },
        ],
      }).compile();

      const disabledService = module.get<Yantra4dWebhookService>(
        Yantra4dWebhookService,
      );
      await disabledService.notify(samplePayload());

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ---------- notify - error resilience ----------

  describe('notify - error resilience', () => {
    it('should not throw when fetch rejects (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        service.notify(samplePayload()),
      ).resolves.toBeUndefined();
    });

    it('should not throw when fetch returns non-OK status', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('Bad Gateway'),
      } as unknown as Response);

      await expect(
        service.notify(samplePayload()),
      ).resolves.toBeUndefined();
    });

    it('should not throw on timeout/abort', async () => {
      fetchSpy.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      await expect(
        service.notify(samplePayload()),
      ).resolves.toBeUndefined();
    });
  });

  // ---------- notify - event types ----------

  describe('notify - event type variations', () => {
    const eventTypes: Array<Yantra4dWebhookPayload['event_type']> = [
      'quote.completed',
      'quote.approved',
      'quote.cancelled',
    ];

    for (const eventType of eventTypes) {
      it(`should deliver ${eventType} events`, async () => {
        await service.notify(samplePayload({ event_type: eventType }));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
        expect(body.event_type).toBe(eventType);
      });
    }
  });
});
