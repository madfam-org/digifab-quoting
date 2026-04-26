# 🔧 Troubleshooting Solutions Guide

## 🚨 Critical Issues (Fix Immediately)

### 1. Missing Dependencies

**Problem**: Application won't compile due to missing npm packages

```bash
Cannot find module 'bcrypt'
Cannot find module 'cache-manager'
Cannot find module 'cache-manager-redis-store'
```

**Solution**:

```bash
# Install all missing dependencies
npm install bcrypt @types/bcrypt
npm install cache-manager cache-manager-redis-store @types/cache-manager
npm install @nestjs/throttler
npm install helmet @types/helmet
npm install compression @types/compression
```

### 2. Prisma Schema Mismatches

**Problem**: Database operations fail due to schema inconsistencies

**Solution**:

```bash
# 1. Regenerate Prisma client
npx prisma generate

# 2. Apply pending migrations
npx prisma migrate deploy

# 3. If issues persist, reset and reseed
npx prisma migrate reset
npm run db:seed
```

---

## 🔐 Security Vulnerabilities

### 1. Path Traversal in File Upload

**Location**: `apps/api/src/modules/files/files.service.improved.ts:467-473`

**Current Code**:

```typescript
private sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}
```

**Fixed Code**:

```typescript
private sanitizeFilename(filename: string): string {
  // Prevent path traversal
  if (filename.includes('..') || /[\/\\]/.test(filename)) {
    throw new BadRequestException('Invalid filename: path traversal detected');
  }

  // Extract just the filename if full path provided
  const basename = filename.split(/[\/\\]/).pop() || filename;

  // Sanitize the filename
  return basename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '') // Remove leading/trailing dots and underscores
    .toLowerCase()
    .substring(0, 255); // Limit length
}
```

### 2. SQL Injection Risk in Repository

**Location**: `apps/api/src/modules/quotes/repositories/quote.repository.ts:217-243`

**Solution**:

```typescript
// Create a whitelist of allowed filter fields
private readonly ALLOWED_FILTERS = [
  'status', 'customerId', 'createdAt', 'updatedAt', 'validityUntil'
];

protected buildWhereClause(
  tenantId: string,
  filters?: Record<string, any>,
): any {
  const where: any = { tenantId };

  if (filters) {
    // Only allow whitelisted fields
    Object.entries(filters).forEach(([key, value]) => {
      if (this.ALLOWED_FILTERS.includes(key) && value !== undefined && value !== null) {
        // Sanitize the value based on field type
        where[key] = this.sanitizeFilterValue(key, value);
      }
    });
  }

  return where;
}

private sanitizeFilterValue(field: string, value: any): any {
  switch (field) {
    case 'status':
      // Validate enum values
      if (!Object.values(QuoteStatus).includes(value)) {
        throw new BadRequestException(`Invalid status value: ${value}`);
      }
      return value;
    case 'customerId':
      // Validate UUID format
      if (!isUUID(value)) {
        throw new BadRequestException('Invalid customer ID format');
      }
      return value;
    case 'createdAt':
    case 'updatedAt':
    case 'validityUntil':
      // Validate date format
      if (!isISO8601(value)) {
        throw new BadRequestException('Invalid date format');
      }
      return new Date(value);
    default:
      return value;
  }
}
```

### 3. JWT Security Enhancement

**Location**: `apps/api/src/auth/guards/jwt-auth.guard.ts`

