/**
 * Lifecycle-ops tests for QuotesService:
 *   - approve() loud checkout degradation (checkoutUnavailable flag)
 *   - quote-ready delivery (email + cotiza:quote_sent) on QUOTED /
 *     AUTO_QUOTED transitions
 *   - reject() transition + cotiza:quote_rejected
 *   - recordCustomerView() first-view stamp + cotiza:quote_viewed
 *
 * QuotesService is constructed directly (no Nest TestingModule) with
 * narrow mocks — same approach as quote-accept-route.spec.ts. The
 * pre-existing quotes.service.spec.ts is stale test debt; don't extend
 * it.
 */
import { BadRequestException } from '@nestjs/common';
import { QuotesService } from '../quotes.service';
import { QuoteStatus } from '@cotiza/shared';

function buildService() {
  const prisma = {
    quote: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    quoteItem: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    tenant: { findUnique: jest.fn() },
    file: { findFirst: jest.fn(), update: jest.fn() },
  };
  const pricingService = { calculateQuoteItem: jest.fn() };
  const pricingResolver = {
    resolveGeometry: jest.fn().mockReturnValue({
      volumeCm3: 10,
      surfaceAreaCm2: 80,
      boundingBox: { x: 40, y: 30, z: 20 },
      source: 'analysis',
    }),
    resolveMaterial: jest.fn().mockResolvedValue({ id: 'mat-1' }),
    resolveMachine: jest.fn().mockResolvedValue({ id: 'mach-1' }),
  };
  const quoteCacheService = { getOrCalculateQuote: jest.fn() };
  const tenantCacheService = {
    getTenantConfig: jest.fn(),
    getTenantFeatures: jest.fn(),
    getPricingSettings: jest.fn().mockResolvedValue({}),
  };
  const jobsService = { addJob: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  const filesService = { getFileUrl: jest.fn() };
  const phyndcrmEngagement = {
    getEngagementId: (metadata: Record<string, unknown> | null | undefined) => {
      const id = metadata?.phyndcrmEngagementId;
      return typeof id === 'string' && id.length > 0 ? id : null;
    },
    recordEvent: jest.fn().mockResolvedValue(undefined),
    recordArtifact: jest.fn().mockResolvedValue(undefined),
  };
  const quoteLifecycle = { emit: jest.fn() };
  const januaEmail = {
    available: true,
    sendQuoteReadyEmail: jest.fn().mockResolvedValue({ success: true }),
  };
  const karafielCompliance = { resolveReceptorRfc: jest.fn(), issueCfdi: jest.fn() };
  const dhanamMilestone = { createInvoicesForMilestones: jest.fn().mockResolvedValue(undefined) };
  const pravaraDispatch = { dispatchJob: jest.fn().mockResolvedValue(undefined) };
  const engagements = { ensureProjection: jest.fn() };
  const januaBilling = {
    isDhanamCheckoutEnabled: jest.fn().mockReturnValue(true),
    createCheckoutSession: jest.fn().mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      sessionId: 'cs_test_1',
    }),
  };
  const dhanamRelay = { relay: jest.fn().mockResolvedValue(undefined) };
  const configService = {
    get: jest.fn((_key: string, def?: unknown) => def),
  };

  const service = new QuotesService(
    prisma as never,
    pricingService as never,
    pricingResolver as never,
    quoteCacheService as never,
    tenantCacheService as never,
    jobsService as never,
    filesService as never,
    phyndcrmEngagement as never,
    quoteLifecycle as never,
    januaEmail as never,
    karafielCompliance as never,
    dhanamMilestone as never,
    pravaraDispatch as never,
    engagements as never,
    januaBilling as never,
    dhanamRelay as never,
    configService as never,
  );

  return {
    service,
    prisma,
    quoteCacheService,
    tenantCacheService,
    jobsService,
    quoteLifecycle,
    januaEmail,
    januaBilling,
    dhanamRelay,
  };
}

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    number: 'Q-2026-07-0001',
    quoteType: 'fab',
    status: QuoteStatus.QUOTED,
    currency: 'MXN',
    validityUntil: futureDate,
    total: 1160,
    totalPrice: 1160,
    totals: { grandTotal: 1160, currency: 'MXN' },
    metadata: {},
    items: [],
    customer: { id: 'cust-1', email: 'client@example.com', name: 'Client' },
    ...overrides,
  };
}

