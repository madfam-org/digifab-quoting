import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PravaraDispatchContext, PravaraDispatchService } from '../pravara-dispatch.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const API_URL = 'https://pravara.madfam.io';
const SECRET = 'test-pravara-dispatch-secret-256';

function mockConfigService(overrides: Record<string, unknown> = {}): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    PRAVARA_API_URL: API_URL,
    PRAVARA_DISPATCH_SECRET: SECRET,
    PRAVARA_WEBHOOK_TIMEOUT: 15000,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function sampleContext(overrides: Partial<PravaraDispatchContext> = {}): PravaraDispatchContext {
  return {
    tenantId: 'tenant-madfam',
    quoteId: 'quote-abc',
    quoteNumber: 'Q-2026-04-0001',
    orderId: 'ORD-XYZ',
    engagementId: 'eng-tablaco-001',
    currency: 'MXN',
    dueBy: '2026-05-01T00:00:00Z',
    items: [
      {
        quoteItemId: 'item-1',
        process: 'cnc-milling',
        material: 'AL-6061',
        quantity: 10,
        selections: { tolerance: 'iso-2768-m' },
        files: [{ id: 'file-1', filename: 'bracket.step' }],
        leadTimeDays: 7,
        unitPrice: 100,
        totalPrice: 1000,
      },
    ],
    ...overrides,
  };
}

function expectedSignature(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body, 'utf-8').digest('hex');
}

async function buildService(
  overrides: Record<string, unknown> = {},
): Promise<PravaraDispatchService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PravaraDispatchService,
      { provide: ConfigService, useValue: mockConfigService(overrides) },
    ],
  }).compile();
  return module.get<PravaraDispatchService>(PravaraDispatchService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PravaraDispatchService', () => {
  let service: PravaraDispatchService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    service = await buildService();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 202,
      text: jest.fn().mockResolvedValue('Accepted'),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('dispatchJob', () => {
    it('POSTs to /api/v1/mes/jobs with signed body, timestamp header, and full payload', async () => {
      const ctx = sampleContext();
      await service.dispatchJob(ctx);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/v1/mes/jobs`);
      expect((init as RequestInit).method).toBe('POST');

      const body = (init as RequestInit).body as string;
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-webhook-signature']).toBe(expectedSignature(body));
      expect(headers['x-webhook-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const parsed = JSON.parse(body);
      expect(parsed).toMatchObject({
        orderId: 'ORD-XYZ',
        externalId: 'quote-abc',
        engagement_id: 'eng-tablaco-001',
        currency: 'MXN',
        dueBy: '2026-05-01T00:00:00Z',
      });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0]).toMatchObject({
        quoteItemId: 'item-1',
        process: 'cnc-milling',
        material: 'AL-6061',
        quantity: 10,
        selections: { tolerance: 'iso-2768-m' },
        files: [{ id: 'file-1', filename: 'bracket.step' }],
        leadTimeDays: 7,
        unitPrice: 100,
        totalPrice: 1000,
      });
      expect(parsed.metadata).toMatchObject({
        quote_id: 'quote-abc',
        quote_number: 'Q-2026-04-0001',
        source: 'cotiza',
      });
    });

    it('falls back to quoteId for orderId when no orderId is passed', async () => {
      await service.dispatchJob(sampleContext({ orderId: undefined }));
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string).orderId).toBe('quote-abc');
    });

    it('omits engagement_id when ctx.engagementId is undefined', async () => {
      await service.dispatchJob(sampleContext({ engagementId: undefined }));
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const parsed = JSON.parse(init.body as string);
      expect(parsed.engagement_id).toBeUndefined();
    });

    it('skips fetch when PRAVARA_API_URL is unset', async () => {
      const s = await buildService({ PRAVARA_API_URL: '' });
      await s.dispatchJob(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips fetch when PRAVARA_DISPATCH_SECRET is unset', async () => {
      const s = await buildService({ PRAVARA_DISPATCH_SECRET: '' });
      await s.dispatchJob(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips silently when no fab items are present', async () => {
      await service.dispatchJob(sampleContext({ items: [] }));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not throw on non-2xx response (fire-and-forget)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('boom'),
      } as unknown as Response);
      await expect(service.dispatchJob(sampleContext())).resolves.toBeUndefined();
    });

    it('does not throw on fetch rejection (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.dispatchJob(sampleContext())).resolves.toBeUndefined();
    });

    it('defaults selections to {} and files to [] when not provided on an item', async () => {
      const ctx = sampleContext({
        items: [
          {
            quoteItemId: 'item-1',
            process: 'laser-cut',
            material: 'acrylic-3mm',
            quantity: 5,
          },
        ],
      });
      await service.dispatchJob(ctx);
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const parsed = JSON.parse(init.body as string);
      expect(parsed.items[0].selections).toEqual({});
      expect(parsed.items[0].files).toEqual([]);
    });
  });
});