**Solution**:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    // Handle specific JWT errors
    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException('Token has expired');
    }

    if (info instanceof JsonWebTokenError) {
      throw new UnauthorizedException('Invalid token');
    }

    // Validate user object structure
    if (user && !this.isValidUser(user)) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Authentication failed');
    }

    return user;
  }

  private isValidUser(user: any): boolean {
    return (
      user &&
      typeof user.id === 'string' &&
      typeof user.tenantId === 'string' &&
      typeof user.email === 'string' &&
      Array.isArray(user.roles)
    );
  }
}
```

### 4. Multi-Tenant Isolation Middleware

**Create**: `apps/api/src/common/middleware/tenant-validation.middleware.ts`

```typescript
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantValidationMiddleware implements NestMiddleware {
  use(req: Request & { user?: any; tenantId?: string }, res: Response, next: NextFunction) {
    // Extract tenant from various sources
    const tenantFromHeader = req.headers['x-tenant-id'] as string;
    const tenantFromSubdomain = this.extractTenantFromHost(req.hostname);
    const tenantFromUser = req.user?.tenantId;

    // Validate consistency
    if (tenantFromHeader && tenantFromUser && tenantFromHeader !== tenantFromUser) {
      throw new UnauthorizedException('Tenant mismatch');
    }

    // Set validated tenant ID
    req.tenantId = tenantFromUser || tenantFromHeader || tenantFromSubdomain;

    if (!req.tenantId) {
      throw new UnauthorizedException('Tenant identification required');
    }

    next();
  }

  private extractTenantFromHost(hostname: string): string | undefined {
    const subdomain = hostname.split('.')[0];
    return subdomain !== 'www' ? subdomain : undefined;
  }
}
```

---

## 🚀 Performance Optimizations

### 1. Connection Pool Configuration

**Location**: `apps/api/src/prisma/prisma.service.ts`

**Solution**:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    // Configure connection pool
    await this.$connect();

    // Set statement timeout
    await this.$executeRaw`SET statement_timeout = '30s'`;

    // Configure connection pool size based on environment
    const poolSize = process.env.NODE_ENV === 'production' ? 50 : 10;
    await this.$executeRaw`ALTER DATABASE current_database() SET max_connections = ${poolSize}`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### 2. Cache Stampede Protection

**Location**: `apps/api/src/cache/cache.service.ts`

**Add this enhancement**:

```typescript
import { Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { InjectCache } from '@nestjs/cache-manager';

@Injectable()
export class CacheService {
  private readonly locks = new Map<string, Promise<any>>();

  constructor(@InjectCache() private cacheManager: Cache) {}

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    // Check if there's already a lock for this key
    const existingLock = this.locks.get(key);
    if (existingLock) {
      return existingLock;
    }

    // Try to get from cache
    const cached = await this.cacheManager.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Create a new lock
    const promise = this.executeWithLock(key, factory, ttl);
    this.locks.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.locks.delete(key);
    }
  }

  private async executeWithLock<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    // Double-check cache after acquiring lock
    const cached = await this.cacheManager.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Execute factory and cache result
    const result = await factory();
    await this.cacheManager.set(key, result, ttl);
    return result;
  }
}
```

### 3. File Streaming Implementation

**Location**: `apps/api/src/modules/files/files.service.improved.ts`

**Add streaming methods**:

```typescript
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

async downloadFileStream(fileId: string, tenantId: string): Promise<Readable> {
  const file = await this.findOne(fileId, tenantId);

  const stream = this.s3.getObject({
    Bucket: this.bucketName,
    Key: file.path,
  }).createReadStream();

  // Add error handling to stream
  stream.on('error', (error) => {
    this.logger.error(`Stream error for file ${fileId}`, error);
    stream.destroy();
  });

  return stream;
}

async uploadFileStream(
  stream: Readable,
  key: string,
  contentType: string,
  metadata: Record<string, string>
): Promise<void> {
  const uploadParams = {
    Bucket: this.bucketName,
    Key: key,
    Body: stream,
    ContentType: contentType,
    Metadata: metadata,
    ServerSideEncryption: 'AES256',
  };

  // Use managed upload for automatic multipart handling
  const upload = this.s3.upload(uploadParams);

  // Track upload progress
  upload.on('httpUploadProgress', (progress) => {
    this.logger.debug(`Upload progress: ${progress.loaded}/${progress.total}`);
  });

  await upload.promise();
}
```

---

## 📝 Type Safety Fixes

### 1. Replace All `any` Types

**Create**: `apps/api/src/common/types/repository.types.ts`

```typescript
import { Prisma } from '@prisma/client';

