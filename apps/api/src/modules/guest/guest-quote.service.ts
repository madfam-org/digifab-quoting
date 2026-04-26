import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { QuotesService } from '../quotes/quotes.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateGuestQuote,
  GuestQuote,
  UpdateGuestQuoteItem,
  ProcessType,
  Currency,
} from '@cotiza/shared';

@Injectable()
export class GuestQuoteService {
  private readonly quoteTTL: number;
  private readonly maxQuotesPerSession: number;
  private readonly maxFilesPerQuote: number;

  constructor(
    private readonly redis: RedisService,
    private readonly quotesService: QuotesService,
    private readonly config: ConfigService,
  ) {
    this.quoteTTL = this.config.get('GUEST_QUOTE_TTL', 86400); // 24 hours
    this.maxQuotesPerSession = this.config.get('MAX_GUEST_QUOTES_PER_SESSION', 10);
    this.maxFilesPerQuote = this.config.get('MAX_FILES_PER_GUEST_QUOTE', 5);
  }

  async createQuote(sessionId: string, createDto: CreateGuestQuote): Promise<GuestQuote> {
    // Check rate limits
    await this.checkQuoteLimits(sessionId);

    // Validate files
    if (createDto.files.length > this.maxFilesPerQuote) {
      throw new BadRequestException(`Maximum ${this.maxFilesPerQuote} files allowed per quote`);
    }

    // Process files and calculate pricing
    const quoteItems = await Promise.all(
      createDto.files.map(async (file) => {
        // For demo purposes, create mock analysis
        // In production, this would get actual file analysis
        const analysis = {
          recommendedProcess: '3D_PRINTING' as ProcessType,
          recommendedMaterial: 'PLA',
          volume: 1000,
          boundingBox: { x: 100, y: 100, z: 50 },
          surfaceArea: 5000,
        };

        // Calculate pricing - simplified for guest quotes
        const pricing = {
          unitPrice: 100, // Mock pricing for guest quotes
          totalPrice: 100,
          leadTime: 5,
        };

        return {
          filename: file.filename,
          quantity: 1,
          material: analysis.recommendedMaterial,
          process: analysis.recommendedProcess as unknown as
            | '3D_PRINTING'
            | 'CNC_MACHINING'
            | 'LASER_CUTTING',
          unitPrice: Number(pricing.unitPrice),
          totalPrice: Number(pricing.totalPrice),
          leadTime: Number(pricing.leadTime),
          specifications: {
            volume: analysis.volume,
            boundingBox: analysis.boundingBox,
            surfaceArea: analysis.surfaceArea,
          },
        };
      }),
    );

    // Calculate totals
    const subtotal = quoteItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const taxRate = 0.16; // 16% VAT for Mexico
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    // Create guest quote
    const guestQuote: GuestQuote = {
      id: uuidv4(),
      sessionId,
      items: quoteItems,
      subtotal,
      tax,
      total,
      currency: 'MXN',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + this.quoteTTL * 1000),
    };

    // Store in Redis
    await this.storeQuote(sessionId, guestQuote);

    // Track in session
    await this.trackQuoteInSession(sessionId, guestQuote.id);

