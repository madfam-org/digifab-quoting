import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { GuestQuoteService } from './guest-quote.service';
import { RedisService } from '../redis/redis.service';
import { RegisterWithQuote, ConvertGuestQuote } from '@cotiza/shared';
import { v4 as uuidv4 } from 'uuid';
import { GuestSession } from '@prisma/client';

@Injectable()
export class ConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly guestQuoteService: GuestQuoteService,
    private readonly redis: RedisService,
  ) {}

  async registerWithQuote(dto: RegisterWithQuote) {
    // Validate guest quote exists
    const guestQuote = await this.guestQuoteService.getQuote(dto.sessionId, dto.sessionQuoteId);

    if (!guestQuote) {
      throw new BadRequestException('Guest quote not found');
    }

    // Check if already converted
    const conversionKey = `guest:conversion:${dto.sessionId}:${dto.sessionQuoteId}`;
    const existingConversion = await this.redis.get(conversionKey);
    if (existingConversion) {
      throw new ConflictException('Quote already converted');
    }

    // Create user account
    const result = await this.authService.register({
      email: dto.email,
      password: dto.password,
      firstName: dto.name.split(' ')[0] || dto.name,
      lastName: dto.name.split(' ').slice(1).join(' ') || '',
      company: dto.company || '',
    });

    const { user } = result;

    // Convert guest quote to authenticated quote
    const convertedQuoteId = await this.guestQuoteService.convertToAuthenticatedQuote(
      dto.sessionId,
      dto.sessionQuoteId,
      user.id,
      user.tenantId || 'default',
    );

    // Track conversion
    await this.trackConversion({
      guestSessionId: dto.sessionId,
      guestQuoteId: dto.sessionQuoteId,
      userId: user.id,
      convertedQuoteId,
      conversionType: 'register_new',
    });

    // Mark session as converted
    await this.markSessionConverted(dto.sessionId, user.id);

    return {
      ...result,
      quote: await this.prisma.quote.findUnique({
        where: { id: convertedQuoteId },
        include: { items: true },
      }),
    };
  }

  async convertGuestQuote(userId: string, dto: ConvertGuestQuote) {
    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Validate guest quote exists
    const guestQuote = await this.guestQuoteService.getQuote(dto.sessionId, dto.sessionQuoteId);

    if (!guestQuote) {
      throw new BadRequestException('Guest quote not found');
    }

    // Check if already converted
    const conversionKey = `guest:conversion:${dto.sessionId}:${dto.sessionQuoteId}`;
    const existingConversion = await this.redis.get(conversionKey);
    if (existingConversion) {
      const data = JSON.parse(existingConversion as string);
      return { quoteId: data.convertedQuoteId, success: true };
    }

    // Convert quote
    const convertedQuoteId = await this.guestQuoteService.convertToAuthenticatedQuote(
      dto.sessionId,
      dto.sessionQuoteId,
      userId,
      user.tenantId || 'default',
    );

    // Track conversion
    await this.trackConversion({
      guestSessionId: dto.sessionId,
      guestQuoteId: dto.sessionQuoteId,
      userId,
      convertedQuoteId,
      conversionType: 'login_existing',
    });

    return {
      quoteId: convertedQuoteId,
      success: true,
    };
  }

  async convertAllSessionQuotes(sessionId: string, userId: string) {
    // Get all guest quotes for session
    const guestQuotes = await this.guestQuoteService.listSessionQuotes(sessionId);

    const results = await Promise.all(
      guestQuotes.map(async (quote) => {
        try {
          const result = await this.convertGuestQuote(userId, {
            sessionId,
            sessionQuoteId: quote.id,
          });
          return { originalQuoteId: quote.id, ...result };
        } catch (error) {
          return { originalQuoteId: quote.id, success: false, error: (error as Error).message };
        }
      }),
    );

    return results;
  }

  private async trackConversion(data: {
    guestSessionId: string;
    guestQuoteId: string;
    userId: string;
    convertedQuoteId: string;
    conversionType: string;
  }) {
    // Store in Redis for immediate access
    const conversionKey = `guest:conversion:${data.guestSessionId}:${data.guestQuoteId}`;
    await this.redis.setex(
      conversionKey,
      86400, // 24 hours
      JSON.stringify({
        convertedQuoteId: data.convertedQuoteId,
        userId: data.userId,
        convertedAt: new Date(),
      }),
    );

    // Store in database for permanent record
    await this.prisma.quoteConversion.create({
      data: {
        id: uuidv4(),
        guestQuoteId: data.guestQuoteId,
        convertedQuoteId: data.convertedQuoteId,
        userId: data.userId,
        sessionId: data.guestSessionId,
        conversionType: data.conversionType,
      },
    });
  }

  private async markSessionConverted(sessionId: string, userId: string) {
    await this.prisma.guestSession.update({
      where: { sessionToken: sessionId },
      data: {
        convertedAt: new Date(),
        convertedUserId: userId,
      },
    });
  }

  async getConversionAnalytics(tenantId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const conversions = await this.prisma.quoteConversion.findMany({
      where: {
        createdAt: { gte: startDate },
        user: { tenantId },
      },
      include: {
        user: true,
        convertedQuote: true,
      },
    });

    const sessions = await this.prisma.guestSession.findMany({
      where: {
        createdAt: { gte: startDate },
      },
    });

    return {
      totalSessions: sessions.length,
      convertedSessions: sessions.filter((s) => s.convertedAt).length,
      conversionRate:
        sessions.length > 0
          ? (sessions.filter((s) => s.convertedAt).length / sessions.length) * 100
          : 0,
      conversionsByType: {
        register_new: conversions.filter((c) => c.conversionType === 'register_new').length,
        login_existing: conversions.filter((c) => c.conversionType === 'login_existing').length,
      },
      averageTimeToConvert: this.calculateAverageTimeToConvert(sessions),
    };
  }

  private calculateAverageTimeToConvert(sessions: GuestSession[]): number {
    const convertedSessions = sessions.filter((s) => s.convertedAt);

    if (convertedSessions.length === 0) return 0;

    const totalTime = convertedSessions.reduce((sum, session) => {
      const timeToConvert =
        new Date(session.convertedAt!).getTime() - new Date(session.createdAt).getTime();
      return sum + timeToConvert;
    }, 0);

    return totalTime / convertedSessions.length / 1000 / 60; // Return in minutes
  }
}
