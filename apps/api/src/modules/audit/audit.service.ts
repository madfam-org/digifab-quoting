import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { LoggerService } from '../../common/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { AuditAction, AuditEntity } from '@cotiza/shared';
import { Prisma } from '@prisma/client';

// Re-export for backward compatibility
export { AuditAction, AuditEntity };

export interface AuditLogEntry {
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly defaultLimit: number;
  private readonly exportMaxLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.defaultLimit = this.configService.get<number>('AUDIT_LOG_DEFAULT_LIMIT', 50);
    this.exportMaxLimit = this.configService.get<number>('AUDIT_LOG_EXPORT_MAX_LIMIT', 10000);
  }

  /**
   * Log an audit entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    const context = this.tenantContext.getContext();

    if (!context?.tenantId) {
      // Skip audit logging if no tenant context
      return;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorId: context.userId,
          entity: entry.entity,
          entityId: entry.entityId,
          action: entry.action,
          before: (entry.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          after: (entry.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          metadata: {
            ...entry.metadata,
            requestId: context.requestId,
            userRoles: context.userRoles,
          },
        },
      });
    } catch (error) {
      // Log error but don't throw - audit logging should not break the application
      this.logger.error('Failed to create audit log', error as Error, 'AuditService');
    }
  }

  /**
   * Log a create action
   */
  async logCreate(
    entity: string,
    entityId: string,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.log({
      entity,
      entityId,
      action: AuditAction.CREATE,
      after: data,
      metadata,
    });
  }

  /**
   * Log an update action
   */
  async logUpdate(
    entity: string,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // Only log if there are actual changes
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }

    await this.log({
      entity,
      entityId,
      action: AuditAction.UPDATE,
      before,
      after,
      metadata,
    });
  }

  /**
   * Log a delete action
   */
  async logDelete(
    entity: string,
    entityId: string,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.log({
      entity,
      entityId,
      action: AuditAction.DELETE,
      before: data,
      metadata,
    });
  }

  /**
   * Log a custom action
   */
  async logAction(
    entity: string,
    entityId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.log({
      entity,
      entityId,
      action,
      metadata,
    });
  }

  /**
   * Query audit logs
   */
  async findLogs(params: {
    entity?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }) {
    const context = this.tenantContext.getContext();

    if (!context?.tenantId) {
      return { logs: [], total: 0 };
    }

    const where: {
      tenantId: string;
      entity?: string;
      entityId?: string;
      actorId?: string;
      action?: string;
      at?: { gte?: Date; lte?: Date };
    } = {
      tenantId: context.tenantId,
    };

    if (params.entity) where.entity = params.entity;
    if (params.entityId) where.entityId = params.entityId;
    if (params.actorId) where.actorId = params.actorId;
    if (params.action) where.action = params.action;

    if (params.from || params.to) {
      where.at = {};
      if (params.from) where.at.gte = params.from;
      if (params.to) where.at.lte = params.to;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        take: params.limit || this.defaultLimit,
        skip: params.offset || 0,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get audit trail for a specific entity
   */
  async getEntityAuditTrail(entity: string, entityId: string) {
    return this.findLogs({ entity, entityId });
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(userId: string, params?: { from?: Date; to?: Date; limit?: number }) {
    return this.findLogs({
      actorId: userId,
      from: params?.from,
      to: params?.to,
      limit: params?.limit,
    });
  }

  /**
   * Export audit logs (for compliance)
   */
  async exportAuditLogs(params: {
    from: Date;
    to: Date;
    entity?: string;
    format?: 'json' | 'csv';
  }) {
    const { logs } = await this.findLogs({
      from: params.from,
      to: params.to,
      entity: params.entity,
      limit: this.exportMaxLimit,
    });

    // Log the export action itself
    await this.logAction(AuditEntity.CONFIG, 'audit_export', AuditAction.EXPORT, {
      exportParams: params,
      recordCount: logs.length,
    });

    return logs;
  }
}
