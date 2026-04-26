import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  DhanamBillingUpstreamError,
  JanuaBillingService,
} from '../services/janua-billing.service';

// ---------------------------------------------------------------------------
// JanuaBillingService.createCheckoutSession() — Dhanam billing-API client
//
// These tests exercise the Dhanam-checkout path only. The legacy
// Janua-proxy methods (createCustomer, createQuotePaymentSession, etc.)
// are exercised by their own historical tests and integration suites.
//
// Per the 2026-04-25 monetization-architecture directive, Cotiza is a
// CLIENT of Dhanam's billing API — Stripe keys live solely at Dhanam.
// `createCheckoutSession()` is the synchronous method that mints a
// Stripe checkout URL via Dhanam's POST /v1/billing/upgrade endpoint.
// ---------------------------------------------------------------------------

const DHANAM_API_URL = 'https://api.dhan.am';
const DHANAM_API_TOKEN = 'test-bearer-token-1234567890abcdef';

function mockConfig(overrides: Record<string, unknown> = {}): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    DHANAM_API_URL,
    DHANAM_API_TOKEN,
    DHANAM_CHECKOUT_TIMEOUT_MS: 5000,
    JANUA_API_URL: 'http://janua-api:8001',
    JANUA_API_KEY: 'janua-key',
    JANUA_BILLING_ENABLED: true,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in defaults ? defaults[key] : fallback,
    ),
  };
}

async function buildService(
  configOverrides: Record<string, unknown> = {},
): Promise<JanuaBillingService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      JanuaBillingService,
      { provide: ConfigService, useValue: mockConfig(configOverrides) },
    ],
  }).compile();
  return module.get<JanuaBillingService>(JanuaBillingService);
}

describe('JanuaBillingService.createCheckoutSession (Dhanam client)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  // ---------- Configuration gate ----------

  describe('isDhanamCheckoutEnabled', () => {
    it('returns true when both DHANAM_API_URL and DHANAM_API_TOKEN are set', async () => {
      const service = await buildService();
      expect(service.isDhanamCheckoutEnabled()).toBe(true);
    });

    it('returns false when DHANAM_API_URL is missing', async () => {
      const service = await buildService({ DHANAM_API_URL: '' });
      expect(service.isDhanamCheckoutEnabled()).toBe(false);
    });

    it('returns false when DHANAM_API_TOKEN is missing', async () => {
      const service = await buildService({ DHANAM_API_TOKEN: '' });
      expect(service.isDhanamCheckoutEnabled()).toBe(false);
    });
  });

  // ---------- Happy path ----------

  describe('successful checkout creation', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
          sessionId: 'cs_test_123',
        }),
      } as unknown as Response);
    });

    it('POSTs to {DHANAM_API_URL}/v1/billing/upgrade with bearer auth', async () => {
      const service = await buildService();
      await service.createCheckoutSession(
        'quote-1',
        'user-1',
        'cotiza_quote_payment',
        'https://app.cotiza/success',
        'https://app.cotiza/cancel',
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${DHANAM_API_URL}/v1/billing/upgrade`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${DHANAM_API_TOKEN}`);
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('forwards plan, success/cancel URLs, and metadata', async () => {
      const service = await buildService();
      await service.createCheckoutSession(
        'quote-1',
        'user-1',
        'cotiza_quote_payment',
        'https://app.cotiza/success',
        'https://app.cotiza/cancel',
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toEqual({
        plan: 'cotiza_quote_payment',
        product: 'cotiza',
        successUrl: 'https://app.cotiza/success',
        cancelUrl: 'https://app.cotiza/cancel',
        metadata: {
          cotiza_quote_id: 'quote-1',
          cotiza_user_id: 'user-1',
          source_product: 'cotiza',
        },
      });
    });

    it('returns the checkoutUrl and sessionId from the response', async () => {
      const service = await buildService();
      const result = await service.createCheckoutSession(
        'quote-1',
        'user-1',
        'plan',
        's',
        'c',
      );
      expect(result).toEqual({
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
        sessionId: 'cs_test_123',
      });
    });

    it('strips trailing slashes from DHANAM_API_URL', async () => {
      const service = await buildService({ DHANAM_API_URL: `${DHANAM_API_URL}//` });
      await service.createCheckoutSession('q', 'u', 'p', 's', 'c');
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${DHANAM_API_URL}/v1/billing/upgrade`);
    });

    it('tolerates snake_case response keys (forward-compat)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          checkout_url: 'https://checkout.stripe.com/c/pay/cs_snake_456',
          session_id: 'cs_snake_456',
        }),
      } as unknown as Response);
      const service = await buildService();
      const result = await service.createCheckoutSession('q', 'u', 'p', 's', 'c');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_snake_456');
      expect(result.sessionId).toBe('cs_snake_456');
    });
  });

  // ---------- Error paths (all → DhanamBillingUpstreamError / 502) ----------

  describe('error handling', () => {
    it('throws DhanamBillingUpstreamError when not configured', async () => {
      const service = await buildService({ DHANAM_API_URL: '' });
      await expect(
        service.createCheckoutSession('q', 'u', 'p', 's', 'c'),
      ).rejects.toBeInstanceOf(DhanamBillingUpstreamError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws DhanamBillingUpstreamError on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const service = await buildService();
      await expect(
        service.createCheckoutSession('q', 'u', 'p', 's', 'c'),
      ).rejects.toBeInstanceOf(DhanamBillingUpstreamError);
    });

    it('throws DhanamBillingUpstreamError on non-2xx response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('upstream down'),
      } as unknown as Response);
      const service = await buildService();
      await expect(
        service.createCheckoutSession('q', 'u', 'p', 's', 'c'),
      ).rejects.toThrow(/HTTP 503/);
    });

    it('throws DhanamBillingUpstreamError on invalid JSON', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('not json')),
      } as unknown as Response);
      const service = await buildService();
      await expect(
        service.createCheckoutSession('q', 'u', 'p', 's', 'c'),
      ).rejects.toThrow(/invalid response body/);
    });

    it('throws DhanamBillingUpstreamError when checkoutUrl missing in response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ sessionId: 'no-url' }),
      } as unknown as Response);
      const service = await buildService();
      await expect(
        service.createCheckoutSession('q', 'u', 'p', 's', 'c'),
      ).rejects.toThrow(/missing checkoutUrl/);
    });

    it('DhanamBillingUpstreamError maps to HTTP 502', () => {
      const err = new DhanamBillingUpstreamError('test');
      // BadGatewayException defaults to status 502
      expect(err.getStatus()).toBe(502);
    });
  });
});
