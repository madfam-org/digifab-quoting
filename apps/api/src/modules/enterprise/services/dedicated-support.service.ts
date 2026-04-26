import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { AuditTrailService } from './audit-trail.service';
import { ConfigService } from '@nestjs/config';

export interface SupportTicket {
  id: string;
  tenantId: string;
  userId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: string;
  assignedToId?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  firstResponseAt?: Date;
  escalatedAt?: Date;
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
  CRITICAL = 'critical',
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING_FOR_CUSTOMER = 'waiting_for_customer',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  userId: string;
  content: string;
  isInternal: boolean;
  attachments: string[];
  createdAt: Date;
}

export interface SupportMetrics {
  tenantId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  metrics: {
    totalTickets: number;
    resolvedTickets: number;
    averageResponseTime: number; // in hours
    averageResolutionTime: number; // in hours
    customerSatisfactionScore: number;
    ticketsByPriority: Record<TicketPriority, number>;
    ticketsByCategory: Record<string, number>;
    escalationRate: number;
  };
}

export interface SupportAgent {
  id: string;
  name: string;
  email: string;
  specialties: string[];
  active: boolean;
  capacity: number;
  currentTickets: number;
}

@Injectable()
export class DedicatedSupportService {
  private readonly logger = new Logger(DedicatedSupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditTrail: AuditTrailService,
    private readonly configService: ConfigService,
  ) {}

  async createTicket(
    tenantId: string,
    ticketData: {
      userId?: string;
      subject: string;
      description: string;
      priority: TicketPriority;
      category: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<SupportTicket> {
    // Auto-assign based on category and agent availability
    const assignedAgent = await this.autoAssignTicket(ticketData.category, ticketData.priority);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId,
        userId: ticketData.userId || null,
        subject: ticketData.subject,
        description: ticketData.description,
        priority: ticketData.priority,
        status: TicketStatus.OPEN,
        category: ticketData.category,
        assignedToId: assignedAgent?.id,
        tags: ticketData.tags || [],
        metadata: ticketData.metadata || {},
      },
    });

    // Send notifications
    await this.sendTicketNotifications(ticket.id, 'created');

    // Update metrics
    await this.updateTicketMetrics(tenantId, 'created', ticketData.priority);

    // Log audit trail
    await this.auditTrail.log(
      tenantId,
      ticketData.userId || 'system',
      'support_ticket_created',
      'support_ticket',
      ticket.id,
      {
        subject: ticketData.subject,
        priority: ticketData.priority,
        category: ticketData.category,
      },
    );

    this.logger.log(`Created support ticket ${ticket.id} for tenant ${tenantId}`);

