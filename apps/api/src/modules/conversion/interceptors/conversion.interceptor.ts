import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  ConversionTrackingService,
  ConversionAction,
} from '../services/conversion-tracking.service';
import { TenantContextService } from '@/modules/tenant/tenant-context.service';

@Injectable()
export class ConversionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ConversionInterceptor.name);

  constructor(
    private readonly conversionTracking: ConversionTrackingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    const controller = context.getClass();

    const endpoint = `${controller.name}.${handler.name}`;
    const method = request.method;
    const path = request.route?.path || request.url;

    return next.handle().pipe(
      tap((response) => {
        // Only track conversion events for authenticated users
        if (!this.tenantContext.getContext()?.userId) {
          return;
        }

        this.trackConversionEvents(endpoint, method, path, request, response);
      }),
    );
  }

  private async trackConversionEvents(
    endpoint: string,
    method: string,
    path: string,
    request: any,
    response: any,
  ): Promise<void> {
    try {
      const action = this.mapEndpointToAction(endpoint, method, response);
      if (!action) return;

      const context = {
        endpoint,
        method,
        path,
        responseStatus: response?.status || 200,
        metadata: this.extractMetadata(request, response),
      };

      await this.conversionTracking.trackAction(action, context);
    } catch (error) {
      // Don't fail the request if conversion tracking fails
      this.logger.error('Conversion tracking failed:', error);
    }
  }

  private mapEndpointToAction(
    endpoint: string,
    method: string,
    response: any,
  ): ConversionAction | null {
    const mappings: Record<string, ConversionAction> = {
      // Auth endpoints
      'AuthController.register': ConversionAction.CREATED_ACCOUNT,
      'AuthController.verifyEmail': ConversionAction.VERIFIED_EMAIL,
      'AuthController.login': ConversionAction.LOGGED_IN_AGAIN,

      // Quote endpoints
      'QuotesController.create': ConversionAction.CREATED_FIRST_QUOTE,
      'QuotesController.generatePdf': ConversionAction.DOWNLOADED_PDF,
      'QuotesController.share': ConversionAction.SHARED_QUOTE,

      // File endpoints
      'FilesController.upload': ConversionAction.UPLOADED_FIRST_FILE,
      'FilesController.analyze': ConversionAction.USED_ADVANCED_FEATURE,

      // Billing endpoints
      'BillingController.upgradeTier': ConversionAction.UPGRADED_PLAN,
      'BillingController.createPaymentSession': ConversionAction.STARTED_CHECKOUT,

      // Admin/Advanced endpoints
      'AdminController.export': ConversionAction.USED_ADVANCED_FEATURE,
      'PricingController.optimize': ConversionAction.USED_ADVANCED_FEATURE,
    };

    return mappings[endpoint] || null;
  }

  private extractMetadata(request: any, response: any): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Extract relevant data from request/response
    if (request.body?.fileId) metadata.fileId = request.body.fileId;
    if (request.body?.quoteId) metadata.quoteId = request.body.quoteId;
    if (response?.data?.id) metadata.responseId = response.data.id;

    return metadata;
  }
}
