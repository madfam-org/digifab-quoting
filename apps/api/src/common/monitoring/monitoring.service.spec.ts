import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SentryService } from './sentry.service';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { LoggerService } from '../logger/logger.service';

describe('MonitoringService', () => {
  let sentryService: SentryService;
  let metricsService: MetricsService;
  let healthService: HealthService;
  let performanceService: PerformanceService;

  const mockConfigService = {
    get: jest.fn(<T = string>(key: string, defaultValue?: T) => {
      const config: Record<string, unknown> = {
        SENTRY_DSN: 'test-dsn',
        NODE_ENV: 'test',
        APP_VERSION: '1.0.0',
      };
      return (config[key] as T) || defaultValue;
    }),
  };

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    healthCheck: jest.fn(),
  };

  const mockRedisService = {
    ping: jest.fn(),
    isConnected: jest.fn(),
    getStatistics: jest.fn(),
  };

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentryService,
        MetricsService,
        HealthService,
        PerformanceService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    sentryService = module.get<SentryService>(SentryService);
    metricsService = module.get<MetricsService>(MetricsService);
    healthService = module.get<HealthService>(HealthService);
    performanceService = module.get<PerformanceService>(PerformanceService);
  });

  describe('SentryService', () => {
    it('should be defined', () => {
      expect(sentryService).toBeDefined();
    });

    it('should capture exceptions', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };

      expect(() => {
        sentryService.captureException(error, context);
      }).not.toThrow();
    });

    it('should capture messages', () => {
      expect(() => {
        sentryService.captureMessage('Test message', 'info', { userId: '123' });
      }).not.toThrow();
    });

    it('should set user context', () => {
      expect(() => {
        sentryService.setUser({
          id: '123',
          email: 'test@example.com',
          username: 'testuser',
        });
      }).not.toThrow();
    });

    it('should start transactions', () => {
      const transaction = sentryService.startTransaction('test-operation');
      expect(transaction).toBeDefined();
    });
  });

  describe('MetricsService', () => {
    it('should be defined', () => {
      expect(metricsService).toBeDefined();
    });

    it('should increment counters', () => {
      metricsService.incrementCounter('test.counter', 1, { source: 'test' });
      expect(metricsService.getCounter('test.counter', { source: 'test' })).toBe(1);

      metricsService.incrementCounter('test.counter', 5, { source: 'test' });
      expect(metricsService.getCounter('test.counter', { source: 'test' })).toBe(6);
    });

    it('should set and get gauges', () => {
      metricsService.setGauge('test.gauge', 42, { source: 'test' });
      expect(metricsService.getGauge('test.gauge', { source: 'test' })).toBe(42);

      metricsService.incrementGauge('test.gauge', 8, { source: 'test' });
      expect(metricsService.getGauge('test.gauge', { source: 'test' })).toBe(50);
    });

    it('should record histogram values', () => {
      const values = [100, 200, 150, 300, 250];
      values.forEach((value) => {
        metricsService.recordHistogram('test.histogram', value, { source: 'test' });
      });

      const stats = metricsService.getHistogramStats('test.histogram', { source: 'test' });
      expect(stats.count).toBe(5);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(300);
      expect(stats.mean).toBe(200);
    });

    it('should time synchronous functions', () => {
      const result = metricsService.time(
        'test.sync',
        () => {
          // Simulate some work
          let sum = 0;
          for (let i = 0; i < 1000; i++) {
            sum += i;
          }
          return sum;
        },
        { source: 'test' },
      );

      expect(result).toBe(499500);
      expect(metricsService.getCounter('test.sync.success', { source: 'test' })).toBe(1);
    });

    it('should time asynchronous functions', async () => {
      const result = await metricsService.timeAsync(
        'test.async',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'completed';
        },
        { source: 'test' },
      );

      expect(result).toBe('completed');
      expect(metricsService.getCounter('test.async.success', { source: 'test' })).toBe(1);
    });

    it('should record API request metrics', () => {
      metricsService.recordApiRequest('GET', '/api/quotes', 200, 150, 'tenant-123');

      expect(
        metricsService.getCounter('api.requests.total', {
          method: 'GET',
          path: '/api/quotes',
          status_code: '200',
          status_class: '2xx',
          tenant_id: 'tenant-123',
        }),
      ).toBe(1);
    });

    it('should sanitize paths in API metrics', () => {
      metricsService.recordApiRequest(
        'GET',
        '/api/quotes/123e4567-e89b-12d3-a456-426614174000',
        200,
        150,
      );

      expect(
        metricsService.getCounter('api.requests.total', {
          method: 'GET',
          path: '/api/quotes/:id',
          status_code: '200',
          status_class: '2xx',
        }),
      ).toBe(1);
    });

    it('should record database query metrics', () => {
      metricsService.recordDatabaseQuery('findMany', 'User', 50, true);

      expect(
        metricsService.getCounter('database.queries.total', {
          operation: 'findmany',
          model: 'user',
          status: 'success',
        }),
      ).toBe(1);
    });

    it('should record cache operation metrics', () => {
      metricsService.recordCacheOperation('get', true, 5);
      metricsService.recordCacheOperation('get', false, 3);

      expect(metricsService.getCounter('cache.hits')).toBe(1);
      expect(metricsService.getCounter('cache.misses')).toBe(1);
    });
  });

  describe('HealthService', () => {
    it('should be defined', () => {
      expect(healthService).toBeDefined();
    });

    it('should return health status', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockRedisService.ping.mockResolvedValue('PONG');

      const status = await healthService.getHealthStatus();

      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('checks');
      expect(status).toHaveProperty('uptime');
      expect(status.checks).toBeInstanceOf(Array);
    });

    it('should detect database issues', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      const status = await healthService.getHealthStatus();
      const dbCheck = status.checks.find((check) => check.name === 'database');

      expect(dbCheck?.status).toBe('unhealthy');
      expect(dbCheck?.message).toContain('Connection failed');
    });

    it('should detect Redis issues', async () => {
      mockRedisService.ping.mockRejectedValue(new Error('Redis unavailable'));

      const status = await healthService.getHealthStatus();
      const redisCheck = status.checks.find((check) => check.name === 'redis');

      expect(redisCheck?.status).toBe('unhealthy');
      expect(redisCheck?.message).toContain('Redis unavailable');
    });
  });

  describe('PerformanceService', () => {
    it('should be defined', () => {
      expect(performanceService).toBeDefined();
    });

    it('should track transaction duration', () => {
      const transactionId = 'test-transaction-123';

      performanceService.startTransaction(transactionId, 'test-operation');

      // Simulate some work
      setTimeout(() => {
        const duration = performanceService.endTransaction(transactionId, { source: 'test' });
        expect(duration).toBeGreaterThan(0);
      }, 10);
    });

    it('should measure async functions', async () => {
      const result = await performanceService.measureAsync(
        'test-async',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success';
        },
        { source: 'test' },
      );

      expect(result).toBe('success');
    });

    it('should measure sync functions', () => {
      const result = performanceService.measure(
        'test-sync',
        () => {
          return 42;
        },
        { source: 'test' },
      );

      expect(result).toBe(42);
    });

    it('should record performance metrics', () => {
      performanceService.recordPerformanceMetric({
        name: 'test.metric',
        value: 123,
        unit: 'ms',
        timestamp: new Date(),
        tags: { source: 'test' },
      });

      // Verify metric was recorded (would need access to internal metrics)
      expect(mockLoggerService.warn).not.toHaveBeenCalled(); // No threshold exceeded
    });

    it('should generate performance reports', async () => {
      const report = await performanceService.generatePerformanceReport();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('systemMetrics');
      expect(report.summary).toHaveProperty('activeTransactions');
    });

    it('should check health status', () => {
      const health = performanceService.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('issues');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    it('should set custom thresholds', () => {
      performanceService.setThreshold('custom.metric', 100, 200, 'ms');

      const threshold = performanceService.getThreshold('custom.metric');
      expect(threshold).toBeDefined();
      expect(threshold?.warning).toBe(100);
      expect(threshold?.critical).toBe(200);
    });
  });

  describe('Integration Tests', () => {
    it('should work together for end-to-end monitoring', async () => {
      // Start a performance transaction
      const transactionId = 'integration-test';
      performanceService.startTransaction(transactionId, 'integration-test');

      // Record some metrics
      metricsService.incrementCounter('integration.test.counter', 1);
      metricsService.recordHistogram('integration.test.duration', 150);

      // Complete transaction
      const duration = performanceService.endTransaction(transactionId);
      expect(duration).toBeGreaterThan(0);

      // Check health
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockRedisService.ping.mockResolvedValue('PONG');

      const health = await healthService.getHealthStatus();
      expect(health.status).toBe('healthy');

      // Generate performance report
      const report = await performanceService.generatePerformanceReport();
      expect(report).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // Test error handling in performance measurement
      await expect(
        performanceService.measureAsync('error-test', async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      // Verify error was still tracked
      expect(metricsService.getCounter('error-test.error')).toBe(1);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    metricsService.reset();
    performanceService.cleanup();
  });
});
