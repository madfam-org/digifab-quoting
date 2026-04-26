import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { BusinessMetricsService } from '@/common/monitoring/business-metrics.service';
import { TenantContextService } from '@/modules/tenant/tenant-context.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name);

  constructor(
    private readonly metricsService: BusinessMetricsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    const operationName = `${controller.name}.${handler.name}`;
    const method = request.method;
    const path = request.route?.path || request.url;

    let tenantId: string | undefined;
    try {
      const tenantContext = this.tenantContext.getContext();
      tenantId = tenantContext?.tenantId;
    } catch {
      // Context not available, that's ok
    }

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;

        // Record successful operation metrics
        this.metricsService
          .recordPerformanceMetric(operationName, duration, true, tenantId)
          .catch((error) => {
            this.logger.error('Failed to record success metric:', error);
          });

        // Record HTTP metrics
        this.metricsService
          .incrementCounter('http_requests_total', {
            method,
            status: 'success',
            tenant: tenantId || 'unknown',
          })
          .catch((error) => {
            this.logger.error('Failed to record HTTP metric:', error);
          });

        this.metricsService
          .recordHistogram('http_request_duration_ms', duration, {
            method,
            path,
            tenant: tenantId || 'unknown',
          })
          .catch((error) => {
            this.logger.error('Failed to record HTTP duration:', error);
          });
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Record failed operation metrics
        this.metricsService
          .recordPerformanceMetric(operationName, duration, false, tenantId)
          .catch((metricsError) => {
            this.logger.error('Failed to record error metric:', metricsError);
          });

        // Record error metrics
        this.metricsService
          .recordError(
            controller.name,
            error.name || 'UnknownError',
            this.getErrorSeverity(error),
            tenantId,
          )
          .catch((metricsError) => {
            this.logger.error('Failed to record error:', metricsError);
          });

        // Record HTTP error metrics
        this.metricsService
          .incrementCounter('http_requests_total', {
            method,
            status: 'error',
            tenant: tenantId || 'unknown',
          })
          .catch((metricsError) => {
            this.logger.error('Failed to record HTTP error metric:', metricsError);
          });

        // Re-throw the error
        throw error;
      }),
    );
  }

  private getErrorSeverity(error: any): 'low' | 'medium' | 'high' | 'critical' {
    // Database errors are typically critical
    if (error.name?.includes('Prisma') || error.message?.includes('database')) {
      return 'critical';
    }

    // HTTP 5xx errors are high severity
    if (error.status >= 500) {
      return 'high';
    }

    // HTTP 4xx errors are medium severity
    if (error.status >= 400) {
      return 'medium';
    }

    // Default to medium
    return 'medium';
  }
}
