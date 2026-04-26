import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DhanamRelayService } from '../services/dhanam-relay.service';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const WEBHOOK_URL = 'https://api.dhan.am/v1/webhooks/cotiza';
const WEBHOOK_SECRET = 'test-shared-secret-256bit-key!!';

function mockConfigService(overrides: Record<string, unknown> = {}): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    DHANAM_WEBHOOK_URL: WEBHOOK_URL,
    DHANAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    DHANAM_WEBHOOK_TIMEOUT_MS: 5000,
    ...overrides,
  };

  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function sampleEventData() {
  return {
    tenantId: 'tenant-001',
    quoteId: 'quote-abc',
    invoiceId: 'inv-123',
    amount: 450.0,
    currency: 'MXN',
    provider: 'stripe',
    customerId: 'cust-xyz',
    status: 'completed',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DhanamRelayService', () => {
  let service: DhanamRelayService;
  let configService: Partial<ConfigService>;

  // We capture the global fetch so we can mock it per-test
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    configService = mockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DhanamRelayService, { provide: ConfigService, useValue: configService }],
    }).compile();

    service = module.get<DhanamRelayService>(DhanamRelayService);

    // Mock global fetch
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

  // ---------- Initialization ----------

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report enabled when URL and secret are configured', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should report disabled when DHANAM_WEBHOOK_URL is missing', async () => {
      const disabledConfig = mockConfigService({ DHANAM_WEBHOOK_URL: '' });
      const mod = await Test.createTestingModule({
        providers: [DhanamRelayService, { provide: ConfigService, useValue: disabledConfig }],
      }).compile();

      const disabledService = mod.get<DhanamRelayService>(DhanamRelayService);
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should report disabled when DHANAM_WEBHOOK_SECRET is missing', async () => {
      const disabledConfig = mockConfigService({ DHANAM_WEBHOOK_SECRET: '' });
      const mod = await Test.createTestingModule({
        providers: [DhanamRelayService, { provide: ConfigService, useValue: disabledConfig }],
      }).compile();

      const disabledService = mod.get<DhanamRelayService>(DhanamRelayService);
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  // ---------- relay() happy path ----------

  describe('relay - successful delivery', () => {
    it('should POST to the configured webhook URL', async () => {
      await service.relay('payment.succeeded', sampleEventData());

      // relay() is fire-and-forget; the internal sendWebhook is async
      // Wait a tick for the fire-and-forget promise to resolve
      await new Promise((r) => setTimeout(r, 50));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe(WEBHOOK_URL);
    });

    it('should send JSON payload with correct structure', async () => {
      await service.relay('payment.succeeded', sampleEventData());
      await new Promise((r) => setTimeout(r, 50));

      const [, options] = fetchSpy.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('type', 'payment.succeeded');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('source_app', 'cotiza');
      expect(body.data).toMatchObject({
        tenant_id: 'tenant-001',
        quote_id: 'quote-abc',
        invoice_id: 'inv-123',
        amount: 450.0,
        currency: 'MXN',
        provider: 'stripe',
        customer_id: 'cust-xyz',
        status: 'completed',
      });
    });

    it('should include HMAC-SHA256 signature header', async () => {
      await service.relay('payment.succeeded', sampleEventData());
      await new Promise((r) => setTimeout(r, 50));

      const [, options] = fetchSpy.mock.calls[0];
      const signature = options.headers['x-cotiza-signature'];
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(64); // SHA-256 hex = 64 chars

      // Verify the signature is valid HMAC-SHA256
      const expectedSig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(options.body)
        .digest('hex');
      expect(signature).toBe(expectedSig);
    });

    it('should include Content-Type and User-Agent headers', async () => {
      await service.relay('payment.succeeded', sampleEventData());
      await new Promise((r) => setTimeout(r, 50));

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['User-Agent']).toBe('Cotiza-BillingRelay/1.0');
    });
  });

  // ---------- relay() when disabled ----------

  describe('relay - disabled service', () => {
    it('should not call fetch when service is disabled', async () => {
      const disabledConfig = mockConfigService({ DHANAM_WEBHOOK_URL: '' });
      const mod = await Test.createTestingModule({
        providers: [DhanamRelayService, { provide: ConfigService, useValue: disabledConfig }],
      }).compile();

      const disabledService = mod.get<DhanamRelayService>(DhanamRelayService);
      await disabledService.relay('payment.succeeded', sampleEventData());
      await new Promise((r) => setTimeout(r, 50));

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ---------- relay() error handling ----------

  describe('relay - error resilience', () => {
    it('should not throw when fetch rejects (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

      // relay() itself must not throw -- errors are caught internally
      await expect(service.relay('payment.succeeded', sampleEventData())).resolves.toBeUndefined();
    });

    it('should not throw when fetch returns non-OK status', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('Bad Gateway'),
      } as unknown as Response);

      await expect(service.relay('payment.failed', sampleEventData())).resolves.toBeUndefined();
    });
  });

  // ---------- Payload variations ----------

  describe('relay - payload variations', () => {
    it('should handle minimal event data', async () => {
      await service.relay('subscription.created', { tenantId: 'tenant-001' });
      await new Promise((r) => setTimeout(r, 50));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.data.tenant_id).toBe('tenant-001');
      // Optional fields should be undefined but present in structure
      expect(body.data.quote_id).toBeUndefined();
      expect(body.data.amount).toBeUndefined();
    });

    it('should forward metadata when provided', async () => {
      const data = {
        ...sampleEventData(),
        metadata: { source: 'yantra4d', projectSlug: 'rugged-box' },
      };

      await service.relay('payment.succeeded', data);
      await new Promise((r) => setTimeout(r, 50));

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.data.metadata).toEqual({
        source: 'yantra4d',
        projectSlug: 'rugged-box',
      });
    });

    it('should include a unique id per relay call', async () => {
      await service.relay('event.a', sampleEventData());
      await service.relay('event.b', sampleEventData());
      await new Promise((r) => setTimeout(r, 50));

      const id1 = JSON.parse(fetchSpy.mock.calls[0][1].body).id;
      const id2 = JSON.parse(fetchSpy.mock.calls[1][1].body).id;
      expect(id1).not.toBe(id2);
    });
  });
});
