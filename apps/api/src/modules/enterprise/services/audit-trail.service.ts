import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { Request } from 'express';

export interface AuditLogEntry {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditContext {
  request?: Request;
  additionalMetadata?: Record<string, unknown>;
}

export enum AuditAction {
  // User Management
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_ACTIVATED = 'user_activated',
  USER_DEACTIVATED = 'user_deactivated',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET = 'password_reset',

  // Quote Management
  QUOTE_CREATED = 'quote_created',
  QUOTE_UPDATED = 'quote_updated',
  QUOTE_DELETED = 'quote_deleted',
  QUOTE_ACCEPTED = 'quote_accepted',
  QUOTE_REJECTED = 'quote_rejected',
  QUOTE_EXPIRED = 'quote_expired',

  // File Management
  FILE_UPLOADED = 'file_uploaded',
  FILE_DOWNLOADED = 'file_downloaded',
  FILE_DELETED = 'file_deleted',

  // Configuration Changes
  TENANT_SETTINGS_UPDATED = 'tenant_settings_updated',
  PRICING_UPDATED = 'pricing_updated',
  FEATURE_TOGGLED = 'feature_toggled',

  // Billing & Payments
  PAYMENT_PROCESSED = 'payment_processed',
  PAYMENT_FAILED = 'payment_failed',
  INVOICE_GENERATED = 'invoice_generated',
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',

  // Enterprise Features
  SSO_CONFIGURED = 'sso_configured',
  SSO_LOGIN_ATTEMPT = 'sso_login_attempt',
  WHITE_LABEL_UPDATED = 'white_label_updated',
  COMPLIANCE_EXPORT = 'compliance_export',
  SUPPORT_TICKET_CREATED = 'support_ticket_created',
  SUPPORT_TICKET_UPDATED = 'support_ticket_updated',

  // Security Events
  LOGIN_FAILED = 'login_failed',
  ACCESS_DENIED = 'access_denied',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_BREACH_DETECTED = 'data_breach_detected',

