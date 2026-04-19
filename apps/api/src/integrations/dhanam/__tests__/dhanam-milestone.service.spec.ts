import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  DhanamMilestoneContext,
  DhanamMilestoneService,
} from '../dhanam-milestone.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const API_URL = 'https://dhanam.madfam.io';
const SECRET = 'test-dhanam-billing-secret-256';

function mockConfigService(
  overrides: Record<string, unknown> = {},
): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    DHANAM_API_URL: API_URL,
    DHANAM_BILLING_SECRET: SECRET,
    DHANAM_WEBHOOK_TIMEOUT: 10000,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function sampleContext(
  overrides: Partial<DhanamMilestoneContext> = {},
): DhanamMilestoneContext {
  return {
    tenantId: 'tenant-madfam',
    quoteId: 'quote-abc',
    quoteNumber: 'Q-2026-04-0001',
    customerId: 'user-xyz',
    currency: 'MXN',
    engagementId: 'eng-tablaco-001',
    items: [
      {
        quoteItemId: 'item-1',
        milestoneId: 'ms-1',
        name: 'Discovery',
        amount: 5000,
        currency: 'MXN',
      },
      {
        quoteItemId: 'item-1',
        milestoneId: 'ms-2',
        name: 'Build',
        amount: 15000,
        currency: 'MXN',
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
): Promise<DhanamMilestoneService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DhanamMilestoneService,
      { provide: ConfigService, useValue: mockConfigService(overrides) },
    ],
  }).compile();
  return module.get<DhanamMilestoneService>(DhanamMilestoneService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DhanamMilestoneService', () => {
  let service: DhanamMilestoneService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    service = await buildService();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: jest.fn().mockResolvedValue('Created'),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  // ---------- idempotencyKey ----------

  describe('idempotencyKey', () => {
    it('returns the deterministic dhanam-milestone:<quoteItem>:<milestone> format', () => {
      expect(DhanamMilestoneService.idempotencyKey('it-1', 'ms-1')).toBe(
        'dhanam-milestone:it-1:ms-1',
      );
    });
  });

  // ---------- createInvoicesForMilestones ----------

  describe('createInvoicesForMilestones', () => {
    it('posts one invoice per milestone with HMAC signature + idempotency header', async () => {
      const ctx = sampleContext();
      await service.createInvoicesForMilestones(ctx);

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // First milestone
      const [url1, init1] = fetchSpy.mock.calls[0];
      expect(url1).toBe(`${API_URL}/api/v1/invoices`);
      expect((init1 as RequestInit).method).toBe('POST');

      const body1 = (init1 as RequestInit).body as string;
      const headers1 = (init1 as RequestInit).headers as Record<string, string>;
      expect(headers1['Content-Type']).toBe('application/json');
      expect(headers1['x-webhook-signature']).toBe(expectedSignature(body1));
      expect(headers1['x-webhook-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(headers1['Idempotency-Key']).toBe('dhanam-milestone:item-1:ms-1');

      const parsed1 = JSON.parse(body1);
      expect(parsed1).toMatchObject({
        customerId: 'user-xyz',
        amount: 5000,
        currency: 'MXN',
        description: 'Q-2026-04-0001 — Discovery',
        metadata: {
          quoteId: 'quote-abc',
          quoteItemId: 'item-1',
          milestoneId: 'ms-1',
          engagementId: 'eng-tablaco-001',
          source: 'cotiza',
        },
      });

      // Second milestone
      const [, init2] = fetchSpy.mock.calls[1];
      const headers2 = (init2 as RequestInit).headers as Record<string, string>;
      expect(headers2['Idempotency-Key']).toBe('dhanam-milestone:item-1:ms-2');
      const parsed2 = JSON.parse((init2 as RequestInit).body as string);
      expect(parsed2).toMatchObject({ amount: 15000, description: 'Q-2026-04-0001 — Build' });
    });

    it('skips fetch when DHANAM_API_URL is unset', async () => {
      const s = await buildService({ DHANAM_API_URL: '' });
      await s.createInvoicesForMilestones(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips fetch when DHANAM_BILLING_SECRET is unset', async () => {
      const s = await buildService({ DHANAM_BILLING_SECRET: '' });
      await s.createInvoicesForMilestones(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips silently when no milestone items are present', async () => {
      await service.createInvoicesForMilestones(sampleContext({ items: [] }));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not throw on non-2xx response (fire-and-forget per-milestone)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: jest.fn().mockResolvedValue('duplicate'),
      } as unknown as Response);
      await expect(
        service.createInvoicesForMilestones(sampleContext()),
      ).resolves.toBeUndefined();
    });

    it('does not throw on fetch rejection (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(
        service.createInvoicesForMilestones(sampleContext()),
      ).resolves.toBeUndefined();
    });

    it('one failing milestone does not prevent the others from posting', async () => {
      // First call rejects, second resolves ok.
      fetchSpy
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: jest.fn().mockResolvedValue('Created'),
        } as unknown as Response);

      await service.createInvoicesForMilestones(sampleContext());
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back to ctx.currency when a milestone has no currency field', async () => {
      const ctx = sampleContext({
        items: [
          {
            quoteItemId: 'item-1',
            milestoneId: 'ms-1',
            name: 'Discovery',
            amount: 5000,
            // no currency field on the milestone itself
            currency: '' as unknown as string,
          },
        ],
      });
      await service.createInvoicesForMilestones(ctx);
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string).currency).toBe('MXN');
    });
  });
});
