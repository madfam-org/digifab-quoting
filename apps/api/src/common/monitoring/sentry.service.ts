import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

@Injectable()
export class SentryService {
  private readonly logger = new Logger(SentryService.name);
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.initialize();
  }

  private initialize() {
    const dsn = this.configService.get<string>('SENTRY_DSN');
    if (!dsn) {
      this.logger.warn('Sentry DSN not configured, monitoring disabled');
      return;
    }

    const environment = this.configService.get<string>('NODE_ENV', 'development');
    const release = this.configService.get<string>('APP_VERSION');
    const isProduction = environment === 'production';

    Sentry.init({
      dsn,
      environment,
      release,

      // Performance monitoring
      tracesSampleRate: isProduction ? 0.1 : 1.0,

      // Profiling
      profilesSampleRate: isProduction ? 0.01 : 0.1,

      // Integrations
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration(),
        Sentry.postgresIntegration(),
        Sentry.redisIntegration(),
        nodeProfilingIntegration(),
      ],

      // Initial scope
      initialScope: {
        tags: {
          component: 'backend',
          platform: 'node',
          service: 'api',
        },
      },

      // Error filtering
      beforeSend: (event, _hint) => {
        // Filter out expected errors
        if (event.exception?.values?.[0]?.type === 'ValidationException') {
          return null;
        }

        // Sanitize sensitive data
        if (event.request) {
          this.sanitizeRequestData(
            event.request as {
              headers?: Record<string, string>;
              query_string?: string;
              data?: unknown;
            },
          );
        }

        return event;
      },

      // Breadcrumb filtering
      beforeBreadcrumb: (breadcrumb) => {
        // Filter out sensitive HTTP data
        if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/auth/')) {
          breadcrumb.data.url = '[Sanitized Auth URL]';
        }

        return breadcrumb;
      },
    });

    this.initialized = true;
    this.logger.log('Sentry monitoring initialized');
  }

  private sanitizeRequestData(request: {
    headers?: Record<string, string>;
    query_string?: string;
    data?: unknown;
  }) {
    // Remove sensitive headers
    if (request.headers) {
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
      sensitiveHeaders.forEach((header) => {
        if (request.headers && request.headers[header]) {
          request.headers[header] = '[Sanitized]';
        }
      });
    }

    // Remove sensitive query parameters
    if (request.query_string && typeof request.query_string === 'string') {
      const sensitiveParams = ['token', 'api_key', 'password', 'secret'];
      sensitiveParams.forEach((param) => {
        if (
          request.query_string &&
          typeof request.query_string === 'string' &&
          request.query_string.includes(param)
        ) {
          request.query_string = request.query_string.replace(
            new RegExp(`${param}=[^&]*`, 'gi'),
            `${param}=[Sanitized]`,
          );
        }
      });
    }

    // Remove sensitive body data
    if (request.data && typeof request.data === 'object') {
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey'];
      this.sanitizeObject(request.data, sensitiveFields);
    }
  }

  private sanitizeObject(obj: unknown, sensitiveFields: string[]) {
    if (typeof obj !== 'object' || obj === null) return;

    const objRecord = obj as Record<string, unknown>;
    for (const key in objRecord) {
      if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
        if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
          objRecord[key] = '[Sanitized]';
        } else if (typeof objRecord[key] === 'object' && objRecord[key] !== null) {
          this.sanitizeObject(objRecord[key], sensitiveFields);
        }
      }
    }
  }

  captureException(error: Error, context?: Record<string, unknown>) {
    if (!this.initialized) return;

    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setTag(key, String(value));
        });
      }
      Sentry.captureException(error);
    });
  }

  captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: Record<string, unknown>,
  ) {
    if (!this.initialized) return;

    Sentry.withScope((scope) => {
      scope.setLevel(level);
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setTag(key, String(value));
        });
      }
      Sentry.captureMessage(message);
    });
  }

  addBreadcrumb(
    message: string,
    category?: string,
    level?: Sentry.SeverityLevel,
    data?: Record<string, unknown>,
  ) {
    if (!this.initialized) return;

    Sentry.addBreadcrumb({
      message,
      category: category || 'custom',
      level: level || 'info',
      data,
      timestamp: Date.now() / 1000,
    });
  }

  setUser(user: { id: string; email?: string; username?: string; tenantId?: string }) {
    if (!this.initialized) return;

    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
      tenant_id: user.tenantId,
    });
  }

  setTag(key: string, value: string) {
    if (!this.initialized) return;
    Sentry.setTag(key, value);
  }

  setContext(key: string, context: Record<string, unknown>) {
    if (!this.initialized) return;
    Sentry.setContext(key, context);
  }

  startTransaction(_name: string, _operation?: string) {
    if (!this.initialized) return null;

    // Updated for Sentry v8 - create a simple transaction-like object
    return {
      setStatus: (_status: string) => {},
      finish: () => {},
      setTag: (_key: string, _value: string) => {},
      setData: (_key: string, _value: unknown) => {},
    };
  }

  // Middleware for automatic request monitoring
  getRequestMiddleware() {
    if (!this.initialized) {
      return (_req: unknown, _res: unknown, next: () => void) => next();
    }

    // Updated for Sentry v8 - middleware is handled by integration
    return (_req: unknown, _res: unknown, next: () => void) => next();
  }

  getTracingMiddleware() {
    if (!this.initialized) {
      return (_req: unknown, _res: unknown, next: () => void) => next();
    }

    // Tracing is now handled automatically in Sentry v8
    return (_req: unknown, _res: unknown, next: () => void) => next();
  }

  getErrorHandler() {
    if (!this.initialized) {
      return (error: unknown, _req: unknown, _res: unknown, next: (error: unknown) => void) =>
        next(error);
    }

    return (error: unknown, __req: unknown, __res: unknown, next: (error: unknown) => void) => {
      // Manually capture errors for Sentry v8
      if (typeof error === 'object' && error !== null && 'statusCode' in error) {
        const errorWithStatus = error as { statusCode: number };
        if (errorWithStatus.statusCode >= 500) {
          Sentry.captureException(error);
        }
      }
      next(error);
    };
  }

  // Performance monitoring helpers
  measureAsyncFunction<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    name: string,
    operation: string = 'function',
  ): T {
    return (async (...args: unknown[]) => {
      if (!this.initialized) {
        return fn(...args);
      }

      const transaction = this.startTransaction(name, operation);

      try {
        const result = await fn(...args);
        transaction?.setStatus('ok');
        return result;
      } catch (error) {
        transaction?.setStatus('internal_error');
        this.captureException(error as Error, { function: name });
        throw error;
      } finally {
        transaction?.finish();
      }
    }) as T;
  }

  measureFunction<T extends (...args: unknown[]) => unknown>(
    fn: T,
    name: string,
    operation: string = 'function',
  ): T {
    return ((...args: unknown[]) => {
      if (!this.initialized) {
        return fn(...args);
      }

      const transaction = this.startTransaction(name, operation);

      try {
        const result = fn(...args);
        transaction?.setStatus('ok');
        return result;
      } catch (error) {
        transaction?.setStatus('internal_error');
        this.captureException(error as Error, { function: name });
        throw error;
      } finally {
        transaction?.finish();
      }
    }) as T;
  }

  // Health check
  isHealthy(): boolean {
    return this.initialized;
  }

  // Flush all pending events
  async flush(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) return true;

    try {
      return await Sentry.flush(timeout);
    } catch (error) {
      this.logger.error('Failed to flush Sentry events', error);
      return false;
    }
  }
}
