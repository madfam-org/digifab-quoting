/**
 * Engagements — first-class projection of PhyndCRM engagement aggregates.
 *
 * PhyndCRM owns the engagement lifecycle; Cotiza stores a projection so
 * it can group quotes by engagement without reaching across service
 * boundaries for every portal render. Three mutation paths:
 *
 * 1. `ensureProjection` — called when a Quote references an engagement
 *    ID we haven't seen yet. Auto-materializes a stub row with
 *    `lastSyncedAt = NULL` that gets filled in when PhyndCRM pushes the
 *    `engagement.created`/`engagement.updated` webhook.
 *
 * 2. `applyWebhook` — the inbound webhook path. Upsert keyed by
 *    `phyndcrmEngagementId`, always bumps `lastSyncedAt`.
 *
 * 3. `softDelete` — `engagement.archived`. Sets `deletedAt`; quotes keep
 *    their FK but any portal query filters on non-null `deletedAt`.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface UpsertEngagementInput {
  tenantId: string;
  phyndcrmEngagementId: string;
  projectName?: string | null;
  status?: string;
  contactId?: string | null;
  metadata?: Record<string, unknown>;
  synced?: boolean;
}

export interface EngagementWithQuoteCounts {
  id: string;
  tenantId: string;
  phyndcrmEngagementId: string;
  projectName: string | null;
  status: string;
  contactId: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  quoteCountsByType: Record<string, number>;
}

@Injectable()
export class EngagementsService {
  private readonly logger = new Logger(EngagementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent upsert. Called both from the inbound webhook and from
   * `ensureProjection`. When `synced=true` (webhook path) we stamp
   * `lastSyncedAt`; when false (auto-materialized from a quote), we
   * leave it NULL so we know the row hasn't been confirmed from
   * PhyndCRM yet.
   */
  async upsert(input: UpsertEngagementInput) {
    const now = new Date();
    const data: Prisma.EngagementUpdateInput = {
      status: input.status ?? 'active',
      ...(input.projectName !== undefined && { projectName: input.projectName }),
      ...(input.contactId !== undefined && { contactId: input.contactId }),
      ...(input.metadata !== undefined && {
        metadata: input.metadata as Prisma.InputJsonValue,
      }),
      ...(input.synced && { lastSyncedAt: now }),
    };

    return this.prisma.engagement.upsert({
      where: { phyndcrmEngagementId: input.phyndcrmEngagementId },
      create: {
        tenantId: input.tenantId,
        phyndcrmEngagementId: input.phyndcrmEngagementId,
        projectName: input.projectName ?? null,
        status: input.status ?? 'active',
        contactId: input.contactId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        lastSyncedAt: input.synced ? now : null,
      },
      update: data,
    });
  }

  /**
   * Auto-materialize from a quote's PhyndCRM engagement ID. Used by
   * QuotesService when creating a quote with `engagementId` that
   * doesn't yet exist in Cotiza.
   */
  async ensureProjection(tenantId: string, phyndcrmEngagementId: string): Promise<string> {
    const existing = await this.prisma.engagement.findUnique({
      where: { phyndcrmEngagementId },
      select: { id: true, tenantId: true },
    });
    if (existing) {
      // Cross-tenant ID collision would be a bug upstream; log loud and
      // return the canonical ID. We don't flip the tenant.
      if (existing.tenantId !== tenantId) {
        this.logger.warn(
          `engagement ${phyndcrmEngagementId} already owned by tenant ${existing.tenantId}, refusing cross-tenant attach (caller tenant=${tenantId})`,
        );
      }
      return existing.id;
    }
    const created = await this.upsert({
      tenantId,
      phyndcrmEngagementId,
      metadata: { autoMaterialized: true },
      synced: false,
    });
    this.logger.log(
      `auto-materialized engagement projection for ${phyndcrmEngagementId} (tenant=${tenantId})`,
    );
    return created.id;
  }

  async softDelete(phyndcrmEngagementId: string): Promise<void> {
    await this.prisma.engagement.updateMany({
      where: { phyndcrmEngagementId, deletedAt: null },
      data: { deletedAt: new Date(), status: 'archived' },
    });
  }

  async findByPhynecrmId(
    tenantId: string,
    phyndcrmEngagementId: string,
  ): Promise<EngagementWithQuoteCounts> {
    const engagement = await this.prisma.engagement.findFirst({
      where: {
        phyndcrmEngagementId,
        tenantId,
        deletedAt: null,
      },
      include: {
        quotes: {
          select: { id: true, quoteType: true },
        },
      },
    });
    if (!engagement) {
      throw new NotFoundException(
        `engagement ${phyndcrmEngagementId} not found for tenant ${tenantId}`,
      );
    }
    const counts: Record<string, number> = {};
    for (const q of engagement.quotes) {
      counts[q.quoteType] = (counts[q.quoteType] ?? 0) + 1;
    }
    return {
      id: engagement.id,
      tenantId: engagement.tenantId,
      phyndcrmEngagementId: engagement.phyndcrmEngagementId,
      projectName: engagement.projectName,
      status: engagement.status,
      contactId: engagement.contactId,
      lastSyncedAt: engagement.lastSyncedAt,
      createdAt: engagement.createdAt,
      updatedAt: engagement.updatedAt,
      quoteCountsByType: counts,
    };
  }

  /**
   * Return quotes for an engagement grouped by quoteType. The portal
   * uses this to render the two-cards-per-engagement view (physical +
   * digital) for the tablaco-style flow.
   */
  async listQuotesForEngagement(
    tenantId: string,
    phyndcrmEngagementId: string,
  ): Promise<Record<string, unknown[]>> {
    const engagement = await this.prisma.engagement.findFirst({
      where: {
        phyndcrmEngagementId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!engagement) {
      throw new NotFoundException(
        `engagement ${phyndcrmEngagementId} not found for tenant ${tenantId}`,
      );
    }
    const quotes = await this.prisma.quote.findMany({
      where: { engagementId: engagement.id, tenantId },
      select: {
        id: true,
        number: true,
        quoteType: true,
        status: true,
        currency: true,
        total: true,
        validityUntil: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const grouped: Record<string, unknown[]> = {};
    for (const q of quotes) {
      (grouped[q.quoteType] ??= []).push(q);
    }
    return grouped;
  }
}
