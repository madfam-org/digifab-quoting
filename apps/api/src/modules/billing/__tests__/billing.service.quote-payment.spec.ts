/**
 * Payment → order wiring tests for BillingService.handleJanuaPaymentSucceeded.
 *
 * The Dhanam checkout mint (JanuaBillingService.createCheckoutSession)
 * stamps `metadata.cotiza_quote_id` on the payment; when that key comes
 * back on payment.succeeded, the quote must be converted into an order
 * (APPROVED → ORDERED) idempotently — and must NOT be double-booked as
 * a tenant subscription invoice.
 */
import { BillingService } from '../billing.service';

function buildService() {
  const prisma = {
    quote: { findUnique: jest.fn() },
    order: { findFirst: jest.fn() },
    tenant: { findFirst: jest.fn(), findUnique: jest.fn() },
    invoice: { create: jest.fn() },
  };
  const usageTracking = { getUsageSummary: jest.fn() };
  const pricingTierService = { getTier: jest.fn() };
  const januaBilling = { isEnabled: jest.fn().mockReturnValue(false) };
  const ordersService = {
    createOrderFromQuote: jest.fn().mockResolvedValue({
      id: 'order-1',
      orderNumber: 'ORD-0000000001',
    }),
  };

  const service = new BillingService(
    prisma as never,
    usageTracking as never,
    pricingTierService as never,
    januaBilling as never,
    ordersService as never,
  );

  return { service, prisma, ordersService };
}

function paymentPayload(metadata?: Record<string, unknown>) {
  return {
    id: 'evt-1',
    type: 'payment.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      customer_id: 'janua-cust-1',
      amount: 1160,
      currency: 'MXN',
      provider: 'stripe',
      ...(metadata && { metadata }),
    },
  };
}

const quote = {
  id: 'quote-1',
  tenantId: 'tenant-1',
  status: 'approved',
  currency: 'MXN',
};

describe('BillingService.handleJanuaPaymentSucceeded — quote revenue path', () => {
  it('creates an order from the quote when metadata carries cotiza_quote_id', async () => {
    const h = buildService();
    h.prisma.quote.findUnique.mockResolvedValue(quote);
    h.prisma.order.findFirst.mockResolvedValue(null);

    await h.service.handleJanuaPaymentSucceeded(paymentPayload({ cotiza_quote_id: 'quote-1' }));

    expect(h.prisma.quote.findUnique).toHaveBeenCalledWith({ where: { id: 'quote-1' } });
    expect(h.ordersService.createOrderFromQuote).toHaveBeenCalledTimes(1);
    expect(h.ordersService.createOrderFromQuote).toHaveBeenCalledWith('quote-1', 'tenant-1');
    // Must NOT double-book as a subscription invoice.
    expect(h.prisma.invoice.create).not.toHaveBeenCalled();
    expect(h.prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('also accepts the Janua mint key (metadata.quote_id)', async () => {
    const h = buildService();
    h.prisma.quote.findUnique.mockResolvedValue(quote);
    h.prisma.order.findFirst.mockResolvedValue(null);

    await h.service.handleJanuaPaymentSucceeded(paymentPayload({ quote_id: 'quote-1' }));

    expect(h.ordersService.createOrderFromQuote).toHaveBeenCalledWith('quote-1', 'tenant-1');
  });

  it('is idempotent: a replayed payment.succeeded for an ordered quote creates nothing', async () => {
    const h = buildService();
    h.prisma.quote.findUnique.mockResolvedValue({ ...quote, status: 'ordered' });
    h.prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'ORD-0000000001',
      quoteId: 'quote-1',
    });

    await h.service.handleJanuaPaymentSucceeded(paymentPayload({ cotiza_quote_id: 'quote-1' }));
    await h.service.handleJanuaPaymentSucceeded(paymentPayload({ cotiza_quote_id: 'quote-1' }));

    expect(h.ordersService.createOrderFromQuote).not.toHaveBeenCalled();
    expect(h.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('a failed order creation is logged, not thrown, and never falls through to invoicing', async () => {
    const h = buildService();
    h.prisma.quote.findUnique.mockResolvedValue(quote);
    h.prisma.order.findFirst.mockResolvedValue(null);
    h.ordersService.createOrderFromQuote.mockRejectedValue(new Error('quote not approved'));

    await expect(
      h.service.handleJanuaPaymentSucceeded(paymentPayload({ cotiza_quote_id: 'quote-1' })),
    ).resolves.toBeUndefined();
    expect(h.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('falls through to the subscription-invoice path when metadata has no quote id', async () => {
    const h = buildService();
    h.prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-1' });
    h.prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });

    await h.service.handleJanuaPaymentSucceeded(paymentPayload());

    expect(h.ordersService.createOrderFromQuote).not.toHaveBeenCalled();
    expect(h.prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-1', status: 'paid' }),
      }),
    );
  });

  it('ignores billing-invoice payments even though they reuse the quote_id metadata slot', async () => {
    const h = buildService();
    h.prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-1' });
    h.prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });

    await h.service.handleJanuaPaymentSucceeded(
      paymentPayload({ quote_id: 'invoice-77', type: 'billing_invoice', invoiceId: 'invoice-77' }),
    );

    expect(h.ordersService.createOrderFromQuote).not.toHaveBeenCalled();
    expect(h.prisma.quote.findUnique).not.toHaveBeenCalled();
  });

  it('falls through to legacy handling when the referenced quote does not exist', async () => {
    const h = buildService();
    h.prisma.quote.findUnique.mockResolvedValue(null);
    h.prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-1' });
    h.prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });

    await h.service.handleJanuaPaymentSucceeded(paymentPayload({ cotiza_quote_id: 'ghost' }));

    expect(h.ordersService.createOrderFromQuote).not.toHaveBeenCalled();
    expect(h.prisma.invoice.create).toHaveBeenCalled();
  });
});
