# Developer Guide: Route Management

> Complete guide for developers working with routes in Cotiza Studio
> Version: 1.0.0 | Last Updated: 2025-01-26

## Table of Contents

- [Quick Start](#quick-start)
- [Adding New Routes](#adding-new-routes)
- [Route Security](#route-security)
- [Testing Routes](#testing-routes)
- [Performance Optimization](#performance-optimization)
- [Debugging Routes](#debugging-routes)
- [Best Practices](#best-practices)

## Quick Start

### Understanding Our Route Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (Next.js)            │
│  ┌────────────┐      ┌──────────────┐  │
│  │  App Router │──────│ API Routes   │  │
│  └────────────┘      └──────────────┘  │
└─────────────────┬───────────────────────┘
                  │ HTTP/REST
┌─────────────────▼───────────────────────┐
│           Backend (NestJS)              │
│  ┌────────────┐      ┌──────────────┐  │
│  │ Controllers│──────│  Services    │  │
│  └────────────┘      └──────────────┘  │
└──────────────────────────────────────────┘
```

### Development Setup

```bash
# Install dependencies
npm install

# Start development servers
npm run dev

# Frontend only (port 3002)
npm run dev -- --filter=@madfam/web

# Backend only (port 4000)
npm run dev -- --filter=@madfam/api

# Run route tests
npm run test:routes
```

## Adding New Routes

### Backend Route (NestJS)

#### Step 1: Create Controller

```typescript
// apps/api/src/modules/products/products.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Roles('admin', 'manager')
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
```

#### Step 2: Create DTOs

```typescript
// apps/api/src/modules/products/dto/create-product.dto.ts
import { IsString, IsNumber, IsEnum, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: 'Product name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Product price', minimum: 0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Product category',
    enum: ['3D_PRINT', 'CNC', 'LASER'],
  })
  @IsEnum(['3D_PRINT', 'CNC', 'LASER'])
  category: string;
}
```

#### Step 3: Create Service

```typescript
// apps/api/src/modules/products/products.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CacheService } from '@/cache/cache.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: dto,
    });

    // Invalidate cache
    await this.cache.del('products:*');

    return product;
  }

  async findOne(id: string) {
    // Check cache first
    const cached = await this.cache.get(`product:${id}`);
    if (cached) return cached;

    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Cache for 5 minutes
    await this.cache.set(`product:${id}`, product, 300);

    return product;
  }
}
```

#### Step 4: Register Module

```typescript
// apps/api/src/modules/products/products.module.ts
import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

// Register in app.module.ts
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [
    // ... other modules
    ProductsModule,
  ],
})
export class AppModule {}
```

### Frontend Route (Next.js)

#### Step 1: Create Page Component

```typescript
// apps/web/src/app/products/page.tsx
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ProductList } from '@/components/products/ProductList';

export const metadata: Metadata = {
  title: 'Products | Cotiza Studio',
  description: 'Browse our products catalog'
};

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Products</h1>
      <ProductList />
    </div>
  );
}
```

#### Step 2: Create Loading State

```typescript
// apps/web/src/app/products/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Skeleton className="h-10 w-48 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
```

#### Step 3: Create Error Boundary

```typescript
// apps/web/src/app/products/error.tsx
'use client';