describe('QuotesService.approve — checkout degradation', () => {
  it('returns checkoutUrl + sessionId and NO degradation flag when Dhanam is configured', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.APPROVED }));

    const result = await h.service.approve('tenant-1', 'quote-1', 'cust-1');

    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(result.sessionId).toBe('cs_test_1');
    expect(result.checkoutUnavailable).toBeUndefined();
    expect(result.checkoutUnavailableReason).toBeUndefined();
  });

  it('still approves but flags checkoutUnavailable with a reason when Dhanam is unconfigured', async () => {
    const h = buildService();
    h.januaBilling.isDhanamCheckoutEnabled.mockReturnValue(false);
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.APPROVED }));

    const result = await h.service.approve('tenant-1', 'quote-1', 'cust-1');

    expect(result.quote.status).toBe(QuoteStatus.APPROVED);
    expect(result.checkoutUrl).toBeUndefined();
    expect(result.checkoutUnavailable).toBe(true);
    expect(result.checkoutUnavailableReason).toMatch(/DHANAM_API_URL/);
    expect(h.januaBilling.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('emits cotiza:quote_approved with checkout_unavailable metadata on degraded approve', async () => {
    const h = buildService();
    h.januaBilling.isDhanamCheckoutEnabled.mockReturnValue(false);
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.APPROVED }));

    await h.service.approve('tenant-1', 'quote-1', 'cust-1');

    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'approved',
      expect.objectContaining({ id: 'quote-1' }),
      expect.objectContaining({
        contactEmail: 'client@example.com',
        metadata: expect.objectContaining({
          checkout_unavailable: true,
          checkout_unavailable_reason: expect.stringContaining('DHANAM_API_TOKEN'),
        }),
      }),
    );
  });

  it('emits cotiza:quote_approved with session_id on the happy path (no engagement required)', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.APPROVED }));

    await h.service.approve('tenant-1', 'quote-1', 'cust-1');

    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'approved',
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ session_id: 'cs_test_1' }),
      }),
    );
  });
});