    return this.mapTicketToInterface(ticket);
  }

  async getTickets(
    tenantId: string,
    filters?: {
      status?: string;
      priority?: string;
      category?: string;
      assignedToId?: string;
      userId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<SupportTicket[]> {
    const where: any = { tenantId };

    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.category) where.category = filters.category;
    if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters?.userId) where.userId = filters.userId;

    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    return tickets.map(this.mapTicketToInterface);
  }

  async getTicket(tenantId: string, ticketId: string): Promise<SupportTicket> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    return this.mapTicketToInterface(ticket);
  }

  async updateTicket(
    tenantId: string,
    ticketId: string,
    updates: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assignedToId?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<SupportTicket> {
    const existingTicket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!existingTicket) {
      throw new NotFoundException('Support ticket not found');
    }

    // Track status changes for metrics
    const statusChanged = updates.status && updates.status !== existingTicket.status;
    const priorityChanged = updates.priority && updates.priority !== existingTicket.priority;

    const updateData: any = {};
    if (updates.status) updateData.status = updates.status;
    if (updates.priority) updateData.priority = updates.priority;
    if (updates.assignedToId !== undefined) updateData.assignedToId = updates.assignedToId;
    if (updates.tags) updateData.tags = updates.tags;
    if (updates.metadata) updateData.metadata = updates.metadata;

    // Set resolution timestamp if resolved
    if (
      updates.status === TicketStatus.RESOLVED &&
      existingTicket.status !== TicketStatus.RESOLVED
    ) {
      updateData.resolvedAt = new Date();
    }

    // Set escalation timestamp if escalated
    if (
      updates.status === TicketStatus.ESCALATED &&
      existingTicket.status !== TicketStatus.ESCALATED
    ) {
      updateData.escalatedAt = new Date();
    }

    const ticket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    // Send notifications for status changes
    if (statusChanged) {
      await this.sendTicketNotifications(ticketId, 'status_changed', updates.status);
    }

    // Update metrics
    if (statusChanged) {
      await this.updateTicketMetrics(tenantId, 'status_changed', updates.status!);
    }

    // Log audit trail
    await this.auditTrail.log(
      tenantId,
      'system',
      'support_ticket_updated',
      'support_ticket',
      ticketId,
      updates,
    );

    this.logger.log(`Updated support ticket ${ticketId} for tenant ${tenantId}`);

    return this.mapTicketToInterface(ticket);
  }

  async addTicketMessage(
    tenantId: string,
    ticketId: string,
    messageData: {
      userId: string;
      content: string;
      isInternal?: boolean;
      attachments?: string[];
    },
  ): Promise<void> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        userId: messageData.userId,
        content: messageData.content,
        isInternal: messageData.isInternal || false,
        attachments: messageData.attachments || [],
      },
    });

    // Set first response time if this is the first agent response
    if (!messageData.isInternal && !ticket.firstResponseAt) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }

    // Auto-update status if waiting for customer and they respond
    if (ticket.status === TicketStatus.WAITING_FOR_CUSTOMER && !messageData.isInternal) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    // Send notifications
    await this.sendMessageNotifications(ticketId, message.id);

    // Log audit trail
    await this.auditTrail.log(
      tenantId,
      messageData.userId,
      'support_message_added',
      'support_ticket',
      ticketId,
      {
        messageId: message.id,
        isInternal: messageData.isInternal,
      },
    );

    this.logger.log(`Added message to support ticket ${ticketId}`);
  }

  async getSupportMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<SupportMetrics> {
    const where = {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
    };

    const [totalTickets, resolvedTickets, tickets] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.count({
        where: { ...where, status: TicketStatus.RESOLVED },
      }),
      this.prisma.supportTicket.findMany({
        where,
        select: {
          id: true,
          priority: true,
          category: true,
          status: true,
          createdAt: true,
          firstResponseAt: true,
          resolvedAt: true,
          escalatedAt: true,
        },
      }),
    ]);

    // Calculate response and resolution times
    const responseTimes: number[] = [];
    const resolutionTimes: number[] = [];

    for (const ticket of tickets) {
      if (ticket.firstResponseAt) {
        const responseTime =
          (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60); // hours
        responseTimes.push(responseTime);
      }

      if (ticket.resolvedAt) {
        const resolutionTime =
          (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60); // hours
        resolutionTimes.push(resolutionTime);
      }
    }

    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

    const averageResolutionTime =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
        : 0;

    // Group by priority and category
    const ticketsByPriority = tickets.reduce(
      (acc, ticket) => {
        acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
        return acc;
      },
      {} as Record<TicketPriority, number>,
    );

    const ticketsByCategory = tickets.reduce(
      (acc, ticket) => {
        acc[ticket.category] = (acc[ticket.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Calculate escalation rate
    const escalatedTickets = tickets.filter((t) => t.escalatedAt).length;
    const escalationRate = totalTickets > 0 ? escalatedTickets / totalTickets : 0;

    return {
      tenantId,
      period: { startDate, endDate },
      metrics: {
        totalTickets,
        resolvedTickets,
        averageResponseTime,
        averageResolutionTime,
        customerSatisfactionScore: 0, // Would integrate with feedback system
        ticketsByPriority,
        ticketsByCategory,
        escalationRate,
      },
    };
  }

  async escalateTicket(tenantId: string, ticketId: string, reason: string): Promise<void> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    // Find senior agent for escalation
    const seniorAgent = await this.findSeniorAgent(ticket.category);

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.ESCALATED,
        priority:
          ticket.priority === TicketPriority.URGENT
            ? TicketPriority.CRITICAL
            : TicketPriority.URGENT,
        assignedToId: seniorAgent?.id || ticket.assignedToId,
        escalatedAt: new Date(),
      },
    });

    // Add escalation message
    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        userId: 'system',
        content: `Ticket escalated: ${reason}`,
        isInternal: true,
        attachments: [],
      },
    });

    // Send escalation notifications
    await this.sendEscalationNotifications(ticketId, reason);

    // Log audit trail
    await this.auditTrail.log(
      tenantId,
      'system',
      'support_ticket_escalated',
      'support_ticket',
      ticketId,
      { reason },
    );

    this.logger.log(`Escalated support ticket ${ticketId} for tenant ${tenantId}: ${reason}`);
  }

  private async autoAssignTicket(
    category: string,
    priority: TicketPriority,
  ): Promise<SupportAgent | null> {
    // Simple round-robin assignment logic
    // In production, this would be more sophisticated based on:
    // - Agent specialties
    // - Current workload
    // - Availability/schedule
    // - SLA requirements

    const agents = await this.getAvailableAgents(category);
    if (agents.length === 0) return null;

    // Sort by current ticket count (ascending) to balance load
    agents.sort((a, b) => a.currentTickets - b.currentTickets);

    return agents[0];
  }

  private async getAvailableAgents(category: string): Promise<SupportAgent[]> {
    // Mock implementation - would integrate with HR/staffing system
    return [
      {
        id: 'agent-1',
        name: 'Sarah Connor',
        email: 'sarah@cotiza.studio',
        specialties: ['technical', 'billing'],
        active: true,
        capacity: 10,
        currentTickets: 3,
      },
      {
        id: 'agent-2',
        name: 'John Doe',
        email: 'john@cotiza.studio',
        specialties: ['general', 'onboarding'],
        active: true,
        capacity: 15,
        currentTickets: 7,
      },
    ];
  }

  private async findSeniorAgent(category: string): Promise<SupportAgent | null> {
    // Mock implementation - would find senior agents by category
    return {
      id: 'senior-agent-1',
      name: 'Jane Smith',
      email: 'jane.smith@cotiza.studio',
      specialties: ['escalations', 'technical'],
      active: true,
      capacity: 5,
      currentTickets: 2,
    };
  }

  private async sendTicketNotifications(
    ticketId: string,
    event: string,
    status?: TicketStatus,
  ): Promise<void> {
    // Mock implementation - would integrate with email/Slack/etc
    this.logger.debug(`Should send ${event} notification for ticket ${ticketId}`);
  }

  private async sendMessageNotifications(ticketId: string, messageId: string): Promise<void> {
    // Mock implementation - would notify relevant parties about new message
    this.logger.debug(
      `Should send message notification for ticket ${ticketId}, message ${messageId}`,
    );
  }

  private async sendEscalationNotifications(ticketId: string, reason: string): Promise<void> {
    // Mock implementation - would notify management about escalation
    this.logger.debug(`Should send escalation notification for ticket ${ticketId}: ${reason}`);
  }

  private async updateTicketMetrics(tenantId: string, action: string, value: any): Promise<void> {
    // Update Redis-based real-time metrics
    const key = `support_metrics:${tenantId}`;
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    await this.redis.hincrby(`${key}:${date}`, action, 1);
    await this.redis.expire(`${key}:${date}`, 86400 * 30); // 30 days retention
  }

  private mapTicketToInterface(ticket: any): SupportTicket {
    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      userId: ticket.userId,
      subject: ticket.subject,
      description: ticket.description,
      priority: ticket.priority as TicketPriority,
      status: ticket.status as TicketStatus,
      category: ticket.category,
      assignedToId: ticket.assignedToId,
      tags: ticket.tags as string[],
      metadata: ticket.metadata as Record<string, unknown>,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      resolvedAt: ticket.resolvedAt,
      firstResponseAt: ticket.firstResponseAt,
      escalatedAt: ticket.escalatedAt,
    };
  }
}
