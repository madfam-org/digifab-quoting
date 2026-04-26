/**
 * Common test utilities and helpers for all test suites
 */

import { faker } from '@faker-js/faker';
import { Technology, Material, QuoteStatus, FileStatus, FileType } from '@prisma/client';

// Mock data generators
export const mockData = {
  user: () => ({
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    password: faker.internet.password({ length: 12 }),
    role: faker.helpers.arrayElement(['customer', 'operator', 'manager', 'admin']),
    tenantId: faker.string.uuid(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  }),

  quote: () => ({
    id: faker.string.uuid(),
    projectName: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    customerId: faker.string.uuid(),
    status: faker.helpers.arrayElement(Object.values(QuoteStatus)),
    subtotal: faker.number.float({ min: 100, max: 10000, multipleOf: 0.01 }),
    tax: faker.number.float({ min: 10, max: 1000, multipleOf: 0.01 }),
    discount: faker.number.float({ min: 0, max: 500, multipleOf: 0.01 }),
    shipping: faker.number.float({ min: 10, max: 100, multipleOf: 0.01 }),
    totalPrice: faker.number.float({ min: 100, max: 15000, multipleOf: 0.01 }),
    currency: faker.helpers.arrayElement(['USD', 'EUR', 'MXN', 'GBP']),
    exchangeRate: faker.number.float({ min: 0.5, max: 20, multipleOf: 0.0001 }),
    validUntil: faker.date.future(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    tenantId: faker.string.uuid(),
  }),

  quoteItem: () => ({
    id: faker.string.uuid(),
    quoteId: faker.string.uuid(),
    fileId: faker.string.uuid(),
    fileName: faker.system.fileName({ extensionCount: 1 }),
    technology: faker.helpers.arrayElement(Object.values(Technology)),
    material: faker.helpers.arrayElement(Object.values(Material)),
    quantity: faker.number.int({ min: 1, max: 1000 }),
    unitPrice: faker.number.float({ min: 10, max: 500, multipleOf: 0.01 }),
    totalPrice: faker.number.float({ min: 10, max: 5000, multipleOf: 0.01 }),
    leadTime: faker.number.int({ min: 1, max: 30 }),
    finishType: faker.helpers.arrayElement(['RAW', 'POLISHED', 'ANODIZED', 'PAINTED']),
    notes: faker.lorem.sentence(),
  }),

  file: () => ({
    id: faker.string.uuid(),
    fileName: faker.system.fileName({ extensionCount: 1 }),
    fileType: faker.helpers.arrayElement(Object.values(FileType)),
    fileSize: faker.number.int({ min: 1024, max: 104857600 }),
    mimeType: faker.helpers.arrayElement(['model/stl', 'model/step', 'image/svg+xml']),
    s3Key: `uploads/${faker.string.uuid()}/${faker.system.fileName()}`,
    userId: faker.string.uuid(),
    status: faker.helpers.arrayElement(Object.values(FileStatus)),
    metadata: {
      originalName: faker.system.fileName(),
      extension: faker.helpers.arrayElement(['stl', 'step', 'iges', 'dxf']),
    },
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  }),

  address: () => ({
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    postalCode: faker.location.zipCode(),
    country: faker.location.country(),
  }),

  payment: () => ({
    id: faker.string.uuid(),
    amount: faker.number.float({ min: 100, max: 10000, multipleOf: 0.01 }),
    currency: faker.helpers.arrayElement(['USD', 'EUR', 'MXN']),
    status: faker.helpers.arrayElement(['pending', 'processing', 'completed', 'failed']),
    method: faker.helpers.arrayElement(['card', 'bank_transfer', 'paypal']),
    stripePaymentId: `pi_${faker.string.alphanumeric(24)}`,
    createdAt: faker.date.past(),
  }),
};

// Test database helpers
export const testDb = {
  async clearAll(prisma: any) {
    const tables = ['quoteItem', 'quote', 'file', 'payment', 'order', 'user', 'tenant'];

    for (const table of tables) {
      await prisma[table].deleteMany();
    }
  },

  async seed(prisma: any) {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        id: 'test-tenant',
        name: 'Test Tenant',
        slug: 'test',
        settings: {},
      },
    });

    // Create test users
    const admin = await prisma.user.create({
      data: {
        ...mockData.user(),
        email: 'admin@test.com',
        role: 'admin',
        tenantId: tenant.id,
      },
    });

    const customer = await prisma.user.create({
      data: {
        ...mockData.user(),
        email: 'customer@test.com',
        role: 'customer',
        tenantId: tenant.id,
      },
    });

    return { tenant, admin, customer };
  },
};

