import { HttpException, HttpStatus } from '@nestjs/common';

// Type definitions for exception details
export interface ErrorContext {
  [key: string]:
    | string
    | number
    | boolean
    | string[]
    | number[]
    | ErrorContext
    | ErrorContext[]
    | ValidationError[]
    | Record<string, unknown>
    | undefined;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  constraints?: Record<string, string>;
}

export interface FileUploadErrorDetails extends ErrorContext {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  maxSize?: number;
  allowedTypes?: string[];
  error?: string;
}

export interface PaymentErrorDetails extends ErrorContext {
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  transactionId?: string;
  errorCode?: string;
  declineReason?: string;
}

export interface CalculationErrorDetails extends ErrorContext {
  step?: string;
  input?: Record<string, unknown>;
  error?: string;
  stackTrace?: string;
}

// Base business exception
export class BusinessException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: ErrorContext,
  ) {
    super(
      {
        statusCode,
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}

// Quote-related exceptions
export class QuoteNotFoundException extends BusinessException {
  constructor(quoteId: string) {
    super(`Quote with ID ${quoteId} not found`, 'QUOTE_NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export class QuoteAlreadyProcessedException extends BusinessException {
  constructor(quoteId: string, status: string) {
    super(
      `Quote ${quoteId} has already been processed with status: ${status}`,
      'QUOTE_ALREADY_PROCESSED',
      HttpStatus.CONFLICT,
      { quoteId, status },
    );
  }
}

export class QuoteCalculationException extends BusinessException {
  constructor(message: string, details?: CalculationErrorDetails) {
    super(message, 'QUOTE_CALCULATION_ERROR', HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

export class InvalidQuoteStateException extends BusinessException {
  constructor(currentState: string, attemptedAction: string) {
    super(
      `Cannot perform action '${attemptedAction}' on quote in state '${currentState}'`,
      'INVALID_QUOTE_STATE',
      HttpStatus.BAD_REQUEST,
      { currentState, attemptedAction },
    );
  }
}

// File-related exceptions
export class FileUploadException extends BusinessException {
  constructor(message: string, details?: FileUploadErrorDetails) {
    super(message, 'FILE_UPLOAD_ERROR', HttpStatus.BAD_REQUEST, details);
  }
}

export class FileAnalysisException extends BusinessException {
  constructor(fileId: string, message: string) {
    super(
      `File analysis failed for ${fileId}: ${message}`,
      'FILE_ANALYSIS_ERROR',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { fileId },
    );
  }
}

export class UnsupportedFileTypeException extends BusinessException {
  constructor(fileType: string, supportedTypes: string[]) {
    super(
      `File type '${fileType}' is not supported`,
      'UNSUPPORTED_FILE_TYPE',
      HttpStatus.BAD_REQUEST,
      { fileType, supportedTypes },
    );
  }
}

// Payment-related exceptions
export class PaymentRequiredException extends BusinessException {
  constructor(quoteId: string, amount: number) {
    super(
      `Payment required for quote ${quoteId}`,
      'PAYMENT_REQUIRED',
      HttpStatus.PAYMENT_REQUIRED,
      { quoteId, amount },
    );
  }
}

export class PaymentProcessingException extends BusinessException {
  constructor(message: string, details?: PaymentErrorDetails) {
    super(message, 'PAYMENT_PROCESSING_ERROR', HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

// Pricing-related exceptions
export class PricingConfigurationException extends BusinessException {
  constructor(process: string, message: string) {
    super(
      `Pricing configuration error for process ${process}: ${message}`,
      'PRICING_CONFIG_ERROR',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { process },
    );
  }
}

export class MaterialNotFoundException extends BusinessException {
  constructor(process: string, material: string) {
    super(
      `Material '${material}' not found for process '${process}'`,
      'MATERIAL_NOT_FOUND',
      HttpStatus.NOT_FOUND,
      { process, material },
    );
  }
}

export class MinimumOrderException extends BusinessException {
  constructor(currentTotal: number, minimumRequired: number, currency: string) {
    super(
      `Order total ${currentTotal} ${currency} is below minimum ${minimumRequired} ${currency}`,
      'MINIMUM_ORDER_NOT_MET',
      HttpStatus.BAD_REQUEST,
      { currentTotal, minimumRequired, currency },
    );
  }
}

// Rate limiting exceptions
export class RateLimitExceededException extends BusinessException {
  constructor(limit: number, windowSeconds: number, retryAfter: number) {
    super(
      `Rate limit exceeded. Maximum ${limit} requests per ${windowSeconds} seconds`,
      'RATE_LIMIT_EXCEEDED',
      HttpStatus.TOO_MANY_REQUESTS,
      { limit, windowSeconds, retryAfter },
    );
  }
}

// Tenant-related exceptions
export class TenantNotFoundException extends BusinessException {
  constructor(identifier: string) {
    super(`Tenant not found: ${identifier}`, 'TENANT_NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export class TenantSuspendedException extends BusinessException {
  constructor(tenantId: string) {
    super(
      'This account has been suspended. Please contact support.',
      'TENANT_SUSPENDED',
      HttpStatus.FORBIDDEN,
      { tenantId },
    );
  }
}

// Validation exceptions
export class ValidationException extends BusinessException {
  constructor(errors: ValidationError[]) {
    super('Validation failed', 'VALIDATION_ERROR', HttpStatus.BAD_REQUEST, { errors });
  }
}

// Generic business rule exception
export class BusinessRuleViolationException extends BusinessException {
  constructor(rule: string, message: string, details?: ErrorContext) {
    super(message, `BUSINESS_RULE_${rule.toUpperCase()}`, HttpStatus.BAD_REQUEST, details);
  }
}
