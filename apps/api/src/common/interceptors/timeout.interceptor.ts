import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout: number;
  private readonly fileUploadTimeout: number;
  private readonly geometryAnalysisTimeout: number;
  private readonly adminOperationTimeout: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultTimeout = this.configService.get<number>('DEFAULT_TIMEOUT_MS', 30000);
    this.fileUploadTimeout = this.configService.get<number>('FILE_UPLOAD_TIMEOUT_MS', 300000);
    this.geometryAnalysisTimeout = this.configService.get<number>(
      'GEOMETRY_ANALYSIS_TIMEOUT_MS',
      120000,
    );
    this.adminOperationTimeout = this.configService.get<number>(
      'ADMIN_OPERATION_TIMEOUT_MS',
      60000,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const timeoutDuration = this.getTimeout(request);

    return next.handle().pipe(
      timeout(timeoutDuration),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException('Request timeout'));
        }
        return throwError(() => err);
      }),
    );
  }

  private getTimeout(request: Request): number {
    // File upload endpoints get longer timeout
    if (request.url?.includes('/upload')) {
      return this.fileUploadTimeout;
    }

    // Geometry analysis endpoints get longer timeout
    if (request.url?.includes('/analyze') || request.url?.includes('/worker')) {
      return this.geometryAnalysisTimeout;
    }

    // Admin operations get longer timeout
    if (request.url?.includes('/admin')) {
      return this.adminOperationTimeout;
    }

    return this.defaultTimeout;
  }
}
