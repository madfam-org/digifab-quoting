import { BadRequestException } from '@nestjs/common';
import { QuoteType } from '@cotiza/shared';
import { Decimal } from 'decimal.js';
import { QuotesService } from '../quotes.service';

// Focused spec for the Phase B services-mode code paths:
//   - create(): feature-flag enforcement
//   - calculateServices() private path (exercised via calculate())
//
// Uses hand-rolled stubs rather than the full NestJS DI container — the
// broader quotes.service.spec.ts already covers fab-mode with the full
// TestingModule; this file avoids duplicating that setup.

function makeService(
  overrides: Partial<{
    prisma: unknown;
    pricingService: unknown;
    quoteCacheService: unknown;
    tenantCacheService: unknown;
    jobsService: unknown;
    filesService: unknown;
    phynecrmEngagement: unknown;
  }> = {},
): QuotesService {
  const prisma = overrides.prisma ?? {
    quote: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    quoteItem: { update: jest.fn() },
  };
  const pricingService = overrides.pricingService ?? { calculateQuoteItem: jest.fn() };
  const quoteCacheService = overrides.quoteCacheService ?? { getOrCalculateQuote: jest.fn() };
  const tenantCacheService = overrides.tenantCacheService ?? {
    getTenantConfig: jest.fn(),
    getTenantFeatures: jest.fn(),
    getPricingSettings: jest.fn(),
  };
  const jobsService = overrides.jobsService ?? { addJob: jest.fn() };
  const filesService = overrides.filesService ?? { getFileUrl: jest.fn() };
  const phynecrmEngagement = overrides.phynecrmEngagement ?? {
    getEngagementId: jest.fn().mockReturnValue(null),
    recordEvent: jest.fn(),
    recordArtifact: jest.fn(),
  };

  return new QuotesService(
    prisma as never,
    pricingService as never,
    quoteCacheService as never,
    tenantCacheService as never,
    jobsService as never,
    filesService as never,
    phynecrmEngagement as never,
  );
}

describe('QuotesService (services-mode)', () => {
  describe('create()', () => {
    it('creates a fab-mode quote without checking the feature flag', async () => {
      const quoteCreate = jest.fn().mockResolvedValue({ id: 'q1', quoteType: 'fab' });
      const getTenantConfig = jest
        .fn()
        .mockResolvedValue({ settings: { quoteValidityDays: 14 } });
      const getTenantFeatures = jest.fn();

      const service = makeService({
        prisma: {
          quote: { create: quoteCreate, count: jest.fn().mockResolvedValue(0) },
        },
        tenantCacheService: { getTenantConfig, getTenantFeatures, getPricingSettings: jest.fn() },
      });

      await service.create('tenant-1', 'cust-1', {
        currency: 'MXN',
        objective: { cost: 0.5, lead: 0.3, green: 0.2 } as never,
      } as never);

      expect(getTenantFeatures).not.toHaveBeenCalled();
      expect(quoteCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quoteType: QuoteType.FAB }),
        }),
      );
    });

    it('rejects services-mode when Tenant.features.servicesQuotes is false', async () => {
      const getTenantFeatures = jest.fn().mockResolvedValue({ servicesQuotes: false });
      const service = makeService({
        tenantCacheService: {
          getTenantConfig: jest.fn().mockResolvedValue({ settings: {} }),
          getTenantFeatures,
          getPricingSettings: jest.fn(),
        },
      });

      await expect(
        service.create('tenant-1', 'cust-1', {
          currency: 'MXN',
          objective: { cost: 0.5, lead: 0.3, green: 0.2 } as never,
          quoteType: QuoteType.SERVICES,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(getTenantFeatures).toHaveBeenCalledWith('tenant-1');
    });

    it('allows services-mode when the feature flag is true', async () => {
      const quoteCreate = jest
        .fn()
        .mockResolvedValue({ id: 'q1', quoteType: 'services' });
      const service = makeService({
        prisma: {
          quote: { create: quoteCreate, count: jest.fn().mockResolvedValue(0) },
        },
        tenantCacheService: {
          getTenantConfig: jest.fn().mockResolvedValue({ settings: {} }),
          getTenantFeatures: jest.fn().mockResolvedValue({ servicesQuotes: true }),
          getPricingSettings: jest.fn(),
        },
      });

      const result = await service.create('tenant-1', 'cust-1', {
        currency: 'MXN',
        objective: { cost: 0.5, lead: 0.3, green: 0.2 } as never,
        quoteType: QuoteType.SERVICES,
      } as never);

      expect(result.id).toBe('q1');
      expect(quoteCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quoteType: QuoteType.SERVICES }),
        }),
      );
    });
  });

  describe('calculate() → services-mode path', () => {
    it('skips the pricing engine and sums unitPrice × quantity for each item', async () => {
      const quoteWithServicesItems = {
        id: 'q-srv-1',
        tenantId: 'tenant-1',
        quoteType: 'services',
        currency: 'MXN',
        items: [
          { id: 'it-1', unitPrice: new Decimal(200), totalPrice: null, quantity: 3 },
          { id: 'it-2', unitPrice: new Decimal(500), totalPrice: new Decimal(500), quantity: 1 },
        ],
      };
      const quoteItemUpdate = jest.fn().mockResolvedValue(undefined);
      const quoteUpdate = jest
        .fn()
        .mockResolvedValue({ id: 'q-srv-1', status: 'quoted', items: quoteWithServicesItems.items });
      const findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue({ ...quoteWithServicesItems, items: quoteWithServicesItems.items });

      const pricingCalc = jest.fn();

      const service = makeService({
        prisma: {
          quote: {
            findFirst: jest.fn().mockResolvedValue(quoteWithServicesItems),
            findUniqueOrThrow,
            update: quoteUpdate,
          },
          quoteItem: { update: quoteItemUpdate },
        },
        pricingService: { calculateQuoteItem: pricingCalc },
        tenantCacheService: {
          getTenantConfig: jest.fn(),
          getTenantFeatures: jest.fn(),
          getPricingSettings: jest.fn().mockResolvedValue({
            taxRate: 0.16,
            freeShippingThreshold: 1000,
            standardShippingRate: 150,
          }),
        },
      });

      await service.calculate('tenant-1', 'q-srv-1', {} as never);

      // Pricing engine is bypassed
      expect(pricingCalc).not.toHaveBeenCalled();

      // it-1 needed a totalPrice recalc (was null), it-2 already had the
      // correct total so no update call
      const updatedItemIds = quoteItemUpdate.mock.calls.map(
        (c) => (c[0] as { where: { id: string } }).where.id,
      );
      expect(updatedItemIds).toEqual(['it-1']);

      // Final quote update sets status to 'quoted'
      expect(quoteUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'quoted' }),
        }),
      );
    });

    it('throws BadRequestException if a services item has no unitPrice', async () => {
      const brokenQuote = {
        id: 'q-srv-2',
        tenantId: 'tenant-1',
        quoteType: 'services',
        currency: 'MXN',
        items: [{ id: 'it-bad', unitPrice: null, totalPrice: null, quantity: 1 }],
      };

      const service = makeService({
        prisma: {
          quote: {
            findFirst: jest.fn().mockResolvedValue(brokenQuote),
            findUniqueOrThrow: jest.fn(),
            update: jest.fn(),
          },
          quoteItem: { update: jest.fn() },
        },
      });

      await expect(
        service.calculate('tenant-1', 'q-srv-2', {} as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
