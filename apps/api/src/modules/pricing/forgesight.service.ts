import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ForgesightClient,
  ServiceType,
  Currency,
} from '../../integrations/forgesight';
import { Cacheable } from '../redis/decorators/cache.decorator';
import { ProcessType } from '@cotiza/shared';

/**
 * ForgeSight Integration Service
 *
 * Provides market pricing intelligence from ForgeSight to enhance quote accuracy
 * and competitive positioning. This service acts as a bridge between the internal
 * pricing engine and external market data from ForgeSight.
 *
 * Key capabilities:
 * - Market price benchmarking for materials and services
 * - Vendor price comparison
 * - Regional pricing intelligence
 * - Price trend analysis
 */

interface MarketPricingContext {
  materialCost: number;
  serviceCost: number;
  totalCost: number;
  currency: Currency;
  confidence: number;
  benchmarkPosition: 'low' | 'average' | 'high';
  breakdown: {
    materialPerUnit: number;
    setupFee: number;
    processingCost: number;
  };
}

interface PriceBenchmark {
  marketLow: number;
  marketAverage: number;
  marketHigh: number;
  ourPosition: 'below_market' | 'at_market' | 'above_market';
  competitiveIndex: number; // 0-100, higher = more competitive
  recommendation: 'price_increase' | 'maintain' | 'price_decrease';
}

// Exported so consumers that embed `getMaterialTrends()` results in their own
// public return signatures (e.g. PricingService.getIntelligencePack) don't
// trigger TS4053 ("return type uses name ... but cannot be named").
export interface MaterialPriceTrend {
  materialId: string;
  materialName: string;
  currentPrice: number;
  priceChange30d: number;
  priceChange90d: number;
  trend: 'rising' | 'stable' | 'falling';
  volatility: 'low' | 'medium' | 'high';
}

@Injectable()
export class ForgeSightService implements OnModuleInit {
  private readonly logger = new Logger(ForgeSightService.name);
  private client: ForgesightClient | null = null;
  private enabled = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiUrl = this.configService.get<string>('FORGESIGHT_API_URL');
    const apiKey = this.configService.get<string>('FORGESIGHT_API_KEY');

