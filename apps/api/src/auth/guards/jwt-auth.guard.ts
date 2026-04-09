import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JWTPayload } from '@cotiza/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenBlacklistService } from '../services/token-blacklist.service';

// Extended request interface for JWT authentication
interface JwtAuthRequest extends Request {
  user?: JWTPayload;
  shouldRefreshToken?: boolean;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('janua-jwt') {
  constructor(
    private reflector: Reflector,
    private tokenBlacklist: TokenBlacklistService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Validate JWT
    const canActivate = await super.canActivate(context);
    if (!canActivate) {
      return false;
    }

    // Additional security checks
    const request = context.switchToHttp().getRequest<JwtAuthRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    // Check if token is blacklisted
    const isBlacklisted = await this.tokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Validate token expiration
    const user = request.user;
    if (!user || !user.exp) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const now = Math.floor(Date.now() / 1000);
    if (user.exp < now) {
      throw new UnauthorizedException('Token has expired');
    }

    // Check for token refresh window (last 5 minutes before expiry)
    const refreshWindow = 5 * 60; // 5 minutes
    if (user.exp - now < refreshWindow) {
      request.shouldRefreshToken = true;
    }

    return true;
  }

  handleRequest<TUser = JWTPayload>(
    err: Error | null,
    user: TUser | false,
    info: Error | undefined,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException(info?.message || 'Authentication failed');
    }
    return user as TUser;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