describe('QuotesService.dispatchQuoteReady — quote-ready delivery', () => {
  it('sends the Janua quote-ready email with the quote page link and emits cotiza:quote_sent', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: QuoteStatus.AUTO_QUOTED, items: [{ id: 'i1' }, { id: 'i2' }] }),
    );

    await h.service.dispatchQuoteReady('tenant-1', 'quote-1');

    expect(h.januaEmail.sendQuoteReadyEmail).toHaveBeenCalledWith(
      'client@example.com',
      'Q-2026-07-0001',
      1160,
      'MXN',
      futureDate.toISOString(),
      2,
      'http://localhost:3002/quote/quote-1',
    );
    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'sent',
      expect.objectContaining({ id: 'quote-1' }),
      expect.objectContaining({
        contactEmail: 'client@example.com',
        metadata: expect.objectContaining({
          quote_url: 'http://localhost:3002/quote/quote-1',
        }),
      }),
    );
  });

  it('falls back to the Bull quote-ready email job when Janua email is unavailable', async () => {
    const h = buildService();
    h.januaEmail.available = false;
    h.prisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: QuoteStatus.QUOTED, items: [{ id: 'i1' }] }),
    );

    await h.service.dispatchQuoteReady('tenant-1', 'quote-1');

    expect(h.januaEmail.sendQuoteReadyEmail).not.toHaveBeenCalled();
    expect(h.jobsService.addJob).toHaveBeenCalledWith(
      'email-notification',
      expect.objectContaining({
        type: 'quote-ready',
        recipientEmail: 'client@example.com',
        templateData: expect.objectContaining({
          quoteNumber: 'Q-2026-07-0001',
          quoteUrl: 'http://localhost:3002/quote/quote-1',
        }),
      }),
    );
    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'sent',
      expect.anything(),
      expect.anything(),
    );
  });

  it('skips the email but still emits the event when the quote has no customer email', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: QuoteStatus.AUTO_QUOTED, customer: null, customerId: null }),
    );

    await h.service.dispatchQuoteReady('tenant-1', 'quote-1');

    expect(h.januaEmail.sendQuoteReadyEmail).not.toHaveBeenCalled();
    expect(h.jobsService.addJob).not.toHaveBeenCalled();
    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'sent',
      expect.anything(),
      expect.anything(),
    );
  });

  it('no-ops when the quote is not in a ready status (stale trigger)', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: QuoteStatus.APPROVED }));

    await h.service.dispatchQuoteReady('tenant-1', 'quote-1');

    expect(h.januaEmail.sendQuoteReadyEmail).not.toHaveBeenCalled();
    expect(h.quoteLifecycle.emit).not.toHaveBeenCalled();
  });

  it('an email failure never throws and still emits the lifecycle event', async () => {
    const h = buildService();
    h.januaEmail.sendQuoteReadyEmail.mockRejectedValue(new Error('smtp down'));
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: QuoteStatus.QUOTED }));

    await expect(h.service.dispatchQuoteReady('tenant-1', 'quote-1')).resolves.toBeUndefined();
    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'sent',
      expect.anything(),
      expect.anything(),
    );
  });

  it('is triggered by calculateServices reaching QUOTED', async () => {
    const h = buildService();
    const servicesQuote = makeQuote({
      quoteType: 'services',
      status: QuoteStatus.DRAFT,
      items: [{ id: 'i1', unitPrice: 100, quantity: 2, totalPrice: 200 }],
    });
    h.prisma.quote.findFirst.mockResolvedValue(servicesQuote);
    h.prisma.quote.findUniqueOrThrow.mockResolvedValue(servicesQuote);
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.QUOTED }));
    const dispatchSpy = jest.spyOn(h.service, 'dispatchQuoteReady').mockResolvedValue(undefined);

    await h.service.calculate('tenant-1', 'quote-1', {});

    expect(dispatchSpy).toHaveBeenCalledWith('tenant-1', 'quote-1');
  });

  it('is triggered by calculate() reaching AUTO_QUOTED (fab path)', async () => {
    const h = buildService();
    const item = {
      id: 'item-1',
      processCode: 'FFF',
      selections: {},
      quantity: 1,
      materialId: 'mat-1',
      files: [],
    };
    h.prisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: QuoteStatus.DRAFT, items: [item] }),
    );
    h.prisma.quoteItem.findFirst.mockResolvedValue(item);
    h.quoteCacheService.getOrCalculateQuote.mockResolvedValue({
      pricing: { unitCost: 10, totalCost: 10, margin: 0.3, finalPrice: 10 },
      manufacturing: { estimatedTime: 3, machineCost: 4, materialCost: 3 },
      timestamp: Date.now(),
    });
    h.prisma.quoteItem.update.mockResolvedValue({ ...item, totalPrice: 10 });
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.AUTO_QUOTED }));
    const dispatchSpy = jest.spyOn(h.service, 'dispatchQuoteReady').mockResolvedValue(undefined);

    await h.service.calculate('tenant-1', 'quote-1', {});

    expect(dispatchSpy).toHaveBeenCalledWith('tenant-1', 'quote-1');
  });
});

