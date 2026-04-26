import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class SessionValidationService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly REVOKED_PREFIX = 'revoked:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async validateSession(userId: string, sessionId?: string): Promise<boolean> {
    // Check if token is revoked
    if (sessionId) {
      const isRevoked = await this.redis.get(`${this.REVOKED_PREFIX}${sessionId}`);
      if (isRevoked) {
        throw new UnauthorizedException('Session has been revoked');
      }
    }

    // Check if session exists and is active
    const session = await this.prisma.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        ...(sessionId && { id: sessionId }),
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Cache valid session
    await this.redis.setex(
      `${this.SESSION_PREFIX}${session.id}`,
      300, // 5 minutes cache
      JSON.stringify({ userId, valid: true }),
    );

    return true;
  }

  async revokeSession(sessionId: string): Promise<void> {
    // Mark as revoked in Redis (instant)
    await this.redis.setex(
      `${this.REVOKED_PREFIX}${sessionId}`,
      86400, // 24 hours
      '1',
    );

    // Update database (eventual consistency)
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date() },
    });

    // Remove from valid session cache
    await this.redis.del(`${this.SESSION_PREFIX}${sessionId}`);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      select: { id: true },
    });

    await Promise.all(sessions.map((session) => this.revokeSession(session.id)));
  }
}
