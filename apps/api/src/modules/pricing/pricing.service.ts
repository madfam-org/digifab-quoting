import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cacheable } from '../redis/decorators/cache.decorator';
import { ProcessType, Material, Machine, QuoteItemSelections } from '@cotiza/shared';
import {
  PricingEngine,
  TenantPricingConfig,
  GeometryMetrics as PricingGeometryMetrics,
} from '@cotiza/pricing-engine';
import { Decimal } from 'decimal.js';
import { ForgeSightService, PricingProvenance } from './forgesight.service';

interface GeometryMetrics {
  volumeCm3?: number;
  surfaceAreaCm2?: number;
  boundingBox?: { x: number; y: number; z: number };
}

interface PricingSelections {
  finish?: string;
  color?: string;
  [key: string]: unknown;
}

interface PricingObjective {
  cost?: number;
  lead?: number;
  green?: number;
}

interface TenantSettings {
  rushOrderRate?: number;
  overheadRate?: number;
  taxRate?: number;
  quoteValidityDays?: number;
  volumeDiscountThresholds?: Record<string, number>;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly pricingEngine: PricingEngine;

  constructor(
    private prisma: PrismaService,
    private forgeSightService: ForgeSightService,
  ) {
    this.pricingEngine = new PricingEngine();
  }

  private buildInternalMarketContext(
    fallbackReason: string,
    source: PricingProvenance['source'] = 'internal_pricing',
  ): PricingProvenance {
    return {
      source,
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: fallbackReason,
      market_verified: false,
    };
  }

  async calculateQuoteItem(
    tenantId: string,
    process: ProcessType,
    geometryMetrics: GeometryMetrics,
    materialId: string,
    machineId: string,
    selections: PricingSelections,
    quantity: number,
    _objective: PricingObjective,
  ) {
    // Load all required data in parallel with better error handling
    const [material, machine, tenantConfig] = await Promise.all([
      this.prisma.material.findFirst({
        where: { id: materialId, tenantId, active: true },
      }),
      this.prisma.machine.findFirst({
        where: { id: machineId, tenantId, active: true },
      }),
      this.getTenantPricingConfig(tenantId),
    ]);

    if (!material) {
      throw new Error(`Material with ID ${materialId} not found or inactive`);
    }

    if (!machine) {
      throw new Error(`Machine with ID ${machineId} not found or inactive`);
    }

    // Convert to pricing engine format
    const pricingGeometry: PricingGeometryMetrics = {
      volumeCm3: geometryMetrics.volumeCm3 || 1,
      surfaceAreaCm2: geometryMetrics.surfaceAreaCm2 || 1,
      bboxMm: geometryMetrics.boundingBox || { x: 10, y: 10, z: 10 },
    };

    const pricingConfig: TenantPricingConfig = {
      marginFloorPercent: new Decimal(tenantConfig.minimumMargin * 100),
      overheadPercent: new Decimal((tenantConfig.overheadRate || 0.15) * 100),
      energyTariffPerKwh: new Decimal(0.12),
      laborRatePerHour: new Decimal(25),
      rushUpchargePercent: new Decimal((tenantConfig.rushOrderRate || 0.25) * 100),
      volumeDiscounts: Object.entries(tenantConfig.volumeDiscountThresholds || {}).map(
        ([qty, discount]) => ({
          minQuantity: parseInt(qty),
          discountPercent: new Decimal(discount * 100),
        }),
      ),
      gridCo2eFactor: new Decimal(0.42),
      logisticsCo2eFactor: new Decimal(0.0002),
    };

    // Use pricing engine
    const pricingResult = this.pricingEngine.calculate({
      process,
      geometry: pricingGeometry,
      material: material as unknown as Material,
      machine: machine as unknown as Machine,
      selections: { material: materialId, ...selections } as QuoteItemSelections,
      quantity,
      tenantConfig: pricingConfig,
    });

    // Handle any warnings
    if (pricingResult.warnings && pricingResult.warnings.length > 0) {
      // Log warnings using proper logger (should be injected in production)
      // this.logger.warn('Pricing warnings:', pricingResult.warnings);
    }

    const pricingProvenance = this.buildInternalMarketContext('forgesight_not_requested');

    return {
      unitPrice: pricingResult.unitPrice.toNumber(),
      totalPrice: pricingResult.totalPrice.toNumber(),
      leadDays: pricingResult.leadDays,
      costBreakdown: {
        material: pricingResult.costBreakdown.material.toNumber(),
        machine: pricingResult.costBreakdown.machine.toNumber(),
        energy: pricingResult.costBreakdown.energy.toNumber(),
        labor: pricingResult.costBreakdown.labor.toNumber(),
        overhead: pricingResult.costBreakdown.overhead.toNumber(),
        margin: pricingResult.costBreakdown.margin.toNumber(),
      },
      sustainability: {
        score: pricingResult.sustainability.score,
        co2eKg: pricingResult.sustainability.co2eKg.toNumber(),
        energyKwh: pricingResult.sustainability.energyKwh.toNumber(),
        recycledPercent: pricingResult.sustainability.recycledPercent,
        wastePercent: pricingResult.sustainability.wastePercent,
      },
      market_context: pricingProvenance,
      pricing_provenance: pricingProvenance,
    };
  }

