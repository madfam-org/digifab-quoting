/**
 * Forgesight Client
 *
 * HTTP client for Forgesight's pricing intelligence API.
 * Self-contained - no external npm dependencies.
 */

import {
  Material,
  MaterialCategory,
  MaterialSearchOptions,
  MaterialPriceHistory,
  PaginatedResponse,
  QuotePricingParams,
  QuotePricingResult,
  BatchQuotePricingParams,
  BatchQuotePricingResult,
  RegionalComparison,
  ServicePricing,
  ServiceType,
  VendorPriceComparison,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

export interface ForgesightConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

// ============================================================================
// Error Handling
// ============================================================================

export class ForgesightError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ForgesightError';
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

export class ForgesightClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: ForgesightConfig = {}) {
    this.baseUrl = (config.baseUrl || process.env.FORGESIGHT_API_URL || 'http://forgesight-api:8100').replace(/\/$/, '');
    this.apiKey = config.apiKey || process.env.FORGESIGHT_API_KEY;
    this.timeout = config.timeout || 30000;
  }

  // -------------------------------------------------------------------------
  // HTTP Layer
  // -------------------------------------------------------------------------

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'X-API-Key': this.apiKey }),
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new ForgesightError(
          error.message || `Forgesight API error: ${response.status}`,
          response.status,
          error.code,
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof ForgesightError) throw error;
      if (error.name === 'AbortError') {
        throw new ForgesightError('Forgesight request timeout', 408, 'TIMEOUT');
      }
      throw new ForgesightError(
        `Forgesight connection failed: ${error.message}`,
        503,
        'CONNECTION_ERROR',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -------------------------------------------------------------------------
  // Quote Pricing API (Primary Use Case for Cotiza)
  // -------------------------------------------------------------------------

  /**
   * Get real-time pricing for a quote calculation.
   * This is the main integration point with Cotiza.
   */
  async getQuotePricing(params: QuotePricingParams): Promise<QuotePricingResult> {
    return this.request<QuotePricingResult>('/api/v1/quote/pricing', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Batch pricing for multiple items in a single quote.
   */
  async getBatchQuotePricing(params: BatchQuotePricingParams): Promise<BatchQuotePricingResult[]> {
    return this.request<BatchQuotePricingResult[]>('/api/v1/quote/pricing/batch', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // -------------------------------------------------------------------------
  // Materials API
  // -------------------------------------------------------------------------

  /**
   * Search materials with filtering.
   */
  async searchMaterials(options?: MaterialSearchOptions): Promise<PaginatedResponse<Material>> {
    const params = new URLSearchParams();
    if (options) {
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
    }
    const query = params.toString();
    return this.request<PaginatedResponse<Material>>(
      `/api/v1/materials${query ? `?${query}` : ''}`,
    );
  }

  /**
   * Get material by ID with full pricing data.
   */
  async getMaterial(id: string): Promise<Material> {
    return this.request<Material>(`/api/v1/materials/${id}`);
  }

  /**
   * Get materials by category.
   */
  async getMaterialsByCategory(
    category: MaterialCategory,
    options?: { limit?: number; region?: string },
  ): Promise<Material[]> {
    const response = await this.searchMaterials({ category, ...options });
    return response.data;
  }

  // -------------------------------------------------------------------------
  // Service Pricing API
  // -------------------------------------------------------------------------

  /**
   * Get service pricing benchmarks.
   */
  async getServicePricing(
    service: ServiceType,
    options?: { material?: string; region?: string },
  ): Promise<ServicePricing> {
    const params = new URLSearchParams();
    params.set('service', service);
    if (options?.material) params.set('material', options.material);
    if (options?.region) params.set('region', options.region);
    return this.request<ServicePricing>(`/api/v1/services/pricing?${params.toString()}`);
  }

  // -------------------------------------------------------------------------
  // Intelligence API (history, vendor compare, regional compare)
  //
  // These endpoints back the `getMaterialTrends` / `compareVendors` /
  // `getRegionalPricing` helpers in `modules/pricing/forgesight.service.ts`.
  // The upstream routes exist only when Forgesight ships its intelligence
  // tier; callers already handle 404/network errors by falling back to
  // neutral defaults (empty arrays / nulls), so the signatures are typed
  // narrowly and the client just forwards the request.
  // -------------------------------------------------------------------------

  async getMaterialPriceHistory(
    materialId: string,
    options?: { days?: number; granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly' },
  ): Promise<MaterialPriceHistory> {
    const params = new URLSearchParams();
    if (options?.days !== undefined) params.set('days', String(options.days));
    if (options?.granularity) params.set('granularity', options.granularity);
    const query = params.toString();
    return this.request<MaterialPriceHistory>(
      `/api/v1/materials/${encodeURIComponent(materialId)}/price-history${query ? `?${query}` : ''}`,
    );
  }

  async compareVendorPrices(
    materialId: string,
    options?: { quantity?: number; includeShipping?: boolean; region?: string },
  ): Promise<VendorPriceComparison> {
    const params = new URLSearchParams();
    if (options?.quantity !== undefined) params.set('quantity', String(options.quantity));
    if (options?.includeShipping !== undefined)
      params.set('includeShipping', String(options.includeShipping));
    if (options?.region) params.set('region', options.region);
    const query = params.toString();
    return this.request<VendorPriceComparison>(
      `/api/v1/materials/${encodeURIComponent(materialId)}/vendor-comparison${query ? `?${query}` : ''}`,
    );
  }

  async getRegionalComparison(params: {
    materialId: string;
    service: ServiceType;
    regions: string[];
  }): Promise<RegionalComparison> {
    return this.request<RegionalComparison>('/api/v1/pricing/regional-comparison', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // -------------------------------------------------------------------------
  // Health Check
  // -------------------------------------------------------------------------

  /**
   * Check if Forgesight API is available.
   */
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.request<{ status: string; version: string }>('/health');
  }

  /**
   * Check connectivity (returns true if healthy, false otherwise).
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let defaultClient: ForgesightClient | null = null;

/**
 * Get or create the default Forgesight client.
 */
export function getForgesightClient(config?: ForgesightConfig): ForgesightClient {
  if (!defaultClient || config) {
    defaultClient = new ForgesightClient(config);
  }
  return defaultClient;
}

/**
 * Create a new Forgesight client instance.
 */
export function createForgesightClient(config?: ForgesightConfig): ForgesightClient {
  return new ForgesightClient(config);
}