  // System Events
  SYSTEM_MAINTENANCE = 'system_maintenance',
  BACKUP_CREATED = 'backup_created',
  DATA_MIGRATION = 'data_migration',
}

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async log(
    tenantId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes: Record<string, any>,
    context?: AuditContext,
  ): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        tenantId,
        userId,
        action,
        entityType,
        entityId,
        changes: this.sanitizeChanges(changes),
        ipAddress: context?.request?.ip,
        userAgent: context?.request?.get('user-agent'),
        metadata: context?.additionalMetadata || {},
      };

      // Store in database
      await this.prisma.auditLog.create({
        data: {
          tenantId: auditEntry.tenantId,
          userId: auditEntry.userId,
          action: auditEntry.action,
          entityType: auditEntry.entityType,
          entityId: auditEntry.entityId,
          changes: auditEntry.changes,
          ipAddress: auditEntry.ipAddress || '',
          userAgent: auditEntry.userAgent || '',
          metadata: auditEntry.metadata,
        },
      });

      // Cache recent activity for real-time dashboards
      await this.cacheRecentActivity(tenantId, auditEntry);

      // Track security-sensitive events
      if (this.isSecurityEvent(action)) {
        await this.trackSecurityEvent(tenantId, auditEntry);
      }

      this.logger.debug(`Audit log created: ${action} by ${userId} on ${entityType}:${entityId}`);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      // Don't throw - audit logging failures shouldn't break business logic
    }
  }

  async logUserActivity(
    tenantId: string,
    userId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    changes: Record<string, any> = {},
    request?: Request,
  ): Promise<void> {
    await this.log(tenantId, userId, action, entityType, entityId, changes, { request });
  }

  async logSystemEvent(
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    changes: Record<string, any> = {},
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.log(tenantId, 'system', action, entityType, entityId, changes, {
      additionalMetadata: { ...metadata, source: 'system' },
    });
  }

  async logSecurityEvent(
    tenantId: string,
    userId: string,
    action: AuditAction,
    details: Record<string, any>,
    request?: Request,
  ): Promise<void> {
    await this.log(tenantId, userId, action, 'security', 'event', details, {
      request,
      additionalMetadata: { severity: this.getSecuritySeverity(action) },
    });

    // Immediate alerting for critical security events
    if (this.isCriticalSecurityEvent(action)) {
      await this.triggerSecurityAlert(tenantId, userId, action, details);
    }
  }

  async getRecentActivity(tenantId: string, limit: number = 50): Promise<any[]> {
    const cacheKey = `audit_trail:recent:${tenantId}`;
    const cached = await this.redis.lrange(cacheKey, 0, limit - 1);

    if (cached.length > 0) {
      return cached.map((item) => JSON.parse(item));
    }

    // Fallback to database
    const recent = await this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    return recent;
  }

  async getActivityByUser(tenantId: string, userId: string, limit: number = 100): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getActivityByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit: number = 100,
  ): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });
  }

  async getSecurityEvents(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
    severity?: string,
  ): Promise<any[]> {
    const where: any = {
      tenantId,
      action: { in: Object.values(AuditAction).filter((action) => this.isSecurityEvent(action)) },
    };

    if (startDate) {
      where.createdAt = { gte: startDate };
    }

    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: endDate };
    }

    if (severity) {
      where.metadata = {
        path: ['severity'],
        equals: severity,
      };
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });
  }

  async getComplianceReport(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    userActivity: Record<string, number>;
    securityEvents: number;
    dataChanges: number;
  }> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const eventsByType = logs.reduce(
      (acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const userActivity = logs.reduce(
      (acc, log) => {
        acc[log.userId] = (acc[log.userId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const securityEvents = logs.filter((log) => this.isSecurityEvent(log.action)).length;
    const dataChanges = logs.filter(
      (log) => Object.keys((log.changes as any) || {}).length > 0,
    ).length;

    return {
      totalEvents: logs.length,
      eventsByType,
      userActivity,
      securityEvents,
      dataChanges,
    };
  }

  private sanitizeChanges(changes: Record<string, any>): Record<string, any> {
    const sanitized = { ...changes };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeChanges(value);
      }
    }

    return sanitized;
  }

  private async cacheRecentActivity(tenantId: string, auditEntry: AuditLogEntry): Promise<void> {
    const cacheKey = `audit_trail:recent:${tenantId}`;
    const serialized = JSON.stringify({
      ...auditEntry,
      timestamp: new Date().toISOString(),
    });

    // Add to front of list and trim to last 100 entries
    await this.redis.lpush(cacheKey, serialized);
    await this.redis.ltrim(cacheKey, 0, 99);
    await this.redis.expire(cacheKey, 3600); // 1 hour
  }

  private isSecurityEvent(action: string): boolean {
    const securityActions = [
      AuditAction.LOGIN_FAILED,
      AuditAction.ACCESS_DENIED,
      AuditAction.SUSPICIOUS_ACTIVITY,
      AuditAction.DATA_BREACH_DETECTED,
      AuditAction.PASSWORD_CHANGED,
      AuditAction.PASSWORD_RESET,
      AuditAction.USER_ACTIVATED,
      AuditAction.USER_DEACTIVATED,
      AuditAction.SSO_LOGIN_ATTEMPT,
    ];

    return securityActions.includes(action as AuditAction);
  }

  private isCriticalSecurityEvent(action: AuditAction): boolean {
    const criticalActions = [AuditAction.DATA_BREACH_DETECTED, AuditAction.SUSPICIOUS_ACTIVITY];

    return criticalActions.includes(action);
  }

  private getSecuritySeverity(action: AuditAction): string {
    const severityMap: Record<AuditAction, string> = {
      [AuditAction.DATA_BREACH_DETECTED]: 'critical',
      [AuditAction.SUSPICIOUS_ACTIVITY]: 'high',
      [AuditAction.LOGIN_FAILED]: 'medium',
      [AuditAction.ACCESS_DENIED]: 'medium',
      [AuditAction.PASSWORD_CHANGED]: 'low',
      [AuditAction.PASSWORD_RESET]: 'low',
      [AuditAction.USER_ACTIVATED]: 'low',
      [AuditAction.USER_DEACTIVATED]: 'medium',
      [AuditAction.SSO_LOGIN_ATTEMPT]: 'low',
    } as any;

    return severityMap[action] || 'low';
  }

  private async trackSecurityEvent(tenantId: string, auditEntry: AuditLogEntry): Promise<void> {
    const key = `security_events:${tenantId}`;
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    await this.redis.hincrby(`${key}:${date}`, auditEntry.action, 1);
    await this.redis.expire(`${key}:${date}`, 86400 * 90); // 90 days retention

    // Track by user for anomaly detection
    const userKey = `security_events:${tenantId}:${auditEntry.userId}`;
    await this.redis.hincrby(`${userKey}:${date}`, auditEntry.action, 1);
    await this.redis.expire(`${userKey}:${date}`, 86400 * 30); // 30 days retention
  }

  private async triggerSecurityAlert(
    tenantId: string,
    userId: string,
    action: AuditAction,
    details: Record<string, any>,
  ): Promise<void> {
    // Mock implementation - would integrate with alerting system (PagerDuty, Slack, etc.)
    this.logger.warn(
      `SECURITY ALERT - Tenant: ${tenantId}, User: ${userId}, Action: ${action}`,
      details,
    );

    // Store alert for security dashboard
    const alertKey = `security_alerts:${tenantId}`;
    const alert = {
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
      severity: this.getSecuritySeverity(action),
    };

    await this.redis.lpush(alertKey, JSON.stringify(alert));
    await this.redis.ltrim(alertKey, 0, 999); // Keep last 1000 alerts
    await this.redis.expire(alertKey, 86400 * 30); // 30 days retention
  }
}