    return guestQuote;
  }

  async getQuote(sessionId: string, quoteId: string): Promise<GuestQuote> {
    const key = `guest:quote:${sessionId}:${quoteId}`;
    const data = await this.redis.get(key);

    if (!data) {
      throw new NotFoundException('Quote not found');
    }

    const quote = JSON.parse(data as string);

    // Update access time
    quote.accessedAt = new Date();
    quote.accessCount = (quote.accessCount || 0) + 1;

    await this.redis.setex(key, this.quoteTTL, JSON.stringify(quote));

    return this.parseQuote(quote);
  }

  async updateQuoteItem(
    sessionId: string,
    quoteId: string,
    itemIndex: number,
    updateDto: UpdateGuestQuoteItem,
  ): Promise<GuestQuote> {
    const quote = await this.getQuote(sessionId, quoteId);

    if (itemIndex >= quote.items.length) {
      throw new BadRequestException('Invalid item index');
    }

    const item = quote.items[itemIndex];

    // Update item properties
    if (updateDto.quantity !== undefined) {
      item.quantity = updateDto.quantity;
    }
    if (updateDto.material !== undefined) {
      item.material = updateDto.material;
    }
    if (updateDto.finish !== undefined) {
      item.finish = updateDto.finish;
    }

    // Recalculate pricing - simplified for guest quotes
    const pricing = {
      unitPrice: 100, // Mock pricing for guest quotes
      totalPrice: 100 * item.quantity,
      leadTime: 5,
    };

    item.unitPrice = pricing.unitPrice;
    item.totalPrice = pricing.totalPrice;
    item.leadTime = pricing.leadTime;

    // Recalculate totals
    quote.subtotal = quote.items.reduce((sum, item) => sum + item.totalPrice, 0);
    quote.tax = quote.subtotal * 0.16;
    quote.total = quote.subtotal + quote.tax;
    quote.updatedAt = new Date();

    // Save updated quote
    await this.storeQuote(sessionId, quote);

    return quote;
  }

  async listSessionQuotes(sessionId: string): Promise<GuestQuote[]> {
    const quotesKey = `guest:quotes:${sessionId}`;
    const quoteIds = await this.redis.smembers(quotesKey);

    const quotes = await Promise.all(
      quoteIds.map((id) => this.getQuote(sessionId, id).catch(() => null)),
    );

    return quotes
      .filter((quote) => quote !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private async checkQuoteLimits(sessionId: string): Promise<void> {
    const quotesKey = `guest:quotes:${sessionId}`;
    const quoteCount = await this.redis.scard(quotesKey);

    if (quoteCount >= this.maxQuotesPerSession) {
      throw new BadRequestException(
        `Maximum ${this.maxQuotesPerSession} quotes allowed per session`,
      );
    }

    // Check rate limit (5 quotes per hour)
    const rateLimitKey = `guest:ratelimit:${sessionId}`;
    const recentQuotes = await this.redis.incr(rateLimitKey);

    if (recentQuotes === 1) {
      await this.redis.expire(rateLimitKey, 3600); // 1 hour
    }

    if (recentQuotes > 5) {
      throw new BadRequestException('Rate limit exceeded. Please try again later.');
    }
  }

  private async storeQuote(sessionId: string, quote: GuestQuote): Promise<void> {
    const key = `guest:quote:${sessionId}:${quote.id}`;
    await this.redis.setex(key, this.quoteTTL, JSON.stringify(quote));
  }

  private async trackQuoteInSession(sessionId: string, quoteId: string): Promise<void> {
    const quotesKey = `guest:quotes:${sessionId}`;
    await this.redis.sadd(quotesKey, quoteId);
    await this.redis.expire(quotesKey, this.quoteTTL);
  }

  private parseQuote(data: Record<string, unknown>): GuestQuote {
    return {
      ...data,
      createdAt: new Date(data.createdAt as string),
      updatedAt: new Date(data.updatedAt as string),
      expiresAt: new Date(data.expiresAt as string),
    } as GuestQuote;
  }

  // Conversion methods
  async convertToAuthenticatedQuote(
    sessionId: string,
    quoteId: string,
    userId: string,
    tenantId: string,
  ): Promise<string> {
    const guestQuote = await this.getQuote(sessionId, quoteId);

    // Create authenticated quote
    const quote = await this.quotesService.create(tenantId, userId, {
      currency: guestQuote.currency as Currency,
      objective: { cost: 0.5, lead: 0.3, green: 0.2 },
    });

    // Add items to the quote
    for (const item of guestQuote.items) {
      await this.quotesService.addItem(tenantId, quote.id, {
        fileId: '', // Guest quotes don't have file IDs in the main system
        name: item.filename,
        process: item.process as ProcessType,
        quantity: item.quantity,
        options: {
          material: item.material,
          finish: item.finish || '',
          ...(item.specifications || {}),
        },
      });
    }

    // Update quote metadata to track origin
    await this.quotesService.update(tenantId, quote.id, {
      metadata: {
        origin: 'guest_conversion',
        guestSessionId: sessionId,
        guestQuoteId: guestQuote.id,
      },
    });

    // Mark guest quote as converted
    const key = `guest:quote:${sessionId}:${quoteId}`;
    const data = await this.redis.get(key);
    if (data) {
      const parsed = JSON.parse(data as string);
      parsed.convertedAt = new Date();
      parsed.convertedQuoteId = quote.id;
      await this.redis.setex(key, this.quoteTTL, JSON.stringify(parsed));
    }

    return quote.id;
  }
}
