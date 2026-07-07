import { PricingService } from '../pricing.service';
import { ForgeSightService } from '../forgesight.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ForgesightError } from '../../../integrations/forgesight';
import { ProcessType } from '@cotiza/shared';

describe('PricingService.calculateQuoteItemWithMarketIntelligence', () => {
  let service: PricingService;

  const mockPrisma = {} as unknown as PrismaService;

  const mockForgeSight = {
    isEnabled: jest.fn(),
    getMarketPricing: jest.fn(),
    getBenchmark: jest.fn(),
  };

  const basePricing = {
    unitPrice: 100,
    totalPrice: 1000,
    leadDays: 4,
    costBreakdown: {
      material: 300,
      machine: 400,
      energy: 20,
      labor: 80,
      overhead: 100,
      margin: 100,
    },
    sustainability: {
      score: 80,
      co2eKg: 1.2,
      energyKwh: 3.4,
      recycledPercent: 0,
      wastePercent: 5,
    },
    market_context: {
      source: 'internal_pricing',
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: 'forgesight_not_requested',
      market_verified: false,
    },
    pricing_provenance: {
      source: 'internal_pricing',
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: 'forgesight_not_requested',
      market_verified: false,
    },
  };

  const callArgs = [
    'tenant-1',
    ProcessType.FFF,
    { volumeCm3: 12.5, surfaceAreaCm2: 88, boundingBox: { x: 40, y: 30, z: 20 } },
    'mat-1',
    'mach-1',
    { material: 'PLA' },
    10,
    { cost: 0.5, lead: 0.3, green: 0.2 },
  ] as const;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PricingService(mockPrisma, mockForgeSight as unknown as ForgeSightService);
    jest
      .spyOn(service, 'calculateQuoteItem')
      .mockResolvedValue(basePricing as unknown as ReturnType<typeof Object>);
  });

  it('records forgesight_not_configured and skips the API when ForgeSight is disabled', async () => {
    mockForgeSight.isEnabled.mockReturnValue(false);

    const result = await service.calculateQuoteItemWithMarketIntelligence(...callArgs);

    expect(mockForgeSight.getMarketPricing).not.toHaveBeenCalled();
    expect(result.unitPrice).toBe(100);
    expect(result.marketIntelligence).toBeNull();
    expect(result.benchmark).toBeNull();
    expect(result.pricing_provenance).toMatchObject({
      source: 'internal_pricing',
      market_verified: false,
      fallback_reason: 'forgesight_not_configured',
    });
  });

  it('falls back to market_data_unavailable when ForgeSight has no fresh benchmark (424 path)', async () => {
    mockForgeSight.isEnabled.mockReturnValue(true);
    // ForgeSightService.getMarketPricing swallows the 424 and yields null.
    mockForgeSight.getMarketPricing.mockResolvedValue(null);

    const result = await service.calculateQuoteItemWithMarketIntelligence(...callArgs);

    // Pricing-engine output stands alone — the quote is still priced.
    expect(result.unitPrice).toBe(100);
    expect(result.totalPrice).toBe(1000);
    expect(result.marketIntelligence).toBeNull();
    expect(result.benchmark).toBeNull();
    // ...but is never labeled market-verified.
    expect(result.pricing_provenance).toMatchObject({
      source: 'internal_pricing',
      market_verified: false,
      fallback_reason: 'market_data_unavailable',
    });
    expect(result.market_context).toEqual(result.pricing_provenance);
  });

  it('never fails the quote when the ForgeSight call throws', async () => {
    mockForgeSight.isEnabled.mockReturnValue(true);
    mockForgeSight.getMarketPricing.mockRejectedValue(new Error('connection refused'));

    const result = await service.calculateQuoteItemWithMarketIntelligence(...callArgs);

    expect(result.unitPrice).toBe(100);
    expect(result.pricing_provenance).toMatchObject({
      market_verified: false,
      fallback_reason: 'market_data_unavailable',
    });
  });

  it('attaches market intelligence and benchmark when a verified benchmark exists', async () => {
    const verifiedContext = {
      source: 'forgesight',
      sample_count: 42,
      updated_at: '2026-07-01T00:00:00Z',
      confidence: 0.9,
      fallback_reason: null,
      market_verified: true,
    };
    mockForgeSight.isEnabled.mockReturnValue(true);
    mockForgeSight.getMarketPricing.mockResolvedValue({
      materialCost: 280,
      serviceCost: 700,
      totalCost: 980,
      currency: 'MXN',
      confidence: 0.9,
      benchmarkPosition: 'average',
      breakdown: { materialPerUnit: 28, setupFee: 50, processingCost: 65 },
      market_context: verifiedContext,
    });
    mockForgeSight.getBenchmark.mockResolvedValue({
      marketLow: 784,
      marketAverage: 980,
      marketHigh: 1274,
      ourPosition: 'at_market',
      competitiveIndex: 55,
      recommendation: 'maintain',
      market_context: verifiedContext,
    });

    const result = await service.calculateQuoteItemWithMarketIntelligence(...callArgs);

    expect(result.marketIntelligence).toMatchObject({
      marketPrice: 980,
      confidence: 0.9,
      benchmarkPosition: 'average',
    });
    expect(result.benchmark).toMatchObject({
      ourPosition: 'at_market',
      recommendation: 'maintain',
    });
    expect(result.pricing_provenance).toMatchObject({
      source: 'forgesight',
      market_verified: true,
      fallback_reason: null,
      sample_count: 42,
    });
    expect(mockForgeSight.getBenchmark).toHaveBeenCalledWith(
      expect.objectContaining({ ourPrice: 1000 }),
    );
  });

  it('keeps unverified upstream data as provenance without granting verification', async () => {
    const unverifiedContext = {
      source: 'internal_pricing',
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: 'forgesight_unverified_market_data',
      market_verified: false,
    };
    mockForgeSight.isEnabled.mockReturnValue(true);
    mockForgeSight.getMarketPricing.mockResolvedValue({
      totalCost: 0,
      market_context: unverifiedContext,
    });

    const result = await service.calculateQuoteItemWithMarketIntelligence(...callArgs);

    expect(result.marketIntelligence).toBeNull();
    expect(result.benchmark).toBeNull();
    expect(mockForgeSight.getBenchmark).not.toHaveBeenCalled();
    expect(result.pricing_provenance).toMatchObject({
      market_verified: false,
      fallback_reason: 'forgesight_unverified_market_data',
    });
  });
});

