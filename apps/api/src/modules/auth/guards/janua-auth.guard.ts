import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Janua Authentication Guard
 *
 * Uses Janua JWT tokens for authentication.
 * Respects @Public() decorator for public endpoints.
 */
@Injectable()
export class JanuaAuthGuard extends AuthGuard('janua-jwt') {
  private readonly logger = new Logger(JanuaAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, _context: ExecutionContext) {
    // Handle authentication errors
    if (err) {
      this.logger.error(`Authentication error: ${err.message}`);
      throw err;
    }

    if (!user) {
      const message = info?.message || 'Invalid or expired token';
      this.logger.warn(`Authentication failed: ${message}`);
      throw new UnauthorizedException(message);
    }

    // Log successful authentication (debug level)
    this.logger.debug(`User authenticated: ${user.email}`);

    return user;
  }
}
