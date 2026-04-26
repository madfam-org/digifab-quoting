import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

export interface GuestSessionRequest extends Request {
  guestSession?: {
    id: string;
    token: string;
    quoteCount: number;
    createdAt: Date;
    expiresAt: Date;
  };
}

@Injectable()
export class GuestSessionMiddleware implements NestMiddleware {
  private readonly sessionTTL: number;
  private readonly cookieName = 'guest_session';

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.sessionTTL = this.config.get('GUEST_SESSION_TTL', 86400); // 24 hours default
  }

  async use(req: GuestSessionRequest, res: Response, next: NextFunction) {
    let sessionToken = this.extractSessionToken(req);
    let session = null;

    if (sessionToken) {
      // Try to load existing session
      session = await this.loadSession(sessionToken);
    }

    if (!session) {
      // Create new session
      sessionToken = uuidv4();
      session = await this.createSession(sessionToken, req);

      // Set session cookie
      this.setSessionCookie(res, sessionToken);
    }

    // Attach session to request
    req.guestSession = session;

    next();
  }

  private extractSessionToken(req: Request): string | null {
    // Check header first
    const headerToken = req.headers['x-session-id'] as string;
    if (headerToken) return headerToken;

    // Check cookie
    return req.cookies?.[this.cookieName] || null;
  }

  private async loadSession(token: string) {
    const key = `guest:session:${token}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      const session = JSON.parse(data as string);

      // Check if expired
      if (new Date(session.expiresAt) < new Date()) {
        await this.redis.del(key);
        return null;
      }

      return {
        ...session,
        createdAt: new Date(session.createdAt),
        expiresAt: new Date(session.expiresAt),
      };
    } catch (error) {
      return null;
    }
  }

  private async createSession(token: string, req: Request) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTTL * 1000);

    const session = {
      id: uuidv4(),
      token,
      quoteCount: 0,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'],
      createdAt: now,
      expiresAt,
    };

    const key = `guest:session:${token}`;
    await this.redis.setex(key, this.sessionTTL, JSON.stringify(session));

    return session;
  }

  private setSessionCookie(res: Response, token: string) {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: this.sessionTTL * 1000,
      path: '/',
    });
  }

  async incrementQuoteCount(sessionToken: string): Promise<void> {
    const key = `guest:session:${sessionToken}`;
    const session = await this.loadSession(sessionToken);

    if (session) {
      session.quoteCount += 1;
      await this.redis.setex(key, this.sessionTTL, JSON.stringify(session));
    }
  }

  async getSessionMetrics(sessionToken: string) {
    const session = await this.loadSession(sessionToken);
    if (!session) return null;

    const quotesKey = `guest:quotes:${sessionToken}`;
    const quotes = await this.redis.smembers(quotesKey);

    return {
      sessionId: session.id,
      quoteCount: session.quoteCount,
      quotesCreated: quotes.length,
      sessionAge: Date.now() - new Date(session.createdAt).getTime(),
      expiresIn: new Date(session.expiresAt).getTime() - Date.now(),
    };
  }
}