describe('ForgeSightService.getMarketPricing (424 truth-preserving contract)', () => {
  const makeService = (client: { getQuotePricing: jest.Mock }) => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'FORGESIGHT_API_URL'
          ? 'https://api.forgesight.quest'
          : key === 'FORGESIGHT_API_KEY'
            ? 'test-key'
            : undefined,
      ),
    } as unknown as ConfigService;

    const service = new ForgeSightService(configService);
    service.onModuleInit();
    (service as unknown as { client: unknown }).client = client;
    return service;
  };

  it('treats 424 (no fresh benchmark) as a normal null fallback, not a failure', async () => {
    const client = {
      getQuotePricing: jest
        .fn()
        .mockRejectedValue(new ForgesightError('no fresh benchmark', 424, 'STALE_BENCHMARK')),
    };
    const service = makeService(client);

    await expect(
      service.getMarketPricing({
        materialId: 'pla-basic',
        process: ProcessType.FFF,
        quantity: 10,
      }),
    ).resolves.toBeNull();
  });

  it('also degrades to null on outages (5xx / network errors)', async () => {
    const client = {
      getQuotePricing: jest
        .fn()
        .mockRejectedValue(new ForgesightError('Forgesight connection failed', 503)),
    };
    const service = makeService(client);

    await expect(
      service.getMarketPricing({
        materialId: 'pla-basic',
        process: ProcessType.FFF,
        quantity: 10,
      }),
    ).resolves.toBeNull();
  });
});
