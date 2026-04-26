import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { ConfigService } from '@nestjs/config';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  duration?: number;
  timestamp: string;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: HealthCheck[];
  uptime: number;
  version: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async getHealthStatus(): Promise<HealthStatus> {
    // const startTime = Date.now(); // Future use for response time metrics
    const checks: HealthCheck[] = [];

    // Database health check
    const dbCheck = await this.checkDatabase();
    checks.push(dbCheck);

    // Redis health check
    const redisCheck = await this.checkRedis();
    checks.push(redisCheck);

    // Memory health check
    const memoryCheck = await this.checkMemory();
    checks.push(memoryCheck);

    // Disk space check
    const diskCheck = await this.checkDisk();
    checks.push(diskCheck);

    // External services check
    const externalCheck = await this.checkExternalServices();
    checks.push(externalCheck);

    // Overall status
    const overallStatus = this.determineOverallStatus(checks);

    return {
      status: overallStatus,
      checks,
      uptime: process.uptime(),
      version: this.configService.get('APP_VERSION', 'unknown'),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - startTime;

      return {
        name: 'database',
        status: duration < 100 ? 'healthy' : 'degraded',
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        message: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Check if Redis is connected instead of ping (which doesn't exist in our RedisService)
      const isConnected = await this.redis.isConnected();
      if (!isConnected) throw new Error('Redis not connected');
      const duration = Date.now() - startTime;

      return {
        name: 'redis',
        status: duration < 50 ? 'healthy' : 'degraded',
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        message: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkMemory(): Promise<HealthCheck> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message: string | undefined;

    if (heapUsagePercent > 90) {
      status = 'unhealthy';
      message = `High memory usage: ${heapUsagePercent.toFixed(1)}%`;
    } else if (heapUsagePercent > 75) {
      status = 'degraded';
      message = `Elevated memory usage: ${heapUsagePercent.toFixed(1)}%`;
    }

    return {
      name: 'memory',
      status,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDisk(): Promise<HealthCheck> {
    try {
      const { promises: fs } = await import('fs');

      // Check if we can access the filesystem
      await fs.access('.', fs.constants.R_OK | fs.constants.W_OK);

      return {
        name: 'disk',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: 'disk',
        status: 'unhealthy',
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkExternalServices(): Promise<HealthCheck> {
    // This could check external APIs like Stripe, AWS services, etc.
    // For now, we'll just return healthy
    return {
      name: 'external_services',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
    const hasUnhealthy = checks.some((check) => check.status === 'unhealthy');
    const hasDegraded = checks.some((check) => check.status === 'degraded');

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }
}
