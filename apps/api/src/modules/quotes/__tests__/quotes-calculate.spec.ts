import { QuotesService } from '../quotes.service';
import { PricingResolverService } from '../../pricing/pricing-resolver.service';
import { QuoteStatus, QuoteType } from '@cotiza/shared';
import { JobType } from '../../jobs/interfaces/job.interface';

/**
 * Unit tests for the fab auto-quoting path of QuotesService.calculate():
 * real geometry wiring (worker analysis present/absent), machine/material
 * resolution, explicit degradation reasons, and market-intelligence
 * provenance persistence.
 */
describe('QuotesService.calculate (fab pricing inputs)', () => {
  const tenantId = 'tenant-1';
  const quoteId = 'quote-1';

  const fileWithAnalysis = {
    id: 'file-1',
    hash: 'hash-abc',
    path: 'tenant-1/file-1.stl',
    s3Key: null,
    type: 'stl',
    filename: 'file-1.stl',
    originalName: 'bracket.stl',
    fileAnalysis: {
      volume: 12.5,
      surfaceArea: 88.4,
      boundingBoxX: 40,
      boundingBoxY: 30,
      boundingBoxZ: 20,
    },
  };

  const baseQuoteItem = {
    id: 'item-1',
    quoteId,
    name: 'bracket.stl',
    process: 'FFF',
    processCode: 'FFF',
    material: 'PLA',
    materialId: 'mat-1',
    quantity: 10,
    selections: { material: 'PLA' },
    flags: [],
    metadata: {},
    files: [fileWithAnalysis],
    dfmReport: null,
  };

  const baseQuote = {
    id: quoteId,
    tenantId,
    status: QuoteStatus.DRAFT,
    quoteType: QuoteType.FAB,
    currency: 'MXN',
    objective: { cost: 0.5, lead: 0.3, green: 0.2 },
    items: [{ id: 'item-1' }],
  };

  const verifiedProvenance = {
    source: 'forgesight',
    sample_count: 42,
    updated_at: '2026-07-01T00:00:00Z',
    confidence: 0.9,
    fallback_reason: null,
    market_verified: true,
  };

  const pricingEngineResult = {
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
    sustainability: { score: 80, co2eKg: 1.2, energyKwh: 3.4 },
    marketIntelligence: null,
    benchmark: null,
    market_context: verifiedProvenance,
    pricing_provenance: verifiedProvenance,
  };

  let mockPrisma: any;
  let mockPricingService: any;
  let mockQuoteCache: any;
  let mockTenantCache: any;
  let mockJobsService: any;
  let service: QuotesService;

  const buildService = () => {
    const resolver = new PricingResolverService(mockPrisma);
    return new QuotesService(
      mockPrisma,
      mockPricingService,
      resolver,
      mockQuoteCache,
      mockTenantCache,
      mockJobsService,
      {} as never, // FilesService
      {} as never, // PhyndCrmEngagementService
      { emit: jest.fn() } as never, // QuoteLifecycleEventsService
      { available: false, sendQuoteReadyEmail: jest.fn() } as never, // JanuaEmailService
      {} as never, // KarafielComplianceService
      {} as never, // DhanamMilestoneService
      {} as never, // PravaraDispatchService
      {} as never, // EngagementsService
      {} as never, // JanuaBillingService
      {} as never, // DhanamRelayService
      { get: jest.fn() } as never, // ConfigService
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      quote: {
        findFirst: jest.fn().mockResolvedValue({ ...baseQuote }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...baseQuote, ...data, items: [] }),
          ),
      },
      quoteItem: {
        findFirst: jest.fn().mockResolvedValue({ ...baseQuoteItem }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...baseQuoteItem, ...data }),
          ),
      },
      machine: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'mach-1', process: 'FFF', hourlyRate: 12, active: true }),
      },
      material: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'mat-1', code: 'PLA', process: 'FFF', active: true }),
      },
    };

    mockPricingService = {
      calculateQuoteItemWithMarketIntelligence: jest.fn().mockResolvedValue(pricingEngineResult),
    };

    mockQuoteCache = {
      getOrCalculateQuote: jest.fn((_key: unknown, fn: () => unknown) => fn()),
    };

    mockTenantCache = {
      getPricingSettings: jest.fn().mockResolvedValue({
        taxRate: 0.16,
        freeShippingThreshold: 1000,
        standardShippingRate: 150,
      }),
    };

    mockJobsService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    service = buildService();
  });

  it('prices a fab item with real geometry, a resolved material and a real machine id', async () => {
    const result = await service.calculate(tenantId, quoteId, {});

    expect(mockPricingService.calculateQuoteItemWithMarketIntelligence).toHaveBeenCalledWith(
      tenantId,
      'FFF',
      {
        volumeCm3: 12.5,
        surfaceAreaCm2: 88.4,
        boundingBox: { x: 40, y: 30, z: 20 },
      },
      'mat-1',
      'mach-1', // never an empty string
      { material: 'PLA' },
      10,
      baseQuote.objective,
    );

    expect(result.errors).toBeUndefined();
    const quoteUpdate = mockPrisma.quote.update.mock.calls.at(-1)[0];
    expect(quoteUpdate.data.status).toBe(QuoteStatus.AUTO_QUOTED);

    // Item persisted with pricing + provenance + machine used.
    const itemUpdate = mockPrisma.quoteItem.update.mock.calls.at(-1)[0];
    expect(itemUpdate.data.unitPrice).toBe(100);
    expect(itemUpdate.data.totalPrice).toBe(1000);
    expect(itemUpdate.data.materialId).toBe('mat-1');
    expect(itemUpdate.data.metadata).toMatchObject({
      machineId: 'mach-1',
      geometrySource: 'file_analysis',
      pricingProvenance: verifiedProvenance,
    });
    expect(itemUpdate.data.sustainability).toMatchObject({ score: 80 });
  });

  it('degrades to NEEDS_REVIEW with missing_geometry_analysis and queues the worker job when no analysis exists', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      ...baseQuoteItem,
      files: [{ ...fileWithAnalysis, fileAnalysis: null }],
      dfmReport: null,
    });

    const result = await service.calculate(tenantId, quoteId, {});

    expect(result.errors).toEqual([{ itemId: 'item-1', error: 'missing_geometry_analysis' }]);
    expect(mockPricingService.calculateQuoteItemWithMarketIntelligence).not.toHaveBeenCalled();

    // Quote forced into review with a machine-readable reason on the item.
    const quoteUpdate = mockPrisma.quote.update.mock.calls.at(-1)[0];
    expect(quoteUpdate.data.status).toBe(QuoteStatus.NEEDS_REVIEW);
    const itemUpdate = mockPrisma.quoteItem.update.mock.calls.at(-1)[0];
    expect(itemUpdate.data.flags).toContain('missing_geometry_analysis');
    expect(itemUpdate.data.metadata).toMatchObject({
      needsReviewReason: 'missing_geometry_analysis',
    });

    // Analysis is (re)triggered via the existing job pattern so a later
    // recalculation can auto-price the item.
    expect(mockJobsService.addJob).toHaveBeenCalledWith(
      JobType.FILE_ANALYSIS,
      expect.objectContaining({
        tenantId,
        fileId: 'file-1',
        fileUrl: 'tenant-1/file-1.stl',
        fileType: 'stl',
      }),
    );
  });

  it('degrades with no_machine_for_process when the tenant has no active machine', async () => {
    mockPrisma.machine.findFirst.mockResolvedValue(null);

    const result = await service.calculate(tenantId, quoteId, {});

    expect(result.errors).toEqual([{ itemId: 'item-1', error: 'no_machine_for_process' }]);
    expect(mockPricingService.calculateQuoteItemWithMarketIntelligence).not.toHaveBeenCalled();
    const quoteUpdate = mockPrisma.quote.update.mock.calls.at(-1)[0];
    expect(quoteUpdate.data.status).toBe(QuoteStatus.NEEDS_REVIEW);
    const itemUpdate = mockPrisma.quoteItem.update.mock.calls.at(-1)[0];
    expect(itemUpdate.data.flags).toContain('no_machine_for_process');
  });

  it('degrades with material_not_found when neither materialId nor code resolves', async () => {
    mockPrisma.material.findFirst.mockResolvedValue(null);

    const result = await service.calculate(tenantId, quoteId, {});

    expect(result.errors).toEqual([{ itemId: 'item-1', error: 'material_not_found' }]);
    expect(mockPricingService.calculateQuoteItemWithMarketIntelligence).not.toHaveBeenCalled();
  });

  it('still auto-quotes with fallback provenance when ForgeSight market data is unavailable', async () => {
    const fallbackProvenance = {
      source: 'internal_pricing',
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: 'market_data_unavailable',
      market_verified: false,
    };
    mockPricingService.calculateQuoteItemWithMarketIntelligence.mockResolvedValue({
      ...pricingEngineResult,
      marketIntelligence: null,
      benchmark: null,
      market_context: fallbackProvenance,
      pricing_provenance: fallbackProvenance,
    });

    const result = await service.calculate(tenantId, quoteId, {});

    // ForgeSight being down/424 never fails the quote...
    expect(result.errors).toBeUndefined();
    const quoteUpdate = mockPrisma.quote.update.mock.calls.at(-1)[0];
    expect(quoteUpdate.data.status).toBe(QuoteStatus.AUTO_QUOTED);
    // ...and the fallback is recorded, never labeled market-verified.
    const itemUpdate = mockPrisma.quoteItem.update.mock.calls.at(-1)[0];
    expect(itemUpdate.data.metadata).toMatchObject({
      pricingProvenance: expect.objectContaining({
        market_verified: false,
        fallback_reason: 'market_data_unavailable',
      }),
    });
  });
});