  @Cacheable({ prefix: 'materials', ttl: 1800 }) // Cache for 30 minutes
  async getMaterials(tenantId: string, process?: ProcessType) {
    const where: {
      tenantId: string;
      process?: ProcessType;
      active?: boolean;
    } = {
      tenantId,
    };

    if (process) {
      where.process = process;
    }

    return this.prisma.material.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  @Cacheable({ prefix: 'machines', ttl: 1800 }) // Cache for 30 minutes
  async getMachines(tenantId: string, process?: ProcessType) {
    const where: {
      tenantId: string;
      process?: ProcessType;
      active?: boolean;
    } = {
      tenantId,
    };

    if (process) {
      where.process = process;
    }

    return this.prisma.machine.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  @Cacheable({ prefix: 'process-options', ttl: 1800 }) // Cache for 30 minutes
  async getProcessOptions(tenantId: string, process?: ProcessType) {
    const where: {
      tenantId: string;
      process?: ProcessType;
      active?: boolean;
    } = {
      tenantId,
    };

    if (process) {
      where.process = process;
    }

    return this.prisma.processOption.findMany({
      where,
      orderBy: { process: 'asc' },
    });
  }

  /**
   * Calculate quote item with market intelligence from ForgeSight
   *
   * This enhanced method combines internal pricing calculations with
   * external market data to provide competitive and accurate quotes.
   */
  async calculateQuoteItemWithMarketIntelligence(
    tenantId: string,
    process: ProcessType,
    geometryMetrics: GeometryMetrics,
    materialId: string,
    machineId: string,
    selections: PricingSelections,
    quantity: number,
    objective: PricingObjective,
  ) {
    // Get base pricing from internal engine
    const basePricing = await this.calculateQuoteItem(
      tenantId,
      process,
      geometryMetrics,
      materialId,
      machineId,
      selections,
      quantity,
      objective,
    );

    // Enhance with ForgeSight market intelligence (if available)
    let marketIntelligence = null;
    let benchmark = null;
    let marketContext = this.buildInternalMarketContext(
      this.forgeSightService.isEnabled() ? 'forgesight_no_market_data' : 'forgesight_not_configured',
    );

    if (this.forgeSightService.isEnabled()) {
      try {
        const marketPricing = await this.forgeSightService.getMarketPricing({
          materialId,
          process,
          quantity,
          volumeCm3: geometryMetrics.volumeCm3,
        });

        if (marketPricing?.market_context) {
          marketContext = marketPricing.market_context;
        }

        if (marketPricing?.market_context.market_verified) {
          marketIntelligence = marketPricing;
          benchmark = await this.forgeSightService.getBenchmark({
            materialId,
            process,
            quantity,
            ourPrice: basePricing.totalPrice,
          });
        }

        // Log market positioning for analytics
        if (benchmark) {
          this.logger.debug(
            `Quote pricing: ${benchmark.ourPosition} (index: ${benchmark.competitiveIndex})`,
          );
        }
      } catch (error) {
        marketContext = this.buildInternalMarketContext('forgesight_unavailable');
        this.logger.warn(
          `ForgeSight market intelligence unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return {
      ...basePricing,
      marketIntelligence: marketIntelligence
        ? {
            marketPrice: marketIntelligence.totalCost,
            confidence: marketIntelligence.confidence,
            benchmarkPosition: marketIntelligence.benchmarkPosition,
            breakdown: marketIntelligence.breakdown,
            market_context: marketContext,
          }
        : null,
      benchmark: benchmark
        ? {
            marketLow: benchmark.marketLow,
            marketAverage: benchmark.marketAverage,
            marketHigh: benchmark.marketHigh,
            ourPosition: benchmark.ourPosition,
            competitiveIndex: benchmark.competitiveIndex,
            recommendation: benchmark.recommendation,
            market_context: benchmark.market_context,
          }
        : null,
      market_context: marketContext,
      pricing_provenance: marketContext,
    };
  }

  /**
   * Get material price trends for procurement planning
   */
  async getMaterialPriceTrends(materialIds: string[]) {
    return this.forgeSightService.getMaterialTrends(materialIds);
  }

  /**
   * Compare vendor prices for a material
   */
  async getVendorComparison(materialId: string, quantity: number) {
    return this.forgeSightService.compareVendors(materialId, quantity);
  }

  @Cacheable({ prefix: 'tenant-pricing-config', ttl: 3600 }) // Cache for 1 hour
  async getTenantPricingConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        settings: true,
        features: true,
      },
    });

    const margins = await this.prisma.margin.findMany({
      where: {
        tenantId,
        active: true,
      },
    });

    const defaultMargin = margins.find((m) => m.type === 'default');

    return {
      defaultMargin: defaultMargin?.marginPercent?.toNumber() || 0.3,
      minimumMargin: defaultMargin?.floorPercent?.toNumber() || 0.15,
      targetMargin: defaultMargin?.targetPercent?.toNumber() || 0.35,
      rushOrderRate: (tenant?.settings as TenantSettings)?.rushOrderRate || 0.25,
      overheadRate: (tenant?.settings as TenantSettings)?.overheadRate || 0.15,
      taxRate: (tenant?.settings as TenantSettings)?.taxRate || 0.16, // IVA in Mexico
      quoteValidityDays: (tenant?.settings as TenantSettings)?.quoteValidityDays || 14,
      volumeDiscountThresholds: (tenant?.settings as TenantSettings)?.volumeDiscountThresholds || {
        50: 0.05,
        100: 0.1,
        500: 0.15,
      },
    };
  }
}
