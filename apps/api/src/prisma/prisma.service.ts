import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

// Extended interface for middleware params with tenant context
interface PrismaMiddlewareParams extends Prisma.MiddlewareParams {
  __tenantId?: string;
}

// Interface for connection statistics query result
interface ConnectionStats {
  total_connections: bigint;
  active_connections: bigint;
  idle_connections: bigint;
  waiting_connections: bigint;
  longest_query_seconds: number | null;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor(private configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    super({
      datasources: {
        db: { url: databaseUrl },
      },
      log: isProduction ? ['error', 'warn'] : ['error', 'warn', 'info', 'query'],
      errorFormat: isProduction ? 'minimal' : 'pretty',
    });

    // Connection pool configuration via URL parameters
    this.updateDatabaseUrl();

    // Enable query logging in development
    if (!isProduction) {
      this.$use(this.loggingMiddleware);
    }

    // Add retry middleware
    this.$use(this.retryMiddleware);

    // Add performance monitoring middleware
    this.$use(this.performanceMiddleware);

    // Add tenant isolation middleware
    this.$use(this.tenantIsolationMiddleware);
  }

  private updateDatabaseUrl() {
    const baseUrl = this.configService.get<string>('DATABASE_URL', '');
    const poolConfig = {
      // Default 10, not 50: the production database is a SHARED instance with
      // max_connections=100 across the whole ecosystem, and this value is per pod.
      // Production pins it lower still via DB_POOL_MAX in the deployment manifest.
      connection_limit: this.configService.get<number>('DB_POOL_MAX', 10),
      pool_timeout: this.configService.get<number>('DB_POOL_TIMEOUT', 10),
      statement_cache_size: this.configService.get<number>('DB_STATEMENT_CACHE_SIZE', 1000),
      pgbouncer: this.configService.get<boolean>('DB_USE_PGBOUNCER', false),
    };

    // Add connection pool parameters to URL
    const url = new URL(baseUrl);
    Object.entries(poolConfig).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    // Update the datasource URL
    process.env.DATABASE_URL = url.toString();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');

      // Test connection and warm up pool
      await this.$executeRaw`SELECT 1`;

      // Log pool configuration
      const poolStats = await this.$queryRaw`
        SELECT
          setting as max_connections,
          (SELECT count(*) FROM pg_stat_activity) as current_connections
        FROM pg_settings
        WHERE name = 'max_connections';
      `;
      this.logger.log('Database pool stats:', poolStats);
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  // Middleware for query logging
  private loggingMiddleware: Prisma.Middleware = async (params, next) => {
    const before = Date.now();
    const result = await next(params);
    const after = Date.now();

    this.logger.debug({
      model: params.model,
      action: params.action,
      duration: `${after - before}ms`,
    });

    return result;
  };

  // Middleware for automatic retries
  private retryMiddleware: Prisma.Middleware = async (params, next) => {
    let lastError: Error | undefined;

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await next(params);
      } catch (error: unknown) {
        lastError = error as Error;

        // Only retry on connection errors
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'P1001' || // Can't reach database
            error.code === 'P1002' || // Database timeout
            error.message?.includes('connection'))
        ) {
          this.logger.warn(`Database operation failed, retry ${i + 1}/${this.maxRetries}`);
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * (i + 1)));
          continue;
        }

        // Don't retry other errors
        throw error;
      }
    }

    throw lastError;
  };

  // Middleware for performance monitoring
  private performanceMiddleware: Prisma.Middleware = async (params, next) => {
    const threshold = 1000; // 1 second
    const before = Date.now();

    try {
      const result = await next(params);
      const duration = Date.now() - before;

      if (duration > threshold) {
        this.logger.warn({
          message: 'Slow query detected',
          model: params.model,
          action: params.action,
          duration: `${duration}ms`,
          args: params.args,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - before;
      this.logger.error({
        message: 'Query failed',
        model: params.model,
        action: params.action,
        duration: `${duration}ms`,
        error,
      });
      throw error;
    }
  };

  // Middleware for tenant isolation
  private tenantIsolationMiddleware: Prisma.Middleware = async (params, next) => {
    // Skip for internal operations
    if (!params.model || params.model === 'Tenant') {
      return next(params);
    }

    // Get tenant ID from context (set by TenantContextMiddleware)
    const tenantId = (params as PrismaMiddlewareParams).__tenantId;

    if (!tenantId) {
      // Skip tenant filtering for auth-related models
      const authModels = ['User', 'Session', 'ApiKey'];
      if (authModels.includes(params.model)) {
        return next(params);
      }

      this.logger.warn(`No tenant ID provided for ${params.model}.${params.action}`);
      return next(params);
    }

    // Add tenant filter to all operations
    if (params.action === 'findUnique' || params.action === 'findFirst') {
      params.args.where = { ...params.args.where, tenantId };
    } else if (
      params.action === 'findMany' ||
      params.action === 'count' ||
      params.action === 'aggregate'
    ) {
      params.args.where = { ...params.args.where, tenantId };
    } else if (params.action === 'create') {
      params.args.data = { ...params.args.data, tenantId };
    } else if (params.action === 'createMany') {
      params.args.data = params.args.data.map((item: Record<string, unknown>) => ({
        ...item,
        tenantId,
      }));
    } else if (params.action === 'update') {
      params.args.where = { ...params.args.where, tenantId };
    } else if (params.action === 'updateMany') {
      params.args.where = { ...params.args.where, tenantId };
    } else if (params.action === 'delete') {
      params.args.where = { ...params.args.where, tenantId };
    } else if (params.action === 'deleteMany') {
      params.args.where = { ...params.args.where, tenantId };
    }

    return next(params);
  };

  // Helper method to set tenant context
  withTenant(tenantId: string) {
    return new Proxy(this, {
      get(target, prop) {
        const value = target[prop as keyof PrismaService];
        if (typeof value === 'function') {
          return new Proxy(value, {
            apply(fn, thisArg, args) {
              // Add tenant ID to params
              if (args[0] && typeof args[0] === 'object') {
                (args[0] as PrismaMiddlewareParams).__tenantId = tenantId;
              }
              return (fn as (...args: unknown[]) => unknown).apply(thisArg, args);
            },
          });
        }
        return value;
      },
    }) as PrismaService;
  }

  // Query helpers for common patterns
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async getConnectionStats() {
    const stats = await this.$queryRaw<ConnectionStats[]>`
      SELECT
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting_connections,
        max(EXTRACT(EPOCH FROM (now() - query_start))) as longest_query_seconds
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid();
    `;
    return stats[0];
  }
}
