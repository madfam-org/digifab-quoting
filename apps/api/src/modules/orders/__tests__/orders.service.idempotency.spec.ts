/**
 * Idempotency tests for OrdersService.createOrderFromQuote — the
 * payment.succeeded webhook can be replayed by the provider, and a
 * second delivery for the same quote must NOT create a second order or
 * re-fire the ORDERED fan-out (handleOrdered).
 */
import { BadRequestException } from '@nestjs/common';
import { OrdersService } from '../orders.service';
import { QuoteStatus, OrderStatus } from '@cotiza/shared';

function buildService() {
  const tx = {
    order: { create: jest.fn() },
    quote: { update: jest.fn() },
    paymentIntent: { update: jest.fn() },
  };
  const prisma = {
    quote: { findFirst: jest.fn() },
    order: { findFirst: jest.fn() },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const jobsService = { addJob: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  const quotesService = { handleOrdered: jest.fn().mockResolvedValue(undefined) };

  const service = new OrdersService(prisma as never, jobsService as never, quotesService as never);
  return { service, prisma, tx, jobsService, quotesService };
}

const approvedQuote = {
  id: 'quote-1',
  tenantId: 'tenant-1',
  customerId: 'cust-1',
  number: 'Q-2026-07-0001',
  status: QuoteStatus.APPROVED,
  subtotal: 1000,
  tax: 160,
  shipping: 0,
  totalPrice: 1160,
  currency: 'MXN',
  items: [
    {
      id: 'item-1',
      partId: 'part-1',
      quantity: 2,
      process: 'FFF',
      material: 'PLA',
      selections: {},
      unitPrice: 500,
      totalPrice: 1000,
      leadTime: 5,
    },
  ],
  customer: { id: 'cust-1', email: 'client@example.com', name: 'Client' },
};

const existingOrder = {
  id: 'order-1',
  orderNumber: 'ORD-EXISTING01',
  quoteId: 'quote-1',
  tenantId: 'tenant-1',
  status: OrderStatus.PENDING,
};

describe('OrdersService.createOrderFromQuote idempotency', () => {
  it('creates the order and fires handleOrdered exactly once on first payment', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(approvedQuote);
    h.prisma.order.findFirst.mockResolvedValue(null);
    h.tx.order.create.mockResolvedValue({ ...existingOrder, orderItems: [] });

    const order = await h.service.createOrderFromQuote('quote-1', 'tenant-1');

    expect(order.id).toBe('order-1');
    expect(h.tx.quote.update).toHaveBeenCalledWith({
      where: { id: 'quote-1' },
      data: { status: QuoteStatus.ORDERED },
    });
    expect(h.quotesService.handleOrdered).toHaveBeenCalledTimes(1);
    expect(h.quotesService.handleOrdered).toHaveBeenCalledWith('tenant-1', 'quote-1', 'order-1');
  });

  it('returns the existing order on a replayed payment — no new order, no fan-out', async () => {
    const h = buildService();
    // After the first payment the quote is ORDERED — the replay must
    // still resolve (the old code threw "must be approved" here).
    h.prisma.quote.findFirst.mockResolvedValue({
      ...approvedQuote,
      status: QuoteStatus.ORDERED,
    });
    h.prisma.order.findFirst.mockResolvedValue(existingOrder);

    const order = await h.service.createOrderFromQuote('quote-1', 'tenant-1');

    expect(order).toBe(existingOrder);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.quotesService.handleOrdered).not.toHaveBeenCalled();
    expect(h.jobsService.addJob).not.toHaveBeenCalled();
  });

  it('still refuses non-approved quotes when no order exists yet', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue({ ...approvedQuote, status: QuoteStatus.QUOTED });
    h.prisma.order.findFirst.mockResolvedValue(null);

    await expect(h.service.createOrderFromQuote('quote-1', 'tenant-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(h.quotesService.handleOrdered).not.toHaveBeenCalled();
  });

  it('queues the order-confirmation email to the real customer', async () => {
    const h = buildService();
    h.prisma.quote.findFirst.mockResolvedValue(approvedQuote);
    h.prisma.order.findFirst.mockResolvedValue(null);
    h.tx.order.create.mockResolvedValue({ ...existingOrder, orderItems: [] });

    await h.service.createOrderFromQuote('quote-1', 'tenant-1');

    expect(h.jobsService.addJob).toHaveBeenCalledWith(
      'email-notification',
      expect.objectContaining({
        type: 'quote-accepted',
        recipientEmail: 'client@example.com',
      }),
    );
  });
});
