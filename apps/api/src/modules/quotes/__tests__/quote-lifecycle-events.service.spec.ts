/**
 * Contract tests for the Cotiza → PhyndCRM quote lifecycle emitter.
 *
 * The event_type / dedup_key / metadata shapes asserted here are a
 * CROSS-REPO CONTRACT consumed by PhyndCRM's engagement-events webhook.
 * Do not change them without coordinating with phynd-crm.
 */
import { QuoteLifecycleEventsService } from '../../../integrations/phyndcrm/quote-lifecycle-events.service';
import { PhyndCrmEngagementService } from '../../../integrations/phyndcrm/phyndcrm-engagement.service';

describe('QuoteLifecycleEventsService', () => {
  let recordEvent: jest.Mock;
  let service: QuoteLifecycleEventsService;

  const baseQuote = {
    id: 'quote-1',
    number: 'Q-2026-07-0001',
    currency: 'MXN',
    customerId: 'cust-1',
    total: 1160,
    totalPrice: null,
    totals: null,
    metadata: {},
  };

  beforeEach(() => {
    recordEvent = jest.fn().mockResolvedValue(undefined);
    const phyndcrm = {
      recordEvent,
      // Real resolution logic: link lives at metadata.phyndcrmEngagementId
      getEngagementId: (metadata: Record<string, unknown> | null | undefined) => {
        const id = metadata?.phyndcrmEngagementId;
        return typeof id === 'string' && id.length > 0 ? id : null;
      },
    } as unknown as PhyndCrmEngagementService;
    service = new QuoteLifecycleEventsService(phyndcrm);
  });

  it.each([
    ['sent', 'cotiza:quote_sent', 'cotiza:quote-1:sent'],
    ['viewed', 'cotiza:quote_viewed', 'cotiza:quote-1:viewed'],
    ['rejected', 'cotiza:quote_rejected', 'cotiza:quote-1:rejected'],
    ['expired', 'cotiza:quote_expired', 'cotiza:quote-1:expired'],
    ['ordered', 'cotiza:quote_ordered', 'cotiza:quote-1:ordered'],
  ] as const)('emits %s as event_type=%s with dedup_key=%s', async (state, eventType, dedupKey) => {
    await service.emitAsync(state, baseQuote);

    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cotiza',
        event_type: eventType,
        dedup_key: dedupKey,
      }),
    );
  });

  it('approved emits the canonical event PLUS the milestone alias', async () => {
    await service.emitAsync('approved', baseQuote);

    expect(recordEvent).toHaveBeenCalledTimes(2);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'cotiza:quote_approved',
        dedup_key: 'cotiza:quote-1:approved',
      }),
    );
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'quote_approved',
        dedup_key: 'cotiza:quote-1:milestone:quote_approved',
      }),
    );
  });

  it('always includes the base metadata contract fields', async () => {
    await service.emitAsync('sent', baseQuote, { contactEmail: 'client@example.com' });

    const payload = recordEvent.mock.calls[0][0];
    expect(payload.metadata).toMatchObject({
      cotiza_quote_id: 'quote-1',
      quote_number: 'Q-2026-07-0001',
      total: '1160',
      currency: 'MXN',
      contact_email: 'client@example.com',
      cotiza_customer_id: 'cust-1',
    });
    expect(payload.timestamp).toEqual(expect.any(String));
  });

  it('includes engagement_id (top-level and in metadata) when the quote is linked', async () => {
    const quote = { ...baseQuote, metadata: { phyndcrmEngagementId: 'eng-77' } };

    await service.emitAsync('sent', quote);

    const payload = recordEvent.mock.calls[0][0];
    expect(payload.engagement_id).toBe('eng-77');
    expect(payload.metadata.engagement_id).toBe('eng-77');
  });

  it('still emits when the quote has NO engagement link (resolution via contact fields)', async () => {
    await service.emitAsync('viewed', baseQuote, { contactEmail: 'client@example.com' });

    const payload = recordEvent.mock.calls[0][0];
    expect(payload.engagement_id).toBeUndefined();
    expect(payload.metadata.engagement_id).toBeUndefined();
    expect(payload.metadata.contact_email).toBe('client@example.com');
    expect(payload.metadata.cotiza_customer_id).toBe('cust-1');
  });

  it('resolves total from the totals JSON when total/totalPrice columns are null', async () => {
    const quote = {
      ...baseQuote,
      total: null,
      totalPrice: null,
      totals: { grandTotal: 2321.5, currency: 'MXN' },
    };

    await service.emitAsync('sent', quote);

    expect(recordEvent.mock.calls[0][0].metadata.total).toBe('2321.5');
  });

  it('merges caller-supplied metadata on top of the base fields', async () => {
    await service.emitAsync('ordered', baseQuote, { metadata: { order_id: 'ord-9' } });

    expect(recordEvent.mock.calls[0][0].metadata).toMatchObject({
      cotiza_quote_id: 'quote-1',
      order_id: 'ord-9',
    });
  });

  it('emit() is fire-and-forget: an emitter failure never throws to the caller', async () => {
    recordEvent.mockRejectedValue(new Error('phyndcrm down'));

    expect(() => service.emit('sent', baseQuote)).not.toThrow();
    // Drain the microtask queue so the rejected promise's catch runs.
    await new Promise((resolve) => setImmediate(resolve));
    expect(recordEvent).toHaveBeenCalled();
  });
});