export default function ProductsError({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-red-800 text-xl font-semibold mb-2">
          Something went wrong!
        </h2>
        <p className="text-red-600 mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

#### Step 4: Create API Client

```typescript
// apps/web/src/lib/api/products.ts
import { apiClient } from '@/lib/api-client';

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

export const productsApi = {
  async list(params?: { page?: number; limit?: number }) {
    const response = await apiClient.get<{ data: Product[] }>('/products', {
      params,
    });
    return response.data;
  },

  async get(id: string) {
    const response = await apiClient.get<Product>(`/products/${id}`);
    return response.data;
  },

  async create(data: Omit<Product, 'id'>) {
    const response = await apiClient.post<Product>('/products', data);
    return response.data;
  },
};
```

## Route Security

### Authentication Guards

```typescript
// Backend: Protect routes with guards
@UseGuards(JwtAuthGuard)
@Controller('protected')
export class ProtectedController {
  // All routes in this controller require authentication
}

// Frontend: Protect pages with middleware
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token && request.nextUrl.pathname.startsWith('/protected')) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
}

export const config = {
  matcher: ['/protected/:path*'],
};
```

### Role-Based Access Control

```typescript
// Backend: Role decorator
@Roles('admin', 'manager')
@UseGuards(JwtAuthGuard, RolesGuard)
@Post('admin-action')
async adminAction() {
  // Only admin and manager can access
}

// Frontend: Role check in component
export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== 'admin') {
    return <AccessDenied />;
  }

  return <AdminDashboard />;
}
```

### Rate Limiting

```typescript
// Backend: Apply rate limiting
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 10
    })
  ]
})
export class AppModule {}

@UseGuards(ThrottlerGuard)
@Controller('api')
export class ApiController {}

// Custom rate limit
@Throttle(5, 60) // 5 requests per 60 seconds
@Post('sensitive-action')
async sensitiveAction() {}
```

## Testing Routes

### Backend Route Tests

```typescript
// apps/api/src/modules/products/products.controller.spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ProductsModule } from './products.module';

describe('ProductsController', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProductsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    authToken = loginResponse.body.accessToken;
  });

  describe('GET /products', () => {
    it('should return products list', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should reject unauthorized requests', async () => {
      await request(app.getHttpServer()).get('/products').expect(401);
    });
  });

  describe('POST /products', () => {
    it('should create a product', async () => {
      const productData = {
        name: 'Test Product',
        price: 99.99,
        category: '3D_PRINT',
      };

      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(productData)
        .expect(201);

      expect(response.body).toMatchObject(productData);
      expect(response.body).toHaveProperty('id');
    });

    it('should validate input', async () => {
      const invalidData = {
        name: '', // Invalid: empty
        price: -10, // Invalid: negative
        category: 'INVALID', // Invalid: not in enum
      };

      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Frontend Route Tests

```typescript
// apps/web/src/app/products/__tests__/page.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import ProductsPage from '../page';
import { productsApi } from '@/lib/api/products';

jest.mock('next/navigation');
jest.mock('@/lib/api/products');

describe('ProductsPage', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  it('should render products list', async () => {
    const mockProducts = [
      { id: '1', name: 'Product 1', price: 99.99, category: '3D_PRINT' },
      { id: '2', name: 'Product 2', price: 149.99, category: 'CNC' },
    ];

    (productsApi.list as jest.Mock).mockResolvedValue({
      data: mockProducts,
    });

    render(await ProductsPage());

    await waitFor(() => {
      expect(screen.getByText('Product 1')).toBeInTheDocument();
      expect(screen.getByText('Product 2')).toBeInTheDocument();
    });
  });

  it('should handle errors gracefully', async () => {
    (productsApi.list as jest.Mock).mockRejectedValue(new Error('Failed to fetch products'));

    render(await ProductsPage());

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });
});
```

### E2E Route Tests

```typescript
// e2e/products.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Products Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should navigate to products page', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveTitle(/Products/);

    // Check if products are loaded
    await expect(page.locator('.product-card')).toHaveCount(6);
  });

  test('should create new product', async ({ page }) => {
    await page.goto('/products/new');

    // Fill form
    await page.fill('[name="name"]', 'Test Product');
    await page.fill('[name="price"]', '99.99');
    await page.selectOption('[name="category"]', '3D_PRINT');

    // Submit
    await page.click('[type="submit"]');

    // Should redirect to product detail
    await expect(page).toHaveURL(/\/products\/[\w-]+/);
    await expect(page.locator('h1')).toContainText('Test Product');
  });

  test('should handle validation errors', async ({ page }) => {
    await page.goto('/products/new');

    // Submit empty form
    await page.click('[type="submit"]');

    // Check for validation messages
    await expect(page.locator('.error-message')).toContainText('Name is required');
    await expect(page.locator('.error-message')).toContainText('Price is required');
  });
});
```

## Performance Optimization

### Route Prefetching

```typescript
// Frontend: Prefetch routes
import Link from 'next/link';

// Automatic prefetching
<Link href="/products" prefetch={true}>
  Products
</Link>

// Manual prefetching
import { useRouter } from 'next/navigation';

const router = useRouter();
router.prefetch('/products');
```

### Data Caching

```typescript
// Backend: Cache responses
@Get()
@CacheKey('products-list')
@CacheTTL(300) // 5 minutes
async list() {
  return this.productsService.findAll();
}

// Frontend: Use React Query
import { useQuery } from '@tanstack/react-query';

function ProductList() {
  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: productsApi.list,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000 // 10 minutes
  });
}
```

### Bundle Optimization

```typescript
// Dynamic imports for code splitting
const ProductDetail = dynamic(
  () => import('@/components/products/ProductDetail'),
  {
    loading: () => <ProductDetailSkeleton />,
    ssr: false
  }
);

