import {
  GuestQuote,
  CreateGuestQuote,
  UpdateGuestQuoteItem,
  RegisterWithQuote,
  ConvertGuestQuote,
} from '@cotiza/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class GuestApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  async uploadFiles(files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await fetch(`${API_BASE_URL}/api/v1/guest/quotes/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('File upload failed');
    }

    return response.json();
  }

  async createQuote(data: CreateGuestQuote): Promise<GuestQuote> {
    return this.request('/api/v1/guest/quotes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getQuote(quoteId: string): Promise<GuestQuote> {
    return this.request(`/api/v1/guest/quotes/${quoteId}`);
  }

  async listQuotes(): Promise<GuestQuote[]> {
    return this.request('/api/v1/guest/quotes');
  }

  async updateQuoteItem(
    quoteId: string,
    itemIndex: number,
    data: UpdateGuestQuoteItem,
  ): Promise<GuestQuote> {
    return this.request(`/api/v1/guest/quotes/${quoteId}/items/${itemIndex}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getSessionMetrics() {
    return this.request('/api/v1/guest/quotes/session/metrics');
  }

  async registerWithQuote(data: RegisterWithQuote) {
    return this.request('/api/v1/auth/register-with-quote', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async convertQuote(data: ConvertGuestQuote) {
    return this.request('/api/v1/auth/convert-guest-quote', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const guestApi = new GuestApiClient();
