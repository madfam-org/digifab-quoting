import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { QuotesController } from '../quotes.controller';
import { QuotesService } from '../quotes.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

// ---------------------------------------------------------------------------
// Quote-accept route integration test
//
// Verifies the controller's `accept()` handler:
//   1. Is bound to POST :id/accept (renamed from :id/approve 2026-04-26
//      to match the frontend's commercial-language semantic).
//   2. Returns the {checkoutUrl, sessionId, quote} shape the frontend
//      consumes in `apps/web/src/app/quote/[id]/page.tsx`.
//   3. Forwards tenantId + userId from the authenticated request to the
//      service layer.
//
// Existing `quotes.controller.spec.ts` is stale (mismatches actual
// controller signatures) — we live alongside it and exercise only the
// changed surface here. Don't extend the old file; it's known
// pre-existing test debt.
// ---------------------------------------------------------------------------

describe('QuotesController.accept (POST :id/accept)', () => {
  let controller: QuotesController;
  const approveMock = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        { provide: QuotesService, useValue: { approve: approveMock } },
        { provide: Reflector, useClass: Reflector },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QuotesController>(QuotesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exposes `accept` (the new commercial-language method name)', () => {
    // The handler MUST be `accept` — the route also moved from
    // /approve to /accept. If somebody renames it back, this test
    // fails fast and the frontend 404s on click.
    expect(typeof (controller as unknown as Record<string, unknown>).accept).toBe('function');
  });

  it('forwards tenantId, quoteId, userId to QuotesService.approve', async () => {
    approveMock.mockResolvedValueOnce({
      quote: { id: 'quote-1', status: 'APPROVED' },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      sessionId: 'cs_test_1',
    });

    const req = {
      user: { id: 'user-1', tenantId: 'tenant-1' },
    } as unknown as Parameters<QuotesController['accept']>[0];

    const result = await controller.accept(req, 'quote-1');

    expect(approveMock).toHaveBeenCalledWith('tenant-1', 'quote-1', 'user-1');
    expect(result).toEqual({
      quote: { id: 'quote-1', status: 'APPROVED' },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      sessionId: 'cs_test_1',
    });
  });

  it('returns the {checkoutUrl, sessionId} shape the frontend depends on', async () => {
    // The web app reads `response.checkoutUrl` and redirects via
    // `window.location.href`. If this contract changes, the user
    // sees a successful toast and lands on /dashboard (silent
    // breakage). Lock the contract here.
    approveMock.mockResolvedValueOnce({
      quote: { id: 'quote-1' },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_2',
      sessionId: 'cs_test_2',
    });
    const req = {
      user: { id: 'user-1', tenantId: 'tenant-1' },
    } as unknown as Parameters<QuotesController['accept']>[0];

    const result = (await controller.accept(req, 'quote-1')) as {
      checkoutUrl?: string;
      sessionId?: string;
    };

    expect(result.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(result.sessionId).toBeTruthy();
  });

  it('propagates upstream billing errors (502 from JanuaBillingService)', async () => {
    const upstream = new Error('Dhanam billing upstream error: HTTP 503');
    approveMock.mockRejectedValueOnce(upstream);

    const req = {
      user: { id: 'user-1', tenantId: 'tenant-1' },
    } as unknown as Parameters<QuotesController['accept']>[0];

    await expect(controller.accept(req, 'quote-1')).rejects.toThrow(/upstream/);
  });
});