describe('QuotesService.reject', () => {
  it('transitions QUOTED → REJECTED, stores the reason, and emits cotiza:quote_rejected', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.REJECTED }));

    const result = await h.service.reject('tenant-1', 'quote-1', 'cust-1', 'too expensive');

    expect(result.status).toBe(QuoteStatus.REJECTED);
    expect(h.prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'quote-1' },
        data: expect.objectContaining({
          status: QuoteStatus.REJECTED,
          metadata: expect.objectContaining({ rejectionReason: 'too expensive' }),
        }),
      }),
    );
    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'rejected',
      expect.objectContaining({ status: QuoteStatus.REJECTED }),
      expect.objectContaining({
        contactEmail: 'client@example.com',
        metadata: { rejection_reason: 'too expensive' },
      }),
    );
  });

  it('rejects AUTO_QUOTED quotes too', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: QuoteStatus.AUTO_QUOTED }));
    h.prisma.quote.update.mockResolvedValue(makeQuote({ status: QuoteStatus.REJECTED }));

    await expect(h.service.reject('tenant-1', 'quote-1', 'cust-1')).resolves.toMatchObject({
      status: QuoteStatus.REJECTED,
    });
  });

  it('refuses when the requester is not the quote customer', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());

    await expect(h.service.reject('tenant-1', 'quote-1', 'someone-else')).rejects.toThrow(
      BadRequestException,
    );
    expect(h.quoteLifecycle.emit).not.toHaveBeenCalled();
  });

  it('refuses non-rejectable statuses', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: QuoteStatus.ORDERED }));

    await expect(h.service.reject('tenant-1', 'quote-1', 'cust-1')).rejects.toThrow(
      'Quote cannot be rejected in current status',
    );
  });
});

describe('QuotesService.recordCustomerView', () => {
  it('stamps firstViewedAt once and emits cotiza:quote_viewed', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());
    h.prisma.quote.update.mockResolvedValue(makeQuote());

    await h.service.recordCustomerView('tenant-1', 'quote-1', {
      id: 'cust-1',
      email: 'client@example.com',
    });

    expect(h.prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({ firstViewedAt: expect.any(String) }),
        },
      }),
    );
    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'viewed',
      expect.objectContaining({ id: 'quote-1' }),
      expect.objectContaining({
        contactEmail: 'client@example.com',
        metadata: expect.objectContaining({ first_viewed_at: expect.any(String) }),
      }),
    );
  });

  it('does nothing on subsequent views (firstViewedAt already stamped)', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(
      makeQuote({ metadata: { firstViewedAt: '2026-07-01T00:00:00.000Z' } }),
    );

    await h.service.recordCustomerView('tenant-1', 'quote-1', { id: 'cust-1' });

    expect(h.prisma.quote.update).not.toHaveBeenCalled();
    expect(h.quoteLifecycle.emit).not.toHaveBeenCalled();
  });

  it('ignores views by anyone other than the quote customer', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote());

    await h.service.recordCustomerView('tenant-1', 'quote-1', { id: 'staff-1' });

    expect(h.prisma.quote.update).not.toHaveBeenCalled();
    expect(h.quoteLifecycle.emit).not.toHaveBeenCalled();
  });

  it('never throws (fire-and-forget contract)', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      h.service.recordCustomerView('tenant-1', 'quote-1', { id: 'cust-1' }),
    ).resolves.toBeUndefined();
  });
});

describe('QuotesService.handleOrdered — cotiza:quote_ordered emission', () => {
  it('emits the ordered lifecycle event with the order id', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: QuoteStatus.ORDERED }));
    h.prisma.tenant.findUnique.mockResolvedValue(null);

    await h.service.handleOrdered('tenant-1', 'quote-1', 'order-9');

    expect(h.quoteLifecycle.emit).toHaveBeenCalledWith(
      'ordered',
      expect.objectContaining({ id: 'quote-1' }),
      expect.objectContaining({
        contactEmail: 'client@example.com',
        metadata: { order_id: 'order-9' },
      }),
    );
  });
});
