import { HttpException, HttpStatus } from '@nestjs/common';

export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Business Logic Exceptions
export class QuoteValidationException extends DomainException {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUOTE_VALIDATION_FAILED', context);
  }
}

export class InsufficientInventoryException extends DomainException {
  constructor(materialId: string, requested: number, available: number) {
    super(`Insufficient inventory for material ${materialId}`, 'INSUFFICIENT_INVENTORY', {
      materialId,
      requested,
      available,
    });
  }
}

export class InvalidPricingConfigurationException extends DomainException {
  constructor(message: string, tenantId: string) {
    super(message, 'INVALID_PRICING_CONFIG', { tenantId });
  }
}

export class QuoteExpiredException extends DomainException {
  constructor(quoteId: string, expiryDate: Date) {
    super(`Quote ${quoteId} expired on ${expiryDate.toISOString()}`, 'QUOTE_EXPIRED', {
      quoteId,
      expiryDate,
    });
  }
}

export class FileProcessingException extends DomainException {
  constructor(message: string, fileId: string, processingStage: string) {
    super(message, 'FILE_PROCESSING_FAILED', { fileId, processingStage });
  }
}

export class ExternalServiceException extends DomainException {
  constructor(service: string, operation: string, originalError?: Error) {
    super(`External service ${service} failed during ${operation}`, 'EXTERNAL_SERVICE_FAILED', {
      service,
      operation,
      originalError: originalError?.message,
    });
  }
}

// Resource Exceptions
export class ResourceNotFoundException extends DomainException {
  constructor(resourceType: string, identifier: string) {
    super(`${resourceType} with identifier ${identifier} not found`, 'RESOURCE_NOT_FOUND', {
      resourceType,
      identifier,
    });
  }
}

export class ResourceConflictException extends DomainException {
  constructor(resourceType: string, conflict: string) {
    super(`${resourceType} conflict: ${conflict}`, 'RESOURCE_CONFLICT', { resourceType, conflict });
  }
}

export class TenantMismatchException extends DomainException {
  constructor(resourceType: string, resourceId: string, expectedTenant: string) {
    super(
      `${resourceType} ${resourceId} does not belong to tenant ${expectedTenant}`,
      'TENANT_MISMATCH',
      { resourceType, resourceId, expectedTenant },
    );
  }
}

// HTTP Exception Mapping
export function mapDomainExceptionToHttp(exception: DomainException): HttpException {
  const { message, code, context } = exception;

  switch (code) {
    case 'RESOURCE_NOT_FOUND':
      return new HttpException({ message, code, context }, HttpStatus.NOT_FOUND);

    case 'QUOTE_VALIDATION_FAILED':
    case 'INVALID_PRICING_CONFIG':
      return new HttpException({ message, code, context }, HttpStatus.BAD_REQUEST);

    case 'RESOURCE_CONFLICT':
    case 'QUOTE_EXPIRED':
      return new HttpException({ message, code, context }, HttpStatus.CONFLICT);

    case 'TENANT_MISMATCH':
      return new HttpException({ message, code, context }, HttpStatus.FORBIDDEN);

    case 'INSUFFICIENT_INVENTORY':
      return new HttpException({ message, code, context }, HttpStatus.UNPROCESSABLE_ENTITY);

    case 'EXTERNAL_SERVICE_FAILED':
    case 'FILE_PROCESSING_FAILED':
      return new HttpException({ message, code, context }, HttpStatus.SERVICE_UNAVAILABLE);

    default:
      return new HttpException({ message, code, context }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

// Error helper functions
export function createValidationError(
  field: string,
  value: unknown,
  constraint: string,
): QuoteValidationException {
  return new QuoteValidationException(`Validation failed for field '${field}': ${constraint}`, {
    field,
    value,
    constraint,
  });
}

export function createResourceNotFoundError(type: string, id: string): ResourceNotFoundException {
  return new ResourceNotFoundException(type, id);
}

export function createTenantMismatchError(
  type: string,
  id: string,
  tenant: string,
): TenantMismatchException {
  return new TenantMismatchException(type, id, tenant);
}

// Error context builders
export class ErrorContextBuilder {
  private context: Record<string, unknown> = {};

  addField(key: string, value: unknown): this {
    this.context[key] = value;
    return this;
  }

  addRequest(req: any): this {
    this.context.request = {
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    };
    return this;
  }

  addUser(userId?: string, tenantId?: string): this {
    if (userId || tenantId) {
      this.context.user = { userId, tenantId };
    }
    return this;
  }

  addTimestamp(): this {
    this.context.timestamp = new Date().toISOString();
    return this;
  }

  build(): Record<string, unknown> {
    return { ...this.context };
  }
}
