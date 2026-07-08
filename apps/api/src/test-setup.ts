// Test setup for API package
// This file is run before all tests

// Mock external dependencies that aren't available in test environment
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  // withScope invokes its callback with a scope stub so the SentryService's
  // scope.setTag / scope.setLevel calls don't blow up under the mock.
  withScope: jest.fn((callback: (scope: unknown) => void) =>
    callback({ setTag: jest.fn(), setLevel: jest.fn(), setContext: jest.fn() }),
  ),
  flush: jest.fn().mockResolvedValue(true),
  httpIntegration: jest.fn(),
  expressIntegration: jest.fn(),
  postgresIntegration: jest.fn(),
  redisIntegration: jest.fn(),
}));

jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: jest.fn(),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-secret';
process.env.NEXTAUTH_SECRET = 'test-secret';

// Increase test timeout for integration tests
jest.setTimeout(30000);