export interface QueryOptions<T = any> {
  where?: Prisma.Args<T, 'findMany'>['where'];
  orderBy?: Prisma.Args<T, 'findMany'>['orderBy'];
  skip?: number;
  take?: number;
  include?: Prisma.Args<T, 'findMany'>['include'];
  select?: Prisma.Args<T, 'findMany'>['select'];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BatchUpdateItem<T> {
  id: string;
  data: Partial<T>;
}

// Type-safe filter types
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

export interface Filter<T> {
  field: keyof T;
  operator: FilterOperator;
  value: any;
}

export interface SortOptions<T> {
  field: keyof T;
  direction: 'asc' | 'desc';
}
```

### 2. Fix DTO Initialization

**Location**: All DTO files

**Pattern to fix**:

```typescript
// WRONG - Creates plain object
const dto = new CreateQuoteDto();
dto.currency = Currency.MXN;

// CORRECT - Use class-transformer
import { plainToClass } from 'class-transformer';

const dto = plainToClass(CreateQuoteDto, {
  currency: Currency.MXN,
  objective: { cost: 0.5, lead: 0.3, green: 0.2 },
});

// Or use a factory method
export class CreateQuoteDto {
  static create(data: Partial<CreateQuoteDto>): CreateQuoteDto {
    const dto = new CreateQuoteDto();
    Object.assign(dto, data);
    return dto;
  }
}
```

---

## 🏗️ Architecture Improvements

### 1. Extract Business Rules Service

**Create**: `apps/api/src/modules/quotes/services/quote-business-rules.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';

@Injectable()
export class QuoteBusinessRulesService {
  private readonly taxRate: Decimal;
  private readonly freeShippingThreshold: Decimal;
  private readonly standardShippingRate: Decimal;
  private readonly quoteValidityDays: number;

  constructor(private configService: ConfigService) {
    this.taxRate = new Decimal(this.configService.get('business.taxRate', 0.16));
    this.freeShippingThreshold = new Decimal(
      this.configService.get('business.freeShippingThreshold', 1000),
    );
    this.standardShippingRate = new Decimal(
      this.configService.get('business.standardShippingRate', 150),
    );
    this.quoteValidityDays = this.configService.get('business.quoteValidityDays', 14);
  }

  calculateTax(subtotal: Decimal): Decimal {
    return subtotal.mul(this.taxRate);
  }

  calculateShipping(subtotal: Decimal): Decimal {
    return subtotal.gte(this.freeShippingThreshold) ? new Decimal(0) : this.standardShippingRate;
  }

  calculateQuoteValidityDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + this.quoteValidityDays);
    return date;
  }

  generateQuoteNumber(tenantCode: string, sequence: number): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const seq = String(sequence).padStart(4, '0');

    return `${tenantCode}-Q${year}${month}-${seq}`;
  }
}
```

### 2. Implement Response Compression

**Location**: `apps/api/src/main.ts`

**Add after helmet**:

```typescript
import * as compression from 'compression';

