import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';

export const API_VERSION_KEY = 'api_version';

export interface ApiVersionOptions {
  version: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  sunset?: Date;
}

export const ApiVersion = (options: ApiVersionOptions | string) => {
  const versionOptions: ApiVersionOptions =
    typeof options === 'string' ? { version: options } : options;
  return Reflect.metadata(API_VERSION_KEY, versionOptions);
};

@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Get version from multiple sources
    const requestedVersion = this.extractVersion(request);
    const handlerVersion = this.reflector.get<ApiVersionOptions>(
      API_VERSION_KEY,
      context.getHandler(),
    );

    // Set default version if none specified
    const currentVersion = handlerVersion?.version || 'v1';

    // Validate version compatibility
    if (requestedVersion && !this.isVersionCompatible(requestedVersion, currentVersion)) {
      throw new BadRequestException({
        message: `API version ${requestedVersion} is not supported for this endpoint`,
        supportedVersions: [currentVersion],
        requestedVersion,
      });
    }

    // Add version headers
    response.setHeader('X-API-Version', currentVersion);
    response.setHeader('X-API-Supported-Versions', this.getSupportedVersions());

    // Handle deprecation warnings
    if (handlerVersion?.deprecated) {
      const deprecationMessage =
        handlerVersion.deprecationMessage || `API version ${currentVersion} is deprecated`;

      response.setHeader('Deprecation', 'true');
      response.setHeader('Sunset', handlerVersion.sunset?.toISOString() || '');
      response.setHeader('Warning', `299 - "${deprecationMessage}"`);
    }

    return next.handle().pipe(
      map((data) => {
        // Wrap response with version metadata
        if (data && typeof data === 'object') {
          return {
            ...data,
            _meta: {
              version: currentVersion,
              deprecated: handlerVersion?.deprecated || false,
              timestamp: new Date().toISOString(),
              ...(((data as Record<string, unknown>)?._meta as Record<string, unknown>) || {}),
            },
          };
        }
        return data;
      }),
    );
  }

  private extractVersion(request: Request): string | null {
    // Check header first
    const headerVersion = request.headers['x-api-version'] || request.headers['api-version'];
    if (headerVersion) {
      return this.normalizeVersion(Array.isArray(headerVersion) ? headerVersion[0] : headerVersion);
    }

    // Check Accept header
    const acceptHeader = request.headers['accept'];
    if (acceptHeader) {
      const acceptStr = Array.isArray(acceptHeader) ? acceptHeader[0] : acceptHeader;
      const versionMatch = acceptStr.match(/application\/vnd\.madfam\.v(\d+)\+json/);
      if (versionMatch) {
        return `v${versionMatch[1]}`;
      }
    }

    // Check query parameter
    if (request.query?.version) {
      const queryVersion = request.query.version;
      let versionStr: string;

      if (Array.isArray(queryVersion)) {
        versionStr = String(queryVersion[0]);
      } else if (typeof queryVersion === 'string') {
        versionStr = queryVersion;
      } else {
        versionStr = JSON.stringify(queryVersion);
      }

      return this.normalizeVersion(versionStr);
    }

    return null;
  }

  private normalizeVersion(version: string): string {
    // Ensure version starts with 'v'
    return version.startsWith('v') ? version : `v${version}`;
  }

  private isVersionCompatible(requested: string, current: string): boolean {
    const requestedNum = this.extractVersionNumber(requested);
    const currentNum = this.extractVersionNumber(current);

    // Simple compatibility: exact match or backwards compatible within major version
    return (
      requestedNum === currentNum ||
      (Math.floor(requestedNum) === Math.floor(currentNum) && requestedNum <= currentNum)
    );
  }

  private extractVersionNumber(version: string): number {
    const match = version.match(/v?(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 1;
  }

  private getSupportedVersions(): string {
    return 'v1, v2'; // This could be dynamic based on actual supported versions
  }
}
