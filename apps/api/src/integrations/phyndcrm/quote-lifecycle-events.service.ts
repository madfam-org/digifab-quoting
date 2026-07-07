/**
 * Cotiza → PhyndCRM quote lifecycle event emitter.
 *
 * Single choke-point for the full quote lifecycle contract consumed by
 * PhyndCRM (POST ${PHYNDCRM_API_URL}/api/v1/engagements/events, HMAC
 * signed by PhyndCrmEngagementService).
 *
 * Contract (cross-repo — PhyndCRM consumes exactly this):
 *
 *   event_type                 dedup_key
 *   ------------------------   ------------------------------------------
 *   cotiza:quote_sent          cotiza:<quoteId>:sent
 *   cotiza:quote_viewed        cotiza:<quoteId>:viewed
 *   cotiza:quote_approved      cotiza:<quoteId>:approved
 *   quote_approved (alias)     cotiza:<quoteId>:milestone:quote_approved
 *   cotiza:quote_rejected      cotiza:<quoteId>:rejected
 *   cotiza:quote_expired       cotiza:<quoteId>:expired
 *   cotiza:quote_ordered       cotiza:<quoteId>:ordered
 *
 * Every event's metadata always carries: cotiza_quote_id, quote_number,
 * total (stringified), currency; plus engagement_id when the quote is
 * linked to a PhyndCRM engagement, contact_email when known, and
 * cotiza_customer_id when the quote has a customer — so PhyndCRM can
 * resolve the engagement/contact when engagement_id is absent.
 *
 * Resilience: emit() is fire-and-forget. It never throws and never
 * blocks the quote transition on PhyndCRM availability — errors are
 * logged by the underlying PhyndCrmEngagementService (and defensively
 * caught here).
 *
 * Environment (reused from PhyndCrmEngagementService):
 *   PHYNDCRM_API_URL, PHYNDCRM_ENGAGEMENT_SECRET, PHYNDCRM_WEBHOOK_TIMEOUT
 */
import { Injectable, Logger } from '@nestjs/common';
import { PhyndCrmEngagementService } from './phyndcrm-engagement.service';

export type QuoteLifecycleState =
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'ordered';

/**
 * Minimal quote shape the emitter needs. Structurally compatible with
 * the Prisma Quote model (Decimal fields accepted via toString()).
 */
export interface LifecycleQuote {
  id: string;
  number: string;
  currency: string;
  customerId?: string | null;
  total?: { toString(): string } | number | string | null;
  totalPrice?: { toString(): string } | number | string | null;
  totals?: unknown;
  metadata?: unknown;
}

export interface EmitOptions {
  /** Customer email, forwarded so PhyndCRM can resolve the contact. */
  contactEmail?: string | null;
  /** Human-readable timeline message. */
  message?: string;
  /** Engagement status hint (PhyndCRM-side aggregate status). */
  status?: string;
  /** Extra metadata merged on top of the base payload fields. */
  metadata?: Record<string, unknown>;
}

const EVENT_STATUS: Partial<Record<QuoteLifecycleState, string>> = {
  sent: 'in_progress',
  viewed: 'in_progress',
  approved: 'in_progress',
  ordered: 'in_progress',
};

@Injectable()
export class QuoteLifecycleEventsService {
  private readonly logger = new Logger(QuoteLifecycleEventsService.name);

  constructor(private readonly phyndcrm: PhyndCrmEngagementService) {}

  /**
   * Fire-and-forget lifecycle event emission. Never throws; never
   * blocks the caller on PhyndCRM availability.
   */
  emit(state: QuoteLifecycleState, quote: LifecycleQuote, opts: EmitOptions = {}): void {
    void this.emitAsync(state, quote, opts).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PhyndCRM lifecycle emit(${state}) failed for quote=${quote?.id}: ${msg}`);
    });
  }

  /**
   * Awaitable variant (used by tests and by callers already running in
   * a fire-and-forget context). Errors inside the HTTP layer are
   * swallowed+logged by PhyndCrmEngagementService.
   */
  async emitAsync(
    state: QuoteLifecycleState,
    quote: LifecycleQuote,
    opts: EmitOptions = {},
  ): Promise<void> {
    const engagementId = this.phyndcrm.getEngagementId(
      quote.metadata as Record<string, unknown> | null,
    );
    const timestamp = new Date().toISOString();

    const metadata: Record<string, unknown> = {
      cotiza_quote_id: quote.id,
      quote_number: quote.number,
      total: this.resolveTotal(quote),
      currency: quote.currency,
      ...(engagementId && { engagement_id: engagementId }),
      ...(opts.contactEmail && { contact_email: opts.contactEmail }),
      ...(quote.customerId && { cotiza_customer_id: quote.customerId }),
      ...opts.metadata,
    };

    const events: Array<{ event_type: string; dedup_key: string }> = [
      {
        event_type: `cotiza:quote_${state}`,
        dedup_key: `cotiza:${quote.id}:${state}`,
      },
    ];

    // Canonical milestone alias consumed by PhyndCRM's engagement
    // milestone tracker (separate dedup namespace from the lifecycle
    // stream so both are stored).
    if (state === 'approved') {
      events.push({
        event_type: 'quote_approved',
        dedup_key: `cotiza:${quote.id}:milestone:quote_approved`,
      });
    }

    await Promise.all(
      events.map((e) =>
        this.phyndcrm.recordEvent({
          ...(engagementId && { engagement_id: engagementId }),
          source: 'cotiza',
          event_type: e.event_type,
          ...(opts.status ?? EVENT_STATUS[state]
            ? { status: opts.status ?? EVENT_STATUS[state] }
            : {}),
          ...(opts.message && { message: opts.message }),
          timestamp,
          dedup_key: e.dedup_key,
          metadata,
        }),
      ),
    );
  }

  /**
   * Best-effort total: dedicated columns first, then the totals JSON
   * written by calculate() (which does not populate total/totalPrice).
   */
  private resolveTotal(quote: LifecycleQuote): string {
    const direct = quote.total ?? quote.totalPrice;
    if (direct !== null && direct !== undefined) {
      return direct.toString();
    }
    const totals = quote.totals as { grandTotal?: number | string } | null | undefined;
    if (totals && totals.grandTotal !== undefined && totals.grandTotal !== null) {
      return totals.grandTotal.toString();
    }
    return '0';
  }
}