// API request helpers
export const apiHelpers = {
  getAuthHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  },

  getTenantHeaders(tenantId: string) {
    return {
      'X-Tenant-ID': tenantId,
    };
  },

  async loginAs(email: string, password: string, baseUrl: string) {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    return data.accessToken;
  },
};

// React testing helpers
export const reactHelpers = {
  mockRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    };
  },

  mockSession(user?: any) {
    return {
      user: user || mockData.user(),
      expires: faker.date.future().toISOString(),
    };
  },

  createMockContext() {
    return {
      req: {
        headers: {},
        cookies: {},
      },
      res: {
        setHeader: jest.fn(),
        getHeader: jest.fn(),
        removeHeader: jest.fn(),
      },
    };
  },
};

// Async test helpers
export const asyncHelpers = {
  async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Condition not met within timeout');
  },

  async retryAsync<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('All retries failed');
  },
};

// File upload test helpers
export const fileHelpers = {
  createMockFile(name = 'test.stl', size = 1024, type = 'model/stl') {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
  },

  createMockSTL() {
    const stlContent = `
      solid TestPart
        facet normal 0 0 1
          outer loop
            vertex 0 0 0
            vertex 1 0 0
            vertex 1 1 0
          endloop
        endfacet
      endsolid TestPart
    `;
    return new File([stlContent], 'test.stl', { type: 'model/stl' });
  },

  async mockFileUpload(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    return {
      fileId: faker.string.uuid(),
      fileName: file.name,
      fileSize: file.size,
      uploadUrl: `https://s3.amazonaws.com/test-bucket/${faker.string.uuid()}`,
    };
  },
};

// Performance test helpers
export const perfHelpers = {
  measureTime(fn: () => void | Promise<void>) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();

    return {
      result,
      duration: end - start,
    };
  },

  async measureAsyncTime<T>(fn: () => Promise<T>) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();

    return {
      result,
      duration: end - start,
    };
  },

  generateLoadTestData(count: number) {
    return Array.from({ length: count }, () => ({
      quote: mockData.quote(),
      items: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
        mockData.quoteItem(),
      ),
    }));
  },
};

// Assertion helpers
export const assertHelpers = {
  assertDateClose(actual: Date, expected: Date, toleranceMs = 1000) {
    const diff = Math.abs(actual.getTime() - expected.getTime());
    expect(diff).toBeLessThanOrEqual(toleranceMs);
  },

  assertPriceCalculation(unitPrice: number, quantity: number, total: number, tolerance = 0.01) {
    const expected = unitPrice * quantity;
    expect(Math.abs(total - expected)).toBeLessThanOrEqual(tolerance);
  },

  assertValidEmail(email: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(email).toMatch(emailRegex);
  },

  assertValidUUID(uuid: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  },

  assertApiResponse(response: any, expectedStatus: number) {
    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('content-type')).toContain('application/json');
  },
};

// Cleanup helpers
export const cleanupHelpers = {
  clearAllMocks() {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  },

  clearLocalStorage() {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  },

  clearSessionStorage() {
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear();
    }
  },

  clearAllStorage() {
    this.clearLocalStorage();
    this.clearSessionStorage();
  },

  async cleanupTestFiles(s3Client: any, bucket: string, prefix: string) {
    const objects = await s3Client
      .listObjectsV2({
        Bucket: bucket,
        Prefix: prefix,
      })
      .promise();

    if (objects.Contents && objects.Contents.length > 0) {
      await s3Client
        .deleteObjects({
          Bucket: bucket,
          Delete: {
            Objects: objects.Contents.map((obj: any) => ({ Key: obj.Key })),
          },
        })
        .promise();
    }
  },
};

// Export all helpers
export default {
  mockData,
  testDb,
  apiHelpers,
  reactHelpers,
  asyncHelpers,
  fileHelpers,
  perfHelpers,
  assertHelpers,
  cleanupHelpers,
};
