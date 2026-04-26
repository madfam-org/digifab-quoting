import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';
import { TenantModule } from './tenant.module';

describe('Multi-Tenant Isolation (Integration)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let tenantContext: TenantContextService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TenantModule],
      providers: [
        {
          provide: PrismaService,
          useFactory: (configService: ConfigService) => {
            const prisma = new PrismaService(configService);
            return prisma;
          },
          inject: [ConfigService],
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('postgresql://test'),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    tenantContext = moduleFixture.get<TenantContextService>(TenantContextService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Tenant Data Isolation', () => {
    it('should automatically filter queries by tenant', async () => {
      const tenant1Context = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        userRoles: ['admin'],
      };

      const tenant2Context = {
        tenantId: 'tenant-2',
        userId: 'user-2',
        userRoles: ['admin'],
      };

      // Mock the Prisma client methods
      const findManySpy = jest.spyOn(prismaService.quote, 'findMany').mockResolvedValue([]);

      // Query as tenant 1
      await tenantContext.run(tenant1Context, async () => {
        await prismaService.quote.findMany();
      });

      expect(findManySpy).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
      });

      findManySpy.mockClear();

      // Query as tenant 2
      await tenantContext.run(tenant2Context, async () => {
        await prismaService.quote.findMany({ where: { status: 'draft' } });
      });

      expect(findManySpy).toHaveBeenCalledWith({
        where: { status: 'draft', tenantId: 'tenant-2' },
      });
    });

    it('should automatically add tenantId to create operations', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['manager'],
      };

      const createSpy = jest.spyOn(prismaService.quote, 'create').mockResolvedValue({} as never);

      await tenantContext.run(context, async () => {
        await prismaService.quote.create({
          data: {
            tenantId: 'tenant-123',
            number: 'Q-2024-001',
            status: 'draft',
            currency: 'USD',
            validityUntil: new Date(),
            subtotal: 0,
            total: 0,
            tax: 0,
          } as any,
        });
      });

      expect(createSpy).toHaveBeenCalledWith({
        data: {
          status: 'draft',
          currency: 'USD',
          validityUntil: expect.any(Date),
          tenantId: 'tenant-123',
        },
      });
    });

    it('should prevent cross-tenant updates', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['admin'],
      };

      const updateSpy = jest.spyOn(prismaService.quote, 'update').mockResolvedValue({} as never);

      await tenantContext.run(context, async () => {
        await prismaService.quote.update({
          where: { id: 'quote-456' },
          data: { status: 'accepted' },
        });
      });

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'quote-456', tenantId: 'tenant-123' },
        data: { status: 'accepted' },
      });
    });

    it('should prevent cross-tenant deletes', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['admin'],
      };

      const deleteSpy = jest.spyOn(prismaService.quote, 'delete').mockResolvedValue({} as never);

      await tenantContext.run(context, async () => {
        await prismaService.quote.delete({
          where: { id: 'quote-789' },
        });
      });

      expect(deleteSpy).toHaveBeenCalledWith({
        where: { id: 'quote-789', tenantId: 'tenant-123' },
      });
    });

    it('should handle createMany operations', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['admin'],
      };

      const createManySpy = jest
        .spyOn(prismaService.material, 'createMany')
        .mockResolvedValue({ count: 2 });

      await tenantContext.run(context, async () => {
        await prismaService.material.createMany({
          data: [
            {
              tenantId: 'tenant-123',
              name: 'Material 1',
              code: 'M1',
              process: '3d_printing',
              density: 1.0,
              costPerUnit: 10,
            } as any,
            {
              tenantId: 'tenant-123',
              name: 'Material 2',
              code: 'M2',
              process: '3d_printing',
              density: 1.0,
              costPerUnit: 20,
            } as any,
          ],
        });
      });

      expect(createManySpy).toHaveBeenCalledWith({
        data: [
          { name: 'Material 1', code: 'M1', process: '3d_printing', tenantId: 'tenant-123' },
          { name: 'Material 2', code: 'M2', process: '3d_printing', tenantId: 'tenant-123' },
        ],
      });
    });

    it('should not affect global models', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['admin'],
      };

      const findManySpy = jest.spyOn(prismaService.tenant, 'findMany').mockResolvedValue([]);

      await tenantContext.run(context, async () => {
        await prismaService.tenant.findMany();
      });

      // Tenant model should not have tenant filtering
      expect(findManySpy).toHaveBeenCalledWith();
    });

    it('should handle complex where clauses', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['manager'],
      };

      const findManySpy = jest.spyOn(prismaService.quote, 'findMany').mockResolvedValue([]);

      await tenantContext.run(context, async () => {
        await prismaService.quote.findMany({
          where: {
            OR: [{ status: 'draft' }, { status: 'pending' }],
            createdAt: {
              gte: new Date('2024-01-01'),
            },
          },
        });
      });

      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          OR: [{ status: 'draft' }, { status: 'pending' }],
          createdAt: {
            gte: new Date('2024-01-01'),
          },
          tenantId: 'tenant-123',
        },
      });
    });

    it('should handle operations without tenant context for global models', async () => {
      const findManySpy = jest.spyOn(prismaService.fXRate, 'findMany').mockResolvedValue([]);

      // No tenant context
      await prismaService.fXRate.findMany();

      expect(findManySpy).toHaveBeenCalledWith();
    });

    it('should work with transactions', async () => {
      const context = {
        tenantId: 'tenant-123',
        userId: 'user-123',
        userRoles: ['admin'],
      };

      const transactionSpy = jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (fn) => {
          if (typeof fn === 'function') {
            return fn(prismaService);
          }
          return [];
        });

      await tenantContext.run(context, async () => {
        await prismaService.$transaction(async (tx) => {
          // Transaction queries should still respect tenant context
          const findSpy = jest.spyOn(tx.quote, 'findMany').mockResolvedValue([]);
          await tx.quote.findMany();

          expect(findSpy).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-123' },
          });
        });
      });

      expect(transactionSpy).toHaveBeenCalled();
    });
  });
});
