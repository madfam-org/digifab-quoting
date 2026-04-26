/** @type {import('jest').Config} */
module.exports = {
  // Use different presets for different environments
  projects: [
    {
      displayName: 'api',
      testMatch: ['<rootDir>/apps/api/**/*.spec.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/apps/api/src/$1',
      },
      setupFilesAfterEnv: ['<rootDir>/apps/api/test/setup.ts'],
      collectCoverageFrom: [
        'apps/api/src/**/*.ts',
        '!apps/api/src/**/*.spec.ts',
        '!apps/api/src/**/*.interface.ts',
        '!apps/api/src/**/*.dto.ts',
        '!apps/api/src/main.ts',
      ],
      coverageThresholds: {
        global: {
          branches: 75,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    {
      displayName: 'web',
      testMatch: ['<rootDir>/apps/web/**/*.test.{ts,tsx}'],
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/apps/web/src/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/apps/web/test/__mocks__/fileMock.js',
      },
      setupFilesAfterEnv: ['<rootDir>/apps/web/test/setup.ts'],
      transform: {
        '^.+\\.(ts|tsx)$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/apps/web/tsconfig.json',
          },
        ],
      },
      collectCoverageFrom: [
        'apps/web/src/**/*.{ts,tsx}',
        '!apps/web/src/**/*.test.{ts,tsx}',
        '!apps/web/src/**/*.stories.tsx',
        '!apps/web/src/**/index.ts',
      ],
      coverageThresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },
    {
      displayName: 'shared',
      testMatch: ['<rootDir>/packages/shared/**/*.spec.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'packages/shared/src/**/*.ts',
        '!packages/shared/src/**/*.spec.ts',
        '!packages/shared/src/**/index.ts',
      ],
    },
    {
      displayName: 'pricing-engine',
      testMatch: ['<rootDir>/packages/pricing-engine/**/*.spec.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'packages/pricing-engine/src/**/*.ts',
        '!packages/pricing-engine/src/**/*.spec.ts',
      ],
      coverageThresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  ],

  // Global settings
  rootDir: '.',
  testTimeout: 30000,
  verbose: true,

  // Coverage settings
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Watch settings
  watchPlugins: ['jest-watch-typeahead/filename', 'jest-watch-typeahead/testname'],

  // Performance
  maxWorkers: '50%',

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/.next/'],

  // Module paths
  modulePaths: ['<rootDir>'],

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Global test setup
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
};
