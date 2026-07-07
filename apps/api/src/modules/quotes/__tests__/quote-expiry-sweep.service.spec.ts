/**
 * Expiry sweep tests: past-validity QUOTED / AUTO_QUOTED quotes flip to
 * EXPIRED and emit the PhyndCRM `cotiza:quote_expired` lifecycle event.
 */
import { QuoteExpirySweepService } from '../services/quote-expiry-sweep.service';
import { QuoteStatus } from '@cotiza/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { QuoteLifecycleEventsService } from '../../../integrations/phyndcrm/quote-lifecycle-events.service';

describe('QuoteExpirySweepService', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');

  const makeQuote = (overrides: Record<string, unknown> = {}) => ({
    id: 'quote-1',
    number: 'Q-2026-06-0001',
    tenantId: 'tenant-1',
    currency: 'MXN',
    customerId: 'cust-1',
    status: QuoteStatus.QUOTED,
    validityUntil: new Date('2026-07-01T00:00:00.000Z'),
    total: 1000,
    totalPrice: null,
    totals: null,
    metadata: {},
    customer: { email: 'client@example.com' },
    ...overrides,
  });

  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let emit: jest.Mock;
  let service: QuoteExpirySweepService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    emit = jest.fn();

    const prisma = {
      quote: { findMany, updateMany },
    } as unknown as PrismaService;
    const lifecycle = { emit } as unknown as QuoteLifecycleEventsService;

    service = new QuoteExpirySweepService(prisma, lifecycle);
  });

  it('queries only expirable statuses past validity', async () => {
    await service.sweep(now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: [QuoteStatus.QUOTED, QuoteStatus.AUTO_QUOTED] },
          validityUntil: { lt: now },
        },
      }),
    );
  });

  it('flips each candidate to EXPIRED with a status-guarded update and emits the event', async () => {
    findMany.mockResolvedValue([makeQuote()]);

    const result = await service.sweep(now);

    expect(result).toEqual({ expired: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'quote-1', status: { in: [QuoteStatus.QUOTED, QuoteStatus.AUTO_QUOTED] } },
      data: { status: QuoteStatus.EXPIRED },
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'expired',
      expect.objectContaining({ id: 'quote-1', number: 'Q-2026-06-0001' }),
      expect.objectContaining({
        contactEmail: 'client@example.com',
        metadata: { valid_until: '2026-07-01T00:00:00.000Z' },
      }),
    );
  });

  it('does NOT emit when the guarded flip loses the race (count 0)', async () => {
    findMany.mockResolvedValue([makeQuote()]);
    updateMany.mockResolvedValue({ count: 0 });

    const result = await service.sweep(now);

    expect(result).toEqual({ expired: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('one quote failing does not stop the rest of the batch', async () => {
    findMany.mockResolvedValue([
      makeQuote({ id: 'quote-1' }),
      makeQuote({ id: 'quote-2', number: 'Q-2026-06-0002' }),
    ]);
    updateMany.mockRejectedValueOnce(new Error('db hiccup')).mockResolvedValueOnce({ count: 1 });

    const result = await service.sweep(now);

    expect(result).toEqual({ expired: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][1]).toMatchObject({ id: 'quote-2' });
  });

  it('a failing candidate query returns zero instead of throwing (cron safety)', async () => {
    findMany.mockRejectedValue(new Error('db down'));

    await expect(service.sweep(now)).resolves.toEqual({ expired: 0 });
    expect(emit).not.toHaveBeenCalled();
  });
});
