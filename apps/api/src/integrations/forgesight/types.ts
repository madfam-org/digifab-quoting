/**
 * Forgesight Integration Types
 *
 * These types define the contract between Cotiza and Forgesight's pricing API.
 * Owned by Cotiza - update when Forgesight API changes.
 */

// ============================================================================
// Core Types
// ============================================================================

export type Currency = 'MXN' | 'USD' | 'EUR';

export type MaterialCategory =
  | 'filament'
  | 'resin'
  | 'powder'
  | 'sheet'
  | 'rod'
  | 'composite'
  | 'consumable';

export type ServiceType =
  | 'fdm_printing'
  | 'sla_printing'
  | 'sls_printing'
  | 'metal_printing'
  | 'cnc_milling'
  | 'cnc_turning'
  | 'laser_cutting'
  | 'waterjet_cutting'
  | 'injection_molding'
  | 'sheet_metal';

// ============================================================================
// Material Types
// ============================================================================

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  subcategory?: string;
  brand?: string;
  specifications: MaterialSpecs;
  pricing: PricingData;
  availability: Availability;
  updatedAt: string;
}

export interface MaterialSpecs {
  unit: 'kg' | 'g' | 'L' | 'mL' | 'm' | 'cm' | 'mm' | 'sheet' | 'piece';
  unitSize?: number;
  color?: string;
  diameter?: number;
  thickness?: number;
  density?: number;
}

export interface PricingData {
  basePrice: number;
  currency: Currency;
  pricePerUnit: number;
  unit: string;
  percentile: PricePercentiles;
  confidence: number;
  lastUpdated: string;
}

export interface PricePercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface Availability {
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'discontinued';
  leadTimeDays?: number;
  regions: string[];
}

// ============================================================================
// Service Pricing Types
// ============================================================================

export interface ServicePricing {
  id: string;
  service: ServiceType;
  process: string;
  material?: string;
  region: string;
  pricing: ServicePricingData;
  benchmarks: ServiceBenchmarks;
  updatedAt: string;
}

export interface ServicePricingData {
  setupFee: number;
  perUnitCost: number;
  perHourRate?: number;
  perGramRate?: number;
  perCm3Rate?: number;
  minimumOrder: number;
  currency: Currency;
}

export interface ServiceBenchmarks {
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  percentiles: PricePercentiles;
  sampleSize: number;
  region: string;
}

// ============================================================================
// Quote Integration Types (Primary Cotiza Use Case)
// ============================================================================

export interface QuotePricingParams {
  materialId: string;
  service: ServiceType;
  quantity: number;
  volume?: number;
  weight?: number;
  region?: string;
}

export interface QuotePricingResult {
  materialCost: number;
  serviceCost: number;
  totalCost: number;
  currency: Currency;
  breakdown: {
    materialPerUnit: number;
    setupFee: number;
    processingCost: number;
  };
  confidence: number;
  benchmarkPosition: 'low' | 'average' | 'high';
  sampleCount?: number;
  sample_count?: number;
  updatedAt?: string;
  updated_at?: string;
  marketVerified?: boolean;
  market_verified?: boolean;
  fallbackReason?: string;
  fallback_reason?: string;
  source?: string;
}

export interface BatchQuotePricingParams {
  items: Array<{
    materialId: string;
    service: ServiceType;
    quantity: number;
    volume?: number;
    weight?: number;
  }>;
  region?: string;
}

export interface BatchQuotePricingResult {
  itemIndex: number;
  materialCost: number;
  serviceCost: number;
  totalCost: number;
  currency: Currency;
}

// ============================================================================
// Search & Query Types
// ============================================================================

export interface MaterialSearchOptions {
  query?: string;
  category?: MaterialCategory;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  region?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// Intelligence API (price history, vendor comparison, regional comparison)
//
// These types back Cotiza's `forgesight.service.ts` helpers. The upstream
// endpoints may not be available on every Forgesight deployment; the service
// layer handles missing routes by returning empty/neutral defaults.
// ============================================================================

export interface MaterialPriceHistoryPoint {
  /** ISO 8601 timestamp of the sample. */
  at: string;
  price: number;
  currency: Currency;
}

export interface MaterialPriceHistory {
  materialId: string;
  materialName: string;
  currency: Currency;
  dataPoints: MaterialPriceHistoryPoint[];
}

export interface VendorPriceQuote {
  vendorId: string;
  vendorName: string;
  pricePerUnit: number;
  currency: Currency;
  leadDays: number;
  /** 0–5 quality rating. */
  rating: number;
}

export interface VendorPriceComparison {
  materialId: string;
  currency: Currency;
  averagePrice: number;
  vendors: VendorPriceQuote[];
}

export interface RegionalPricingEntry {
  averagePrice: number;
  currency: Currency;
}

export interface RegionalComparison {
  materialId: string;
  service: ServiceType;
  regions: Record<string, RegionalPricingEntry>;
}
