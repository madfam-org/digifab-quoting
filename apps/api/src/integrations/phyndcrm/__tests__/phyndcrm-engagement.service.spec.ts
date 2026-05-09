import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  EngagementArtifactPayload,
  EngagementEventPayload,
  PhyneCrmEngagementService,
} from '../phyndcrm-engagement.service';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const API_URL = 'https://phynd-crm.madfam.io';
const SECRET = 'test-phyndcrm-engagement-secret-256';

function mockConfigService(overrides: Record<string, unknown> = {}): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    PHYNECRM_API_URL: API_URL,
    PHYNECRM_ENGAGEMENT_SECRET: SECRET,
    PHYNECRM_WEBHOOK_TIMEOUT: 10000,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function sampleEvent(overrides: Partial<EngagementEventPayload> = {}): EngagementEventPayload {
  return {
    engagement_id: 'eng-tablaco-001',
    source: 'cotiza',
    event_type: 'quote.approved',
    status: 'in_progress',
    message: 'Services proposal approved',
    timestamp: '2026-04-19T14:30:00Z',
    dedup_key: 'cotiza:quote.approved:quote-abc',
    metadata: { quote_id: 'quote-abc', quote_number: 'Q-2026-04-0001' },
    ...overrides,
  };
}

function sampleArtifact(
  overrides: Partial<EngagementArtifactPayload> = {},
): EngagementArtifactPayload {
  return {
    engagement_id: 'eng-tablaco-001',
    type: 'signed_proposal',
    entity_type: 'quote',
    entity_id: 'quote-abc',
    url: 'https://example.com/proposal.pdf',
    title: 'Proposal Q-2026-04-0001',
    ...overrides,
  };
}

function expectedSignature(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhyneCrmEngagementService', () => {
  let service: PhyneCrmEngagementService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhyneCrmEngagementService,
        { provide: ConfigService, useValue: mockConfigService() },
      ],
    }).compile();

    service = module.get<PhyneCrmEngagementService>(PhyneCrmEngagementService);

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

  // ---------- getEngagementId ----------

  describe('getEngagementId', () => {
    it('returns the id when metadata.phyndcrmEngagementId is a non-empty string', () => {
      expect(service.getEngagementId({ phyndcrmEngagementId: 'eng-123' })).toBe('eng-123');
    });

    it('returns null when metadata is undefined / null', () => {
      expect(service.getEngagementId(null)).toBeNull();
      expect(service.getEngagementId(undefined)).toBeNull();
    });

    it('returns null when the field is empty or of wrong type', () => {
      expect(service.getEngagementId({})).toBeNull();
      expect(service.getEngagementId({ phyndcrmEngagementId: '' })).toBeNull();
      expect(service.getEngagementId({ phyndcrmEngagementId: 42 as unknown as string })).toBeNull();
    });
  });

  // ---------- recordEvent ----------

  describe('recordEvent', () => {
    it('POSTs to /api/v1/engagements/events with signed body + timestamp header', async () => {
      const payload = sampleEvent();
      await service.recordEvent(payload);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/v1/engagements/events`);
      expect((init as RequestInit).method).toBe('POST');

      const body = (init as RequestInit).body as string;
      expect(JSON.parse(body)).toEqual(payload);

      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-webhook-signature']).toBe(expectedSignature(body));
      expect(headers['x-webhook-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('skips fetch when PHYNECRM_API_URL is unset', async () => {
      const module = await Test.createTestingModule({
        providers: [
          PhyneCrmEngagementService,
          {
            provide: ConfigService,
            useValue: mockConfigService({ PHYNECRM_API_URL: '' }),
          },
        ],
      }).compile();
      const s = module.get<PhyneCrmEngagementService>(PhyneCrmEngagementService);

      await s.recordEvent(sampleEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips fetch when PHYNECRM_ENGAGEMENT_SECRET is unset', async () => {
      const module = await Test.createTestingModule({
        providers: [
          PhyneCrmEngagementService,
          {
            provide: ConfigService,
            useValue: mockConfigService({ PHYNECRM_ENGAGEMENT_SECRET: '' }),
          },
        ],
      }).compile();
      const s = module.get<PhyneCrmEngagementService>(PhyneCrmEngagementService);

      await s.recordEvent(sampleEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not throw on non-2xx response (fire-and-forget)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('boom'),
      } as unknown as Response);

      await expect(service.recordEvent(sampleEvent())).resolves.toBeUndefined();
    });

    it('does not throw on fetch rejection (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.recordEvent(sampleEvent())).resolves.toBeUndefined();
    });
  });

  // ---------- recordArtifact ----------

  describe('recordArtifact', () => {
    it('POSTs to /api/v1/engagements/artifacts with signed body', async () => {
      const payload = sampleArtifact();
      await service.recordArtifact(payload);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/v1/engagements/artifacts`);

      const body = (init as RequestInit).body as string;
      expect(JSON.parse(body)).toEqual(payload);

      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['x-webhook-signature']).toBe(expectedSignature(body));
    });

    it('does not throw on non-2xx or fetch rejection (fire-and-forget)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('bad gateway'),
      } as unknown as Response);
      await expect(service.recordArtifact(sampleArtifact())).resolves.toBeUndefined();

      fetchSpy.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.recordArtifact(sampleArtifact())).resolves.toBeUndefined();
    });
  });
});
