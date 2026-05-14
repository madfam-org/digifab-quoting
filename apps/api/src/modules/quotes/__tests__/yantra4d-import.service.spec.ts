import { HttpException, HttpStatus } from '@nestjs/common';
import { Yantra4dImportService } from '../services/yantra4d-import.service';

const marketContext = {
  source: 'internal_pricing',
  sample_count: 0,
  updated_at: null,
  confidence: 0,
  fallback_reason: 'forgesight_not_configured',
  market_verified: false,
};

const responseMarketContext = {
  ...marketContext,
  pricing_source: marketContext.source,
  provenance: marketContext,
};

const verifiedMarketContext = {
  source: 'forgesight',
  sample_count: 7,
  updated_at: '2026-05-13T12:00:00.000Z',
  confidence: 0.86,
  fallback_reason: null,
  market_verified: true,
};

function buildDto() {
  return {
    source: 'yantra4d',
    project: {
      slug: 'rugged-box',
      name: 'Rugged Box',
    },
    geometry: {
      volume_cm3: 42.75,
      surface_area_cm2: 185.2,
      bounding_box_mm: { x: 120.5, y: 80.3, z: 45 },
    },
    item: {
      name: 'Rugged Box',
      process: '3d_fff',
      material: 'PLA',
      quantity: 5,
      finish: 'standard',
    },
    currency: 'MXN',
    notes: 'Test import',
  };
}

describe('Yantra4dImportService pricing provenance', () => {
  let prisma: any;
  let pricingService: any;
  let service: Yantra4dImportService;

  beforeEach(() => {
    prisma = {
      material: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mat-1', name: 'PLA' }),
      },
      machine: {
        findFirst: jest.fn().mockResolvedValue({ id: 'machine-1', name: 'FFF Printer' }),
      },
      quote: {
        create: jest.fn().mockResolvedValue({ id: 'quote-1' }),
        update: jest.fn().mockResolvedValue({ id: 'quote-1' }),
      },
      quoteItem: {
        create: jest.fn().mockResolvedValue({ id: 'item-1' }),
        update: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
    };

    pricingService = {
      calculateQuoteItemWithMarketIntelligence: jest.fn().mockResolvedValue({
        unitPrice: 100,
        totalPrice: 500,
        leadDays: 5,
        costBreakdown: { material: 120, machine: 80, labor: 50, overhead: 30, margin: 220 },
        market_context: marketContext,
      }),
    };

    service = new Yantra4dImportService(
      prisma,
      pricingService,
      {
        getTenantConfig: jest.fn().mockResolvedValue({ settings: { quoteValidityDays: 14 } }),
        getPricingSettings: jest.fn().mockResolvedValue({
          taxRate: 0.16,
          freeShippingThreshold: 1000,
          standardShippingRate: 150,
        }),
      } as any,
      {} as any,
    );

    jest.spyOn(service as any, 'generateQuoteNumber').mockResolvedValue('Q-2026-05-0001');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores and exposes review-only unverified pricing provenance from Yantra4D imports', async () => {
    const result = await service.createQuoteFromYantra4d('tenant-1', 'user-1', buildDto() as any);

    expect(result.status).toBe('needs_review');
    expect(result.market_context).toEqual(responseMarketContext);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'ForgeSight market verification unavailable. Quote is review-only and must not be sent to the customer until approved.',
      ]),
    );
    expect(prisma.quoteItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costBreakdown: expect.objectContaining({
            pricing_provenance: responseMarketContext,
          }),
          flags: ['needs_review'],
        }),
      }),
    );
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            market_context: responseMarketContext,
            pricing_provenance: responseMarketContext,
          }),
        }),
      }),
    );
  });

  it('marks fallback estimates as not market verified when material and machine are missing', async () => {
    prisma.material.findFirst.mockResolvedValue(null);
    prisma.machine.findFirst.mockResolvedValue(null);

    const result = await service.createQuoteFromYantra4d('tenant-1', 'user-1', buildDto() as any);

    expect(pricingService.calculateQuoteItemWithMarketIntelligence).not.toHaveBeenCalled();
    expect(result.market_context).toMatchObject({
      source: 'internal_fallback',
      pricing_source: 'internal_fallback',
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: 'missing_material_and_machine_configuration',
      market_verified: false,
    });
  });

  it('fails closed with 424 and does not create a quote when strict market verification is unavailable', async () => {
    try {
      await service.createQuoteFromYantra4d('tenant-1', 'user-1', {
        ...buildDto(),
        require_market_verified: true,
      } as any);
      throw new Error('expected strict market verification to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
      expect((error as HttpException).getResponse()).toMatchObject({
        statusCode: HttpStatus.FAILED_DEPENDENCY,
        error: 'market_data_unavailable',
        market_context: responseMarketContext,
      });
    }

    expect(prisma.quote.create).not.toHaveBeenCalled();
    expect(prisma.quoteItem.create).not.toHaveBeenCalled();
    expect(prisma.quote.update).not.toHaveBeenCalled();
    expect(prisma.quoteItem.update).not.toHaveBeenCalled();
  });

  it('creates an auto-quoted response when strict market verification succeeds', async () => {
    pricingService.calculateQuoteItemWithMarketIntelligence.mockResolvedValueOnce({
      unitPrice: 100,
      totalPrice: 500,
      leadDays: 5,
      costBreakdown: { material: 120, machine: 80, labor: 50, overhead: 30, margin: 220 },
      market_context: verifiedMarketContext,
    });

    const result = await service.createQuoteFromYantra4d('tenant-1', 'user-1', {
      ...buildDto(),
      require_market_verified: true,
    } as any);

    expect(result.status).toBe('auto_quoted');
    expect(result.warnings).toBeUndefined();
    expect(result.market_context).toEqual({
      ...verifiedMarketContext,
      pricing_source: 'forgesight',
      provenance: verifiedMarketContext,
    });
  });
});
