/**
 * Coforma Client
 *
 * HTTP client for Coforma Studio's Customer Advisory Board API.
 * Self-contained - no external npm dependencies.
 */

import {
  Feedback,
  ProductFeedbackSummary,
  RoadmapItem,
  SubmitFeedbackParams,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

export interface CoformaConfig {
  baseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  productId?: string;
  timeout?: number;
}

// ============================================================================
// Error Handling
// ============================================================================

export class CoformaError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'CoformaError';
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

export class CoformaClient {
  private baseUrl: string;
  private apiKey?: string;
  private tenantId?: string;
  private productId: string;
  private timeout: number;

  constructor(config: CoformaConfig = {}) {
    this.baseUrl = (
      config.baseUrl ||
      process.env.COFORMA_API_URL ||
      'http://coforma-api:8300'
    ).replace(/\/$/, '');
    this.apiKey = config.apiKey || process.env.COFORMA_API_KEY;
    this.tenantId = config.tenantId || process.env.COFORMA_TENANT_ID;
    this.productId = config.productId || process.env.COFORMA_PRODUCT_ID || 'cotiza';
    this.timeout = config.timeout || 10000;
  }

  // -------------------------------------------------------------------------
  // HTTP Layer
  // -------------------------------------------------------------------------

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      ...(this.tenantId && { 'X-Tenant-ID': this.tenantId }),
      'X-Product-ID': this.productId,
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
        throw new CoformaError(
          error.message || `Coforma API error: ${response.status}`,
          response.status,
          error.code,
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof CoformaError) throw error;
      if (error.name === 'AbortError') {
        throw new CoformaError('Coforma request timeout', 408, 'TIMEOUT');
      }
      throw new CoformaError(
        `Coforma connection failed: ${error.message}`,
        503,
        'CONNECTION_ERROR',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -------------------------------------------------------------------------
  // Product Feedback API
  // -------------------------------------------------------------------------

  /**
   * Get feedback summary for this product.
   */
  async getProductFeedbackSummary(): Promise<ProductFeedbackSummary> {
    return this.request<ProductFeedbackSummary>(
      `/api/v1/products/${this.productId}/feedback-summary`,
    );
  }

  /**
   * Submit feedback from within the product.
   */
  async submitProductFeedback(feedback: SubmitFeedbackParams): Promise<Feedback> {
    return this.request<Feedback>(`/api/v1/products/${this.productId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  }

  /**
   * Get public roadmap for this product.
   */
  async getProductRoadmap(options?: {
    status?: RoadmapItem['status'];
    productArea?: string;
    publicOnly?: boolean;
  }): Promise<RoadmapItem[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.productArea) params.append('productArea', options.productArea);
    if (options?.publicOnly) params.append('publicOnly', 'true');

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<RoadmapItem[]>(`/api/v1/products/${this.productId}/roadmap${query}`);
  }

  /**
   * Vote on a feedback item.
   */
  async voteFeedback(feedbackId: string, vote: 1 | -1 | 0): Promise<{ votes: number }> {
    return this.request<{ votes: number }>(`/api/v1/feedback/${feedbackId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    });
  }

  // -------------------------------------------------------------------------
  // Health Check
  // -------------------------------------------------------------------------

  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.request<{ status: string; version: string }>('/health');
  }

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

let defaultClient: CoformaClient | null = null;

export function getCoformaClient(config?: CoformaConfig): CoformaClient {
  if (!defaultClient || config) {
    defaultClient = new CoformaClient(config);
  }
  return defaultClient;
}

export function createCoformaClient(config?: CoformaConfig): CoformaClient {
  return new CoformaClient(config);
}