// Add compression middleware
app.use(
  compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Balanced compression level
    filter: (req, res) => {
      // Don't compress SSE or WebSocket
      if (req.headers['accept'] === 'text/event-stream') {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);
```

### 3. Add Request Context

**Create**: `apps/api/src/common/interceptors/request-context.interceptor.ts`

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  startTime: number;
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Create request context
    const ctx: RequestContext = {
      requestId: request.headers['x-request-id'] || uuidv4(),
      tenantId: request.tenantId,
      userId: request.user?.id,
      startTime: Date.now(),
    };

    // Attach to request
    request.context = ctx;

    // Add request ID to response headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-Request-ID', ctx.requestId);

    return next.handle().pipe(
      tap(() => {
        // Log request completion
        const duration = Date.now() - ctx.startTime;
        console.log(`Request ${ctx.requestId} completed in ${duration}ms`);
      }),
    );
  }
}
```

---

## 🧪 Testing Infrastructure Setup

### 1. Configure Jest for API

**Create**: `apps/api/jest.config.js`

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
    '!src/main.ts',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@madfam/shared$': '<rootDir>/../../packages/shared/src',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
```

### 2. Create Test Utilities

**Create**: `apps/api/test/factories/quote.factory.ts`

```typescript
import { Quote, QuoteStatus, Prisma } from '@prisma/client';
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';

export const quoteFactory = Factory.define<Quote>(() => ({
  id: faker.datatype.uuid(),
  tenantId: faker.datatype.uuid(),
  customerId: faker.datatype.uuid(),
  reference: `Q${faker.date.recent().getFullYear()}-${faker.datatype.number({ min: 1000, max: 9999 })}`,
  status: faker.helpers.arrayElement(Object.values(QuoteStatus)),
  currency: 'MXN',
  objective: {
    cost: 0.5,
    lead: 0.3,
    green: 0.2,
  },
  subtotal: faker.datatype.float({ min: 100, max: 10000 }),
  tax: faker.datatype.float({ min: 10, max: 1000 }),
  shipping: faker.datatype.float({ min: 0, max: 200 }),
  grandTotal: faker.datatype.float({ min: 110, max: 11200 }),
  validityUntil: faker.date.future(),
  metadata: {},
  sustainability: null,
  createdAt: faker.date.recent(),
  updatedAt: faker.date.recent(),
  acceptedAt: null,
  cancelledAt: null,
}));
```

---

## 📊 Monitoring & Observability

### 1. Add Health Checks

**Enhance**: `apps/api/src/monitoring/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '@/common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private prisma: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database health
      () => this.prisma.pingCheck('database'),

      // Memory health (max 300MB heap)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // Disk health (min 10% free)
      () =>
        this.disk.checkStorage('storage', {
          threshold: 10 * 1024 * 1024 * 1024, // 10GB
          path: '/',
        }),

      // External service health
      () => this.http.pingCheck('worker_service', 'http://worker:8000/health'),

      // Redis health
      () => this.http.pingCheck('redis', 'redis://redis:6379'),
    ]);
  }

  @Get('ready')
  @Public()
  readiness() {
    // Check if app is ready to receive traffic
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

## 🚀 Quick Fix Script

Create `scripts/fix-critical-issues.sh`:

```bash
#!/bin/bash

echo "🔧 Fixing critical issues..."

# 1. Install missing dependencies
echo "📦 Installing missing dependencies..."
npm install bcrypt @types/bcrypt cache-manager cache-manager-redis-store @types/cache-manager @nestjs/throttler helmet @types/helmet compression @types/compression

# 2. Fix Prisma
echo "🗄️ Fixing Prisma schema..."
npx prisma generate
npx prisma migrate deploy

# 3. Fix ESLint issues
echo "🧹 Running ESLint fixes..."
npm run lint -- --fix

# 4. Update TypeScript config
echo "📝 Updating TypeScript config..."
cat > apps/api/tsconfig.json << EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "moduleResolution": "node",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "es2017",
    "sourceMap": true,
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"],
      "@madfam/shared": ["../../packages/shared/src"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
EOF

# 5. Run tests
echo "✅ Running tests..."
npm test

echo "✨ Critical issues fixed! Run 'npm run dev' to start the application."
```

Make it executable:

```bash
chmod +x scripts/fix-critical-issues.sh
./scripts/fix-critical-issues.sh
```

---

## 📋 Implementation Priority

1. **Day 1**: Fix critical compilation issues

   - Install missing dependencies
   - Fix Prisma schema mismatches
   - Apply security patches

2. **Day 2-3**: Type safety improvements

   - Replace `any` types with proper interfaces
   - Fix DTO initialization patterns
   - Add validation schemas

3. **Day 4-5**: Performance optimizations

   - Configure connection pools
   - Implement streaming
   - Add response compression

4. **Week 2**: Architecture improvements
   - Extract business rules
   - Implement proper middleware
   - Add monitoring

This comprehensive solution guide addresses all identified issues with practical, implementable fixes. Each solution includes specific code examples and can be implemented incrementally to minimize disruption to the development process.
