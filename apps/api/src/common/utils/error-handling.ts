/**
 * Error handling utilities with proper TypeScript types
 */

/**
 * Common error-like structures we encounter
 */
export interface ErrorLike {
  message: string;
  stack?: string;
  name?: string;
}

export interface HttpError extends ErrorLike {
  statusCode: number;
  code?: string;
}

export interface ValidationError extends ErrorLike {
  field: string;
  value?: string | number | boolean;
  constraints?: Record<string, string>;
}

export interface DatabaseError extends ErrorLike {
  code: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

/**
 * Type guard to check if a value is an Error object
 */
export function isError(
  error: Error | ErrorLike | HttpError | DatabaseError | ValidationError | string,
): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a message property
 */
export function hasMessage(
  error: Error | ErrorLike | HttpError | DatabaseError | ValidationError | string | null,
): error is ErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/**
 * Type guard to check if error has a stack property
 */
export function hasStack(
  error: Error | ErrorLike | HttpError | DatabaseError | ValidationError | string | null,
): error is Error | (ErrorLike & { stack: string }) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'stack' in error &&
    typeof error.stack === 'string'
  );
}

/**
 * Safely extract error message from various error types
 */
export function getErrorMessage(
  error:
    | Error
    | ErrorLike
    | HttpError
    | DatabaseError
    | ValidationError
    | string
    | null
    | undefined,
): string {
  if (!error) {
    return 'An unknown error occurred';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (isError(error) || hasMessage(error)) {
    return error.message;
  }

  return 'An unknown error occurred';
}

/**
 * Safely extract error stack from various error types
 */
export function getErrorStack(
  error:
    | Error
    | ErrorLike
    | HttpError
    | DatabaseError
    | ValidationError
    | string
    | null
    | undefined,
): string | undefined {
  if (!error || typeof error === 'string') {
    return undefined;
  }

  if (hasStack(error)) {
    return error.stack;
  }

  return undefined;
}

/**
 * Convert various error types to Error object
 */
export function toError(
  error:
    | Error
    | ErrorLike
    | HttpError
    | DatabaseError
    | ValidationError
    | string
    | null
    | undefined,
): Error {
  if (!error) {
    return new Error('An unknown error occurred');
  }

  if (isError(error)) {
    return error;
  }

  const message = getErrorMessage(error);
  const err = new Error(message);

  // Preserve original stack if available
  const stack = getErrorStack(error);
  if (stack) {
    err.stack = stack;
  }

  // Preserve error name if available
  if (typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    err.name = error.name;
  }

  return err;
}

/**
 * Metadata that can be attached to errors
 */
export interface ErrorMetadata {
  code?: string;
  statusCode?: number;
  field?: string;
  value?: string | number | boolean;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
  userId?: string;
  tenantId?: string;
  requestId?: string;
  timestamp?: Date;
  context?: string;
}

/**
 * Create a standardized error object with metadata
 */
export interface ErrorWithMetadata extends Error {
  code?: string;
  statusCode?: number;
  metadata?: ErrorMetadata;
}

/**
 * Enhance error with metadata
 */
export function enhanceError(
  error:
    | Error
    | ErrorLike
    | HttpError
    | DatabaseError
    | ValidationError
    | string
    | null
    | undefined,
  metadata?: ErrorMetadata,
): ErrorWithMetadata {
  const err = toError(error) as ErrorWithMetadata;

  if (metadata) {
    const { code, statusCode, ...rest } = metadata;
    err.code = code;
    err.statusCode = statusCode;
    err.metadata = rest;
  }

  return err;
}

/**
 * Format error for logging
 */
export interface FormattedError {
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  metadata?: ErrorMetadata;
  timestamp: Date;
  type: 'Error' | 'HttpError' | 'ValidationError' | 'DatabaseError' | 'Unknown';
}

export function formatErrorForLogging(
  error:
    | Error
    | ErrorLike
    | HttpError
    | DatabaseError
    | ValidationError
    | string
    | null
    | undefined,
): FormattedError {
  const err = toError(error) as ErrorWithMetadata;

  // Determine error type
  let errorType: FormattedError['type'] = 'Unknown';
  if (error && typeof error === 'object') {
    if ('statusCode' in error) errorType = 'HttpError';
    else if ('field' in error && 'constraints' in error) errorType = 'ValidationError';
    else if ('code' in error && ('table' in error || 'constraint' in error))
      errorType = 'DatabaseError';
    else if (error instanceof Error) errorType = 'Error';
  }

  return {
    message: err.message,
    stack: err.stack,
    code: err.code,
    statusCode: err.statusCode,
    metadata: err.metadata,
    timestamp: new Date(),
    type: errorType,
  };
}

/**
 * Type guard for HTTP errors
 */
export function isHttpError(
  error: Error | ErrorLike | HttpError | DatabaseError | ValidationError | string | null,
): error is HttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  );
}

/**
 * Type guard for validation errors
 */
export function isValidationError(
  error: Error | ErrorLike | HttpError | DatabaseError | ValidationError | string | null,
): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'field' in error &&
    typeof error.field === 'string'
  );
}

/**
 * Type guard for database errors
 */
export function isDatabaseError(
  error: Error | ErrorLike | HttpError | DatabaseError | ValidationError | string | null,
): error is DatabaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    ('table' in error || 'constraint' in error || 'detail' in error)
  );
}
