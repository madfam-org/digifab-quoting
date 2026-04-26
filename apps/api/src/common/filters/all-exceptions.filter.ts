import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContextService, TenantContext } from '../../modules/tenant/tenant-context.service';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Try to get context, but don't fail if it's not available
    let context: TenantContext | null;
    try {
      context = this.tenantContext.getContext() ?? null;
    } catch (error) {
      // No context available, that's ok for some endpoints
      context = null;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string | string[]) || exception.message;
        error = responseObj.error as string | undefined;
        details = responseObj.details as Record<string, unknown> | undefined;
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;

      // Log stack trace for non-HTTP exceptions
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack, {
        tenantId: context?.tenantId,
        userId: context?.userId,
        requestId: context?.requestId,
        path: request.url,
        method: request.method,
      });
    } else {
      // Unknown error type
      this.logger.error('Unknown exception type', exception, {
        tenantId: context?.tenantId,
        userId: context?.userId,
        requestId: context?.requestId,
        path: request.url,
        method: request.method,
      });
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      requestId: context?.requestId,
    };

    if (error) {
      errorResponse.error = error;
    }

    // Only expose sanitized details for debugging in development
    if (details && process.env.NODE_ENV === 'development') {
      // Sanitize sensitive information from details
      errorResponse.details = this.sanitizeErrorDetails(details);
    }

    // Log all errors
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`,
        {
          exception: exception instanceof Error ? exception.stack : exception,
          tenantId: context?.tenantId,
          userId: context?.userId,
          requestId: context?.requestId,
          body: request.body,
          query: request.query,
          params: request.params,
        },
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`,
        {
          tenantId: context?.tenantId,
          userId: context?.userId,
          requestId: context?.requestId,
        },
      );
    }

    response.status(status).json(errorResponse);
  }

  private sanitizeErrorDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...details };

    // Remove sensitive keys
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        delete sanitized[key];
      }
    }

    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeErrorDetails(value as Record<string, unknown>);
      }
    }

    return sanitized;
  }
}
