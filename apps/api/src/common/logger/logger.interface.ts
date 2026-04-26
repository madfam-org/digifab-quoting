/**
 * Logger service interfaces with proper TypeScript types
 */

export interface LogMetadata {
  context?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  timestamp?: string;
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | LogMetadata
    | LogMetadata[]
    | Record<string, unknown>
    | Error
    | unknown;
}

export interface HttpLogMetadata extends LogMetadata {
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
}

export interface AuditLogMetadata extends LogMetadata {
  audit: true;
  action: string;
  entity: string;
  entityId: string;
  changes?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export interface SecurityLogMetadata extends LogMetadata {
  security: true;
  event: string;
  ip?: string;
  userAgent?: string;
  attemptedAction?: string;
  blocked?: boolean;
}

export interface PerformanceLogMetadata extends LogMetadata {
  performance: true;
  operation: string;
  duration: number;
  slowQuery?: boolean;
  queryCount?: number;
}

export interface ErrorLogMetadata extends LogMetadata {
  error: true;
  errorCode?: string;
  errorType?: string;
  stack?: string;
  originalError?: Error | unknown;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export interface LogEntry {
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  timestamp: Date;
}
