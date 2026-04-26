// Test setup for API package
// This file is run before all tests

// Mock external dependencies that aren't available in test environment
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
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