// Route-based code splitting (automatic in Next.js App Router)
// Each page.tsx creates a separate bundle
```

### API Response Optimization

```typescript
// Backend: Use field selection
@Get(':id')
async findOne(
  @Param('id') id: string,
  @Query('fields') fields?: string
) {
  const select = fields?.split(',').reduce((acc, field) => {
    acc[field] = true;
    return acc;
  }, {});

  return this.prisma.product.findUnique({
    where: { id },
    select: select || undefined
  });
}

// Frontend: Request only needed fields
const product = await apiClient.get(
  `/products/${id}?fields=id,name,price`
);
```

## Debugging Routes

### Debug Logging

```typescript
// Backend: Enable debug logging
import { Logger } from '@nestjs/common';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  async create(dto: CreateProductDto) {
    this.logger.debug(`Creating product: ${JSON.stringify(dto)}`);

    try {
      const product = await this.prisma.product.create({ data: dto });
      this.logger.log(`Product created: ${product.id}`);
      return product;
    } catch (error) {
      this.logger.error(`Failed to create product: ${error.message}`);
      throw error;
    }
  }
}

// Frontend: Debug logging
if (process.env.NODE_ENV === 'development') {
  console.log('[ProductsPage] Rendering with props:', props);
}
```

### Route Inspection

```bash
# List all NestJS routes
npm run nest routes

# Output:
# [Nest] Routes:
# ProductsController:
#   POST    /products
#   GET     /products/:id
#   PATCH   /products/:id
#   DELETE  /products/:id
```

### Performance Profiling

```typescript
// Backend: Performance interceptor
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        console.log(`${request.method} ${request.url} - ${duration}ms`);
      }),
    );
  }
}

// Frontend: Performance monitoring
export function measurePageLoad() {
  if (typeof window !== 'undefined') {
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    console.log(`Page load time: ${pageLoadTime}ms`);
  }
}
```

## Best Practices

### 1. Route Naming Conventions

```typescript
// RESTful naming
GET    /products          // List
GET    /products/:id      // Get one
POST   /products          // Create
PATCH  /products/:id      // Update
DELETE /products/:id      // Delete

// Action-based naming
POST   /products/:id/publish
POST   /products/:id/archive
GET    /products/:id/analytics
```

### 2. Error Handling

```typescript
// Consistent error responses
interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  path: string;
}

// Global exception filter
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const error: ApiError = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(500).json({ error });
  }
}
```

### 3. Documentation

```typescript
// Always document your routes
@ApiOperation({
  summary: 'Create a new product',
  description: 'Creates a new product with the provided details'
})
@ApiBody({
  type: CreateProductDto,
  description: 'Product creation data'
})
@ApiResponse({
  status: 201,
  description: 'Product created successfully',
  type: Product
})
@ApiResponse({
  status: 400,
  description: 'Invalid input data'
})
@Post()
async create(@Body() dto: CreateProductDto) {}
```

### 4. Validation

```typescript
// Use DTOs with class-validator
export class CreateProductDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @ApiProperty({
    minLength: 3,
    maxLength: 100,
    example: 'Carbon Fiber Part',
  })
  name: string;

  @IsNumber()
  @Min(0)
  @Max(999999)
  @ApiProperty({
    minimum: 0,
    maximum: 999999,
    example: 99.99,
  })
  price: number;
}
```

### 5. Testing Coverage

```bash
# Ensure good test coverage
npm run test:cov

# Coverage targets:
# - Controllers: >90%
# - Services: >85%
# - Critical paths: 100%
```

## Troubleshooting

### Common Issues

1. **Route Not Found (404)**

   - Check route registration in module
   - Verify path spelling and parameters
   - Check middleware order

2. **Authentication Failures (401)**

   - Verify token is included in headers
   - Check token expiration
   - Validate auth guard configuration

3. **Permission Denied (403)**

   - Check role requirements
   - Verify user has required role
   - Check tenant context

4. **Validation Errors (400)**

   - Review DTO validation rules
   - Check request body format
   - Validate data types

5. **Server Errors (500)**
   - Check logs for stack trace
   - Verify database connections
   - Check for unhandled exceptions

### Debug Commands

```bash
# Check route registration
npm run nest routes

# Test specific route
curl -X GET http://localhost:4000/products \
  -H "Authorization: Bearer $TOKEN"

# Run route tests
npm run test:routes

# Check route performance
npm run test:perf -- --route=/products

# Validate OpenAPI spec
npm run validate:openapi
```

---

_Developer Guide Version: 1.0.0 | Last Updated: 2025-01-26_
