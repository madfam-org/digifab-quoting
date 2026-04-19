/**
 * EngagementsService — projection lifecycle + grouping behavior.
 *
 * Focused on the business rules the portal depends on. Prisma is mocked
 * so we test service wiring, not persistence. Integration-level
 * (real-Postgres) tests for the same behavior live under
 * apps/api/test/engagements.e2e-spec.ts (future).
 */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { EngagementsService } from '../engagements.service';

const mkPrisma = () => ({
  engagement: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  quote: { findMany: jest.fn() },
});

describe('EngagementsService', () => {
  let service: EngagementsService;
  let prisma: ReturnType<typeof mkPrisma>;

  beforeEach(async () => {
    prisma = mkPrisma();
    const module = await Test.createTestingModule({
      providers: [
        EngagementsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(EngagementsService);
  });

  describe('upsert', () => {
    it('stamps lastSyncedAt when synced=true (webhook path)', async () => {
      prisma.engagement.upsert.mockResolvedValue({ id: 'eng_1' });
      await service.upsert({
        tenantId: 't1',
        phynecrmEngagementId: 'pcrm_1',
        projectName: 'Tablaco build',
        synced: true,
      });
      const call = prisma.engagement.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ phynecrmEngagementId: 'pcrm_1' });
      expect(call.create.lastSyncedAt).toBeInstanceOf(Date);
      expect(call.update.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('leaves lastSyncedAt null when synced=false (auto-materialize path)', async () => {
      prisma.engagement.upsert.mockResolvedValue({ id: 'eng_1' });
      await service.upsert({
        tenantId: 't1',
        phynecrmEngagementId: 'pcrm_1',
        synced: false,
      });
      const call = prisma.engagement.upsert.mock.calls[0][0];
      expect(call.create.lastSyncedAt).toBeNull();
      // `update` omits lastSyncedAt entirely so existing stamps aren't clobbered.
      expect(call.update.lastSyncedAt).toBeUndefined();
    });
  });

  describe('ensureProjection', () => {
    it('returns existing ID without re-creating', async () => {
      prisma.engagement.findUnique.mockResolvedValue({ id: 'eng_existing', tenantId: 't1' });
      const id = await service.ensureProjection('t1', 'pcrm_1');
      expect(id).toBe('eng_existing');
      expect(prisma.engagement.upsert).not.toHaveBeenCalled();
    });

    it('auto-materializes when not found', async () => {
      prisma.engagement.findUnique.mockResolvedValue(null);
      prisma.engagement.upsert.mockResolvedValue({ id: 'eng_new' });
      const id = await service.ensureProjection('t1', 'pcrm_new');
      expect(id).toBe('eng_new');
      expect(prisma.engagement.upsert).toHaveBeenCalledTimes(1);
      // auto-materialized rows must not have lastSyncedAt
      const call = prisma.engagement.upsert.mock.calls[0][0];
      expect(call.create.lastSyncedAt).toBeNull();
      expect(call.create.metadata).toEqual({ autoMaterialized: true });
    });

    it('does not flip tenant on cross-tenant ID collision', async () => {
      prisma.engagement.findUnique.mockResolvedValue({
        id: 'eng_owned',
        tenantId: 't_other',
      });
      const id = await service.ensureProjection('t1', 'pcrm_1');
      // Returns the canonical id; caller tenant mismatch is logged but
      // we don't silently migrate the engagement to the new tenant.
      expect(id).toBe('eng_owned');
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt + status=archived', async () => {
      prisma.engagement.updateMany.mockResolvedValue({ count: 1 });
      await service.softDelete('pcrm_1');
      const call = prisma.engagement.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ phynecrmEngagementId: 'pcrm_1', deletedAt: null });
      expect(call.data.status).toBe('archived');
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('findByPhynecrmId', () => {
    it('returns projection with quote type counts', async () => {
      prisma.engagement.findFirst.mockResolvedValue({
        id: 'eng_1',
        tenantId: 't1',
        phynecrmEngagementId: 'pcrm_1',
        projectName: 'Tablaco',
        status: 'active',
        contactId: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        quotes: [
          { id: 'q1', quoteType: 'fab' },
          { id: 'q2', quoteType: 'services' },
          { id: 'q3', quoteType: 'services' },
        ],
      });
      const result = await service.findByPhynecrmId('t1', 'pcrm_1');
      expect(result.quoteCountsByType).toEqual({ fab: 1, services: 2 });
    });

    it('404s when missing', async () => {
      prisma.engagement.findFirst.mockResolvedValue(null);
      await expect(
        service.findByPhynecrmId('t1', 'pcrm_missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('excludes soft-deleted engagements', async () => {
      prisma.engagement.findFirst.mockResolvedValue(null);
      await expect(
        service.findByPhynecrmId('t1', 'pcrm_deleted'),
      ).rejects.toBeInstanceOf(NotFoundException);
      const where = prisma.engagement.findFirst.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('listQuotesForEngagement', () => {
    it('groups quotes by quoteType', async () => {
      prisma.engagement.findFirst.mockResolvedValue({ id: 'eng_1' });
      prisma.quote.findMany.mockResolvedValue([
        { id: 'q1', quoteType: 'fab', number: 'Q-1' },
        { id: 'q2', quoteType: 'services', number: 'Q-2' },
        { id: 'q3', quoteType: 'fab', number: 'Q-3' },
      ]);
      const grouped = await service.listQuotesForEngagement('t1', 'pcrm_1');
      expect(grouped.fab).toHaveLength(2);
      expect(grouped.services).toHaveLength(1);
    });

    it('404s when engagement missing', async () => {
      prisma.engagement.findFirst.mockResolvedValue(null);
      await expect(
        service.listQuotesForEngagement('t1', 'pcrm_missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
