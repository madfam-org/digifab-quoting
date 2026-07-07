/**
 * Quote expiry sweep.
 *
 * Hourly cron that flips past-validity QUOTED / AUTO_QUOTED quotes to
 * EXPIRED and emits the PhyndCRM `cotiza:quote_expired` lifecycle event
 * (dedup_key cotiza:<quoteId>:expired) for each.
 *
 * Notes:
 * - The status flip uses a guarded updateMany (id + still-expirable
 *   status) so a concurrent approve/reject/sweep can't double-fire —
 *   the event is only emitted when this sweep actually won the flip.
 * - Scheduling relies on the app-wide ScheduleModule.forRoot()
 *   registration (see geo.module.ts) — same pattern as
 *   CurrencyService's rate-refresh cron.
 * - PhyndCRM emission is fire-and-forget; a PhyndCRM outage never
 *   blocks or fails the sweep.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuoteStatus } from '@cotiza/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { QuoteLifecycleEventsService } from '../../../integrations/phyndcrm/quote-lifecycle-events.service';

/** Upper bound per sweep run; the next hourly run picks up the rest. */
const SWEEP_BATCH_SIZE = 500;

const EXPIRABLE_STATUSES: string[] = [QuoteStatus.QUOTED, QuoteStatus.AUTO_QUOTED];

@Injectable()
export class QuoteExpirySweepService {
  private readonly logger = new Logger(QuoteExpirySweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteLifecycle: QuoteLifecycleEventsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(now: Date = new Date()): Promise<{ expired: number }> {
    let candidates: Array<{
      id: string;
      number: string;
      tenantId: string;
      currency: string;
      customerId: string | null;
      validityUntil: Date;
      total: unknown;
      totalPrice: unknown;
      totals: unknown;
      metadata: unknown;
      customer: { email: string } | null;
    }>;

    try {
      candidates = (await this.prisma.quote.findMany({
        where: {
          status: { in: EXPIRABLE_STATUSES },
          validityUntil: { lt: now },
        },
        include: { customer: { select: { email: true } } },
        take: SWEEP_BATCH_SIZE,
        orderBy: { validityUntil: 'asc' },
      })) as unknown as typeof candidates;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Expiry sweep query failed: ${msg}`);
      return { expired: 0 };
    }

    let expired = 0;
    for (const quote of candidates) {
      try {
        // Guarded flip: only wins when the quote is still expirable.
        const result = await this.prisma.quote.updateMany({
          where: { id: quote.id, status: { in: EXPIRABLE_STATUSES } },
          data: { status: QuoteStatus.EXPIRED },
        });
        if (result.count === 0) {
          continue; // Lost the race (approved/rejected/expired elsewhere).
        }
        expired += 1;

        this.quoteLifecycle.emit(
          'expired',
          {
            id: quote.id,
            number: quote.number,
            currency: quote.currency,
            customerId: quote.customerId,
            total: quote.total as never,
            totalPrice: quote.totalPrice as never,
            totals: quote.totals,
            metadata: quote.metadata,
          },
          {
            contactEmail: quote.customer?.email,
            message: `Quote ${quote.number} expired (validity ended ${quote.validityUntil.toISOString()})`,
            metadata: { valid_until: quote.validityUntil.toISOString() },
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Expiry sweep failed for quote=${quote.id}: ${msg}`);
      }
    }

    if (candidates.length > 0) {
      this.logger.log(`Expiry sweep: ${expired}/${candidates.length} quote(s) flipped to EXPIRED`);
    }
    return { expired };
  }
}