    if (apiUrl && apiKey) {
      this.client = new ForgesightClient({
        baseUrl: apiUrl,
        apiKey,
        timeout: 5000, // 5s timeout for pricing calls
      });
      this.enabled = true;
      this.logger.log('ForgeSight pricing intelligence enabled');
    } else {
      this.logger.warn('ForgeSight not configured - using internal pricing only');
    }
  }

  /**
   * Check if ForgeSight integration is available
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Map internal process types to ForgeSight service types
   */
  private mapProcessToService(process: ProcessType): ServiceType {
    // ForgeSight's ServiceType union is coarser than our internal ProcessType:
    // MJF/DMLS roll up to 'metal_printing', and 5-axis falls back to 'cnc_milling'
    // until the upstream catalog adds finer granularity.
    const mapping: Record<string, ServiceType> = {
      FDM: 'fdm_printing',
      SLA: 'sla_printing',
      SLS: 'sls_printing',
      MJF: 'metal_printing',
      DMLS: 'metal_printing',
      CNC_MILLING: 'cnc_milling',
      CNC_TURNING: 'cnc_turning',
      CNC_5AXIS: 'cnc_milling',
      LASER_CUTTING: 'laser_cutting',
      SHEET_METAL: 'sheet_metal',
      INJECTION_MOLDING: 'injection_molding',
    };
    return mapping[process] || 'fdm_printing';
  }

  /**
   * Get market pricing context for a quote item
   *
   * This fetches real-time market data from ForgeSight to provide
   * context for pricing decisions.
   */
  @Cacheable({ prefix: 'forgesight:quote-pricing', ttl: 300 }) // Cache 5 min
  async getMarketPricing(params: {
    materialId: string;
    process: ProcessType;
    quantity: number;
    volumeCm3?: number;
    weightG?: number;
    region?: string;
  }): Promise<MarketPricingContext | null> {
    if (!this.isEnabled() || !this.client) {
      return null;
    }

    try {
      const result = await this.client.getQuotePricing({
        materialId: params.materialId,
        service: this.mapProcessToService(params.process),
        quantity: params.quantity,
        volume: params.volumeCm3,
        weight: params.weightG,
        region: params.region || 'MX', // Default to Mexico
      });

      return result;
    } catch (error) {
      this.logger.warn(
        `ForgeSight pricing fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Get price benchmark comparison
   *
   * Compares our calculated price against market data to determine
   * competitive positioning.
   */
  async getBenchmark(params: {
    materialId: string;
    process: ProcessType;
    quantity: number;
    ourPrice: number;
    region?: string;
  }): Promise<PriceBenchmark | null> {
    const marketPricing = await this.getMarketPricing({
      materialId: params.materialId,
      process: params.process,
      quantity: params.quantity,
      region: params.region,
    });

    if (!marketPricing) {
      return null;
    }

    // Calculate benchmark metrics
    const marketAverage = marketPricing.totalCost;
    const marketLow = marketAverage * 0.8; // Estimate low as 20% below average
    const marketHigh = marketAverage * 1.3; // Estimate high as 30% above average

    // Determine position
    let ourPosition: PriceBenchmark['ourPosition'];
    if (params.ourPrice < marketAverage * 0.95) {
      ourPosition = 'below_market';
    } else if (params.ourPrice > marketAverage * 1.05) {
      ourPosition = 'above_market';
    } else {
      ourPosition = 'at_market';
    }

    // Calculate competitive index (100 = most competitive)
    const competitiveIndex = Math.max(
      0,
      Math.min(100, 100 - ((params.ourPrice - marketLow) / (marketHigh - marketLow)) * 100),
    );

    // Generate recommendation
    let recommendation: PriceBenchmark['recommendation'];
    if (competitiveIndex > 70 && marketPricing.confidence > 0.7) {
      recommendation = 'price_increase'; // We have room to increase
    } else if (competitiveIndex < 30) {
      recommendation = 'price_decrease'; // We're not competitive
    } else {
      recommendation = 'maintain';
    }

    return {
      marketLow,
      marketAverage,
      marketHigh,
      ourPosition,
      competitiveIndex: Math.round(competitiveIndex),
      recommendation,
    };
  }

  /**
   * Get material price trends for strategic planning
   */
  @Cacheable({ prefix: 'forgesight:material-trends', ttl: 3600 }) // Cache 1 hour
  async getMaterialTrends(materialIds: string[]): Promise<MaterialPriceTrend[]> {
    if (!this.isEnabled() || !this.client) {
      return [];
    }

    try {
      const trends: MaterialPriceTrend[] = [];

      for (const materialId of materialIds) {
        const history = await this.client.getMaterialPriceHistory(materialId, {
          days: 90,
          granularity: 'daily',
        });

        if (history.dataPoints.length > 0) {
          const currentPrice = history.dataPoints[history.dataPoints.length - 1].price;
          const price30dAgo =
            history.dataPoints[Math.max(0, history.dataPoints.length - 30)]?.price || currentPrice;
          const price90dAgo = history.dataPoints[0]?.price || currentPrice;

          const priceChange30d = ((currentPrice - price30dAgo) / price30dAgo) * 100;
          const priceChange90d = ((currentPrice - price90dAgo) / price90dAgo) * 100;

          // Determine trend
          let trend: MaterialPriceTrend['trend'];
          if (priceChange30d > 5) {
            trend = 'rising';
          } else if (priceChange30d < -5) {
            trend = 'falling';
          } else {
            trend = 'stable';
          }

          // Calculate volatility from standard deviation
          const prices = history.dataPoints.map((dp) => dp.price);
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
          const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
          const stdDev = Math.sqrt(variance);
          const coefficientOfVariation = (stdDev / avg) * 100;

          let volatility: MaterialPriceTrend['volatility'];
          if (coefficientOfVariation > 15) {
            volatility = 'high';
          } else if (coefficientOfVariation > 5) {
            volatility = 'medium';
          } else {
            volatility = 'low';
          }

          trends.push({
            materialId,
            materialName: history.materialName,
            currentPrice,
            priceChange30d: Math.round(priceChange30d * 100) / 100,
            priceChange90d: Math.round(priceChange90d * 100) / 100,
            trend,
            volatility,
          });
        }
      }

      return trends;
    } catch (error) {
      this.logger.warn(
        `ForgeSight trend fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return [];
    }
  }

  /**
   * Compare vendor prices for a material
   */
  @Cacheable({ prefix: 'forgesight:vendor-comparison', ttl: 1800 }) // Cache 30 min
  async compareVendors(
    materialId: string,
    quantity: number,
  ): Promise<{
    vendors: Array<{
      vendorId: string;
      vendorName: string;
      pricePerUnit: number;
      leadDays: number;
      rating: number;
    }>;
    recommendedVendor: string | null;
  } | null> {
    if (!this.isEnabled() || !this.client) {
      return null;
    }

    try {
      const comparison = await this.client.compareVendorPrices(materialId, {
        quantity,
        includeShipping: true,
      });

      // Find best value (balance of price and rating)
      let recommendedVendor: string | null = null;
      let bestScore = -Infinity;

      const vendors = comparison.vendors.map((v) => {
        // Score = rating * 20 - normalized price (lower price = higher score)
        const priceScore = 100 - (v.pricePerUnit / comparison.averagePrice) * 50;
        const score = v.rating * 20 + priceScore;

        if (score > bestScore) {
          bestScore = score;
          recommendedVendor = v.vendorId;
        }

        return {
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          pricePerUnit: v.pricePerUnit,
          leadDays: v.leadDays,
          rating: v.rating,
        };
      });

      return {
        vendors,
        recommendedVendor,
      };
    } catch (error) {
      this.logger.warn(
        `ForgeSight vendor comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Get regional pricing comparison for multi-region quotes
   */
  @Cacheable({ prefix: 'forgesight:regional-pricing', ttl: 3600 }) // Cache 1 hour
  async getRegionalPricing(params: {
    materialId: string;
    service: ProcessType;
    regions: string[];
  }): Promise<Record<string, { avgPrice: number; currency: Currency }> | null> {
    if (!this.isEnabled() || !this.client) {
      return null;
    }

    try {
      const comparison = await this.client.getRegionalComparison({
        materialId: params.materialId,
        service: this.mapProcessToService(params.service),
        regions: params.regions,
      });

      const result: Record<string, { avgPrice: number; currency: Currency }> = {};
      for (const [region, data] of Object.entries(comparison.regions)) {
        result[region] = {
          avgPrice: data.averagePrice,
          currency: data.currency,
        };
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `ForgeSight regional comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }
}
