import {
  Controller,
  Get,
  Query,
  Param,
  ForbiddenException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { AuditService, AuditEntity, AuditAction } from './audit.service';
import { InternalOnly, AdminOnly } from '../auth/decorators/role-shortcuts.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { Audit } from './audit.interceptor';
import { RequirePermissions, Permission } from '../auth/guards/permissions.guard';
import { ForbiddenResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('audit')
@Controller('audit')
@InternalOnly()
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-ID',
  description: 'Tenant identifier for multi-tenant operations',
  required: false,
})
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get audit logs',
    description:
      'Retrieve audit logs with filtering options. Non-admin users can only view their own logs.',
  })
  @ApiQuery({
    name: 'entity',
    required: false,
    enum: AuditEntity,
    description: 'Filter by entity type',
  })
  @ApiQuery({
    name: 'entityId',
    required: false,
    description: 'Filter by specific entity ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'actorId',
    required: false,
    description: 'Filter by actor/user ID',
    example: 'user_123',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: AuditAction,
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: Date,
    description: 'Start date for date range filter',
    example: '2024-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: Date,
    description: 'End date for date range filter',
    example: '2024-12-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of records to return (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip for pagination (default: 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
    schema: {
      properties: {
        logs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'audit_123' },
              tenantId: { type: 'string', example: 'tenant_456' },
              actorId: { type: 'string', example: 'user_789' },
              actorEmail: { type: 'string', example: 'user@example.com' },
              entity: { type: 'string', example: 'quote' },
              entityId: { type: 'string', example: 'quote_123' },
              action: { type: 'string', example: 'create' },
              at: { type: 'string', format: 'date-time' },
              metadata: { type: 'object' },
              changes: { type: 'object' },
              requestId: { type: 'string', example: 'req_abc123' },
              duration: { type: 'number', example: 125 },
            },
          },
        },
        total: { type: 'number', example: 100 },
        limit: { type: 'number', example: 50 },
        offset: { type: 'number', example: 0 },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions',
    type: ForbiddenResponseDto,
  })
  @RequirePermissions(Permission.AUDIT_READ)
  @Audit({
    entity: AuditEntity.CONFIG,
    action: AuditAction.READ,
    includeBody: false,
  })
  async findLogs(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    // Non-admin users can only see their own audit logs
    const context = this.tenantContext.getContext();
    if (
      !context?.userRoles?.includes('admin') &&
      actorId &&
      context &&
      actorId !== context.userId
    ) {
      throw new ForbiddenException('You can only view your own audit logs');
    }

    return this.auditService.findLogs({
      entity,
      entityId,
      actorId: actorId || (!context?.userRoles?.includes('admin') ? context?.userId : undefined),
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
      offset,
    });
  }

  @Get('entity/:entity/:entityId')
  @ApiOperation({
    summary: 'Get audit trail for a specific entity',
    description: 'Retrieve complete audit history for a specific entity instance',
  })
  @ApiParam({
    name: 'entity',
    description: 'Entity type',
    enum: AuditEntity,
  })
  @ApiParam({
    name: 'entityId',
    description: 'Entity ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Entity audit trail retrieved',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action: { type: 'string' },
          actorId: { type: 'string' },
          actorEmail: { type: 'string' },
          at: { type: 'string', format: 'date-time' },
          changes: { type: 'object' },
          metadata: { type: 'object' },
        },
      },
    },
  })
  @RequirePermissions(Permission.AUDIT_READ)
  async getEntityAuditTrail(@Param('entity') entity: string, @Param('entityId') entityId: string) {
    return this.auditService.getEntityAuditTrail(entity, entityId);
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get audit logs for a specific user',
    description:
      'Retrieve all actions performed by a specific user. Non-admin users can only view their own logs.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: 'user_123',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: Date,
    description: 'Start date for filtering',
    example: '2024-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: Date,
    description: 'End date for filtering',
    example: '2024-12-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of records (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'User audit logs retrieved',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          entity: { type: 'string' },
          entityId: { type: 'string' },
          action: { type: 'string' },
          at: { type: 'string', format: 'date-time' },
          metadata: { type: 'object' },
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Cannot view other users audit logs',
    type: ForbiddenResponseDto,
  })
  @RequirePermissions(Permission.AUDIT_READ)
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    // Non-admin users can only see their own audit logs
    const context = this.tenantContext.getContext();
    if (!context?.userRoles?.includes('admin') && context && userId !== context.userId) {
      throw new ForbiddenException('You can only view your own audit logs');
    }

    return this.auditService.getUserAuditLogs(userId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
    });
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export audit logs',
    description: 'Export audit logs for compliance and reporting purposes. Admin only.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: Date,
    description: 'Export start date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: Date,
    description: 'Export end date',
    example: '2024-12-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'entity',
    required: false,
    enum: AuditEntity,
    description: 'Filter export by entity type',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['json', 'csv'],
    description: 'Export format (default: json)',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs exported',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      'text/csv': {
        schema: {
          type: 'string',
          example:
            'Timestamp,Tenant ID,Actor ID,Actor Email,Entity,Entity ID,Action,Success,Duration (ms),Request ID\n2024-01-01T00:00:00.000Z,tenant_123,user_456,user@example.com,quote,quote_789,create,true,125,req_abc',
        },
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Admin access required',
    type: ForbiddenResponseDto,
  })
  @AdminOnly()
  @RequirePermissions(Permission.AUDIT_EXPORT)
  async exportAuditLogs(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('entity') entity?: string,
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    const logs = await this.auditService.exportAuditLogs({
      from: new Date(from),
      to: new Date(to),
      entity,
      format,
    });

    if (format === 'csv') {
      // Convert to CSV format - map logs to expected format
      const mappedLogs = logs.map((log) => ({
        at: log.at,
        tenantId: log.tenantId,
        actorId: log.actorId || undefined,
        actor: log.actor ? { email: log.actor.email } : undefined,
        entity: log.entity,
        entityId: log.entityId,
        action: log.action,
        metadata:
          (log.metadata as { success?: boolean; duration?: number; requestId?: string }) ||
          undefined,
      }));
      return this.convertToCSV(mappedLogs);
    }

    return logs;
  }

  private convertToCSV(
    logs: Array<{
      at: Date;
      tenantId: string;
      actorId?: string;
      actor?: { email?: string };
      entity: string;
      entityId: string;
      action: string;
      metadata?: {
        success?: boolean;
        duration?: number;
        requestId?: string;
      };
    }>,
  ): string {
    if (logs.length === 0) return '';

    // Define CSV headers
    const headers = [
      'Timestamp',
      'Tenant ID',
      'Actor ID',
      'Actor Email',
      'Entity',
      'Entity ID',
      'Action',
      'Success',
      'Duration (ms)',
      'Request ID',
    ];

    // Convert logs to CSV rows
    const rows = logs.map((log) => [
      log.at.toISOString(),
      log.tenantId,
      log.actorId || '',
      log.actor?.email || '',
      log.entity,
      log.entityId,
      log.action,
      log.metadata?.success ?? true,
      log.metadata?.duration || '',
      log.metadata?.requestId || '',
    ]);

    // Combine headers and rows
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }
}
