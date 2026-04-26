import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { UsageTrackingService, UsageEventType } from '../services/usage-tracking.service';
import { TenantContextService } from '@/modules/tenant/tenant-context.service';

@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UsageTrackingInterceptor.name);

  constructor(
    private readonly usageTracking: UsageTrackingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    const endpoint = `${controller.name}.${handler.name}`;
    const method = request.method;
    const path = request.route?.path || request.url;

    // Skip tracking for health checks and internal endpoints
    if (this.shouldSkipTracking(path)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - startTime;
        this.trackApiCall(endpoint, method, responseTime);
      }),
      catchError((error) => {
        const responseTime = Date.now() - startTime;
        this.trackApiCall(endpoint, method, responseTime, error);
        throw error;
      }),
    );
  }

  private async trackApiCall(
    endpoint: string,
    method: string,
    responseTime: number,
    error?: any,
  ): Promise<void> {
    try {
      // Skip tracking if no tenant context
      const tenantId = this.tenantContext.getContext()?.tenantId;
      if (!tenantId) return;

      await this.usageTracking.trackApiCall(endpoint, method, responseTime);

      // Track premium endpoints with higher usage costs
      if (this.isPremiumEndpoint(endpoint)) {
        await this.usageTracking.trackUsage({
          eventType: this.getPremiumEventType(endpoint),
          quantity: 1,
          metadata: {
            endpoint,
            method,
            responseTime,
            error: error ? error.message : null,
          },
        });
      }
    } catch (trackingError) {
      // Don't fail the request if usage tracking fails
      this.logger.error('Usage tracking failed:', trackingError);
    }
  }

  private shouldSkipTracking(path: string): boolean {
    const skipPaths = ['/health', '/metrics', '/favicon.ico', '/.well-known', '/api/docs'];

    return skipPaths.some((skipPath) => path.includes(skipPath));
  }

  private isPremiumEndpoint(endpoint: string): boolean {
    const premiumEndpoints = [
      'QuotesController.calculate',
      'FilesController.analyze',
      'ReportsController.generate',
      'AdminController.export',
      'PricingController.optimize',
    ];

    return premiumEndpoints.includes(endpoint);
  }

  private getPremiumEventType(endpoint: string): UsageEventType {
    const eventMapping: Record<string, UsageEventType> = {
      'QuotesController.calculate': UsageEventType.QUOTE_GENERATION,
      'FilesController.analyze': UsageEventType.FILE_ANALYSIS,
      'ReportsController.generate': UsageEventType.DFM_REPORT,
      'AdminController.export': UsageEventType.PDF_GENERATION,
    };

    return eventMapping[endpoint] || UsageEventType.API_CALL;
  }
}
