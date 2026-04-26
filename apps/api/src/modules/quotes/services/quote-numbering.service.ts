import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

@Injectable()
export class QuoteNumberingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async generateQuoteNumber(tenantId: string): Promise<string> {
    // Use Redis for atomic counter to avoid race conditions
    const counterKey = `quote_counter:${tenantId}`;
    const currentYear = new Date().getFullYear();
    const yearKey = `${counterKey}:${currentYear}`;

    // Get or initialize counter for current year
    const counter = await this.redis.incr(yearKey);

    // Set expiry to end of next year to ensure cleanup
    if (counter === 1) {
      const nextYearEnd = new Date(currentYear + 1, 11, 31, 23, 59, 59);
      await this.redis.expire(yearKey, Math.floor((nextYearEnd.getTime() - Date.now()) / 1000));
    }

    // Get tenant code for prefix
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { code: true },
    });

    const tenantCode = tenant?.code?.toUpperCase() || 'QUO';
    const paddedCounter = counter.toString().padStart(4, '0');

    return `${tenantCode}-${currentYear}-${paddedCounter}`;
  }

  async validateQuoteNumber(tenantId: string, quoteNumber: string): Promise<boolean> {
    const existingQuote = await this.prisma.quote.findFirst({
      where: {
        tenantId,
        number: quoteNumber,
      },
    });

    return !existingQuote;
  }

  async parseQuoteNumber(quoteNumber: string): Promise<{
    tenantCode: string;
    year: number;
    sequence: number;
  } | null> {
    const match = quoteNumber.match(/^([A-Z]+)-(\d{4})-(\d+)$/);

    if (!match) {
      return null;
    }

    return {
      tenantCode: match[1],
      year: parseInt(match[2]),
      sequence: parseInt(match[3]),
    };
  }

  async getNextSequencePreview(tenantId: string): Promise<string> {
    const counterKey = `quote_counter:${tenantId}`;
    const currentYear = new Date().getFullYear();
    const yearKey = `${counterKey}:${currentYear}`;

    // Get current counter without incrementing
    const currentCounter = await this.redis.get(yearKey);
    const nextCounter = currentCounter ? parseInt(currentCounter as string) + 1 : 1;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { code: true },
    });

    const tenantCode = tenant?.code?.toUpperCase() || 'QUO';
    const paddedCounter = nextCounter.toString().padStart(4, '0');

    return `${tenantCode}-${currentYear}-${paddedCounter}`;
  }
}
