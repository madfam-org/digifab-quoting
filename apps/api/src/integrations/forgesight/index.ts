/**
 * Forgesight Integration
 *
 * Self-contained integration with Forgesight's pricing intelligence API.
 * No external npm dependencies - Cotiza owns this code completely.
 *
 * @example
 * ```typescript
 * import { getForgesightClient } from '@/integrations/forgesight';
 *
 * const forgesight = getForgesightClient();
 * const pricing = await forgesight.getQuotePricing({
 *   materialId: 'pla-basic-black',
 *   service: 'fdm_printing',
 *   quantity: 10,
 *   weight: 150,
 * });
 * ```
 */

// Client
export {
  ForgesightClient,
  ForgesightConfig,
  ForgesightError,
  getForgesightClient,
  createForgesightClient,
} from './client';

// Types
export type {
  // Core
  Currency,
  MaterialCategory,
  ServiceType,
  // Materials
  Material,
  MaterialSpecs,
  PricingData,
  PricePercentiles,
  Availability,
  // Services
  ServicePricing,
  ServicePricingData,
  ServiceBenchmarks,
  // Quote Integration
  QuotePricingParams,
  QuotePricingResult,
  BatchQuotePricingParams,
  BatchQuotePricingResult,
  // Search
  MaterialSearchOptions,
  PaginatedResponse,
  // Intelligence (history, vendor compare, regional compare)
  MaterialPriceHistory,
  MaterialPriceHistoryPoint,
  VendorPriceComparison,
  VendorPriceQuote,
  RegionalComparison,
  RegionalPricingEntry,
} from './types';
